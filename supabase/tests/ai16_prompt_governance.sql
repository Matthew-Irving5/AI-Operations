begin;
select plan(9);

select is(
  (select schema_version from public.prompt_versions where evaluation_status = 'approved' and version = 2 limit 1),
  1,
  'existing approved prompt is assigned a schema version'
);
select is(
  (select tool_policy from public.prompt_versions where evaluation_status = 'approved' and version = 2 limit 1),
  '{"version":1,"tools":[]}'::jsonb,
  'existing prompt starts with an explicit empty tool allowlist'
);

select set_config('ai.prompt_governance_rpc', 'on', true);
select throws_ok(
  $$update public.prompt_versions set system_text = 'rewritten' where evaluation_status = 'approved' and version = 2$$,
  'P0001', 'prompt_version_content_is_immutable',
  'versioned prompt content cannot be rewritten even within the governance boundary'
);
select set_config('ai.prompt_governance_rpc', 'off', true);

insert into public.prompt_versions(template_id, version, system_text, developer_text, json_schema, evaluation_status)
select template.id, 9001, 'candidate', 'candidate', version.json_schema, 'draft'
from public.prompt_templates template
join public.managers manager on manager.id = template.manager_id
join public.prompt_versions version on version.template_id = template.id and version.version = 2
where manager.code = 'systems' and template.code = 'controlled-agent-report';
insert into public.prompt_versions(template_id, version, system_text, developer_text, json_schema, evaluation_status)
select template.id, 9002, 'candidate', 'candidate', version.json_schema, 'draft'
from public.prompt_templates template
join public.managers manager on manager.id = template.manager_id
join public.prompt_versions version on version.template_id = template.id and version.version = 2
where manager.code = 'systems' and template.code = 'controlled-agent-report';

select public.record_prompt_evaluation(
  (select id from public.prompt_versions where version = 9001),
  '{"passed":false,"caseCount":24,"managerCount":8,"safetyPassed":false,"evidencePassed":true,"toolAuthorityPassed":true,"schemaPassed":true,"costPassed":true,"latencyPassed":true}'::jsonb
);
select throws_ok(
  $$select public.transition_prompt_version(
    (select template.id from public.prompt_templates template join public.managers manager on manager.id = template.manager_id where manager.code='systems' and template.code='controlled-agent-report'),
    9001, 2, '00000000-0000-0000-0000-000000000101', 'promote', 'ai16-fail-gate-01'
  )$$,
  'P0001', 'prompt_evaluation_gate_failed', 'failed evaluation cannot promote a prompt'
);

select public.record_prompt_evaluation(
  (select id from public.prompt_versions where version = 9002),
  '{"passed":true,"caseCount":24,"managerCount":8,"safetyPassed":true,"evidencePassed":true,"toolAuthorityPassed":true,"schemaPassed":true,"costPassed":true,"latencyPassed":true}'::jsonb
);
select is(
  public.transition_prompt_version(
    (select template.id from public.prompt_templates template join public.managers manager on manager.id = template.manager_id where manager.code='systems' and template.code='controlled-agent-report'),
    9002, 2, '00000000-0000-0000-0000-000000000101', 'promote', 'ai16-promote-0001'
  ) ->> 'active_version',
  '9002', 'passing candidate promotes using optimistic active-version check'
);
select is(
  public.transition_prompt_version(
    (select template.id from public.prompt_templates template join public.managers manager on manager.id = template.manager_id where manager.code='systems' and template.code='controlled-agent-report'),
    9002, 2, '00000000-0000-0000-0000-000000000101', 'promote', 'ai16-promote-0001'
  ) ->> 'replayed',
  'true', 'repeated promotion request returns its recorded result'
);
select is(
  public.transition_prompt_version(
    (select template.id from public.prompt_templates template join public.managers manager on manager.id = template.manager_id where manager.code='systems' and template.code='controlled-agent-report'),
    2, 9002, '00000000-0000-0000-0000-000000000101', 'rollback', 'ai16-rollback-0001'
  ) ->> 'active_version',
  '2', 'rollback restores an approved prior version'
);

insert into public.ai_calls(user_id, prompt_version_id, model_id, status)
select '00000000-0000-0000-0000-000000000101', version.id,
  (select id from public.ai_model_catalog where model_id = 'gpt-5.6-terra'), 'reserved'
from public.prompt_versions version where version.version = 2 limit 1;
select is(
  (select schema_version from public.ai_calls where prompt_version_id = (select id from public.prompt_versions where version = 2 limit 1) order by created_at desc limit 1),
  1,
  'AI call captures its immutable schema version at reservation'
);
select ok(
  not has_function_privilege('anon', 'public.transition_prompt_version(uuid,integer,integer,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.transition_prompt_version(uuid,integer,integer,uuid,text,text)', 'EXECUTE'),
  'prompt transitions are unavailable to direct data API clients'
);

select * from finish();
rollback;
