begin;
select plan(15);

select is(
  (select version.evaluation_status
   from public.prompt_versions version
   join public.prompt_templates template on template.id=version.template_id
   join public.managers manager on manager.id=template.manager_id
   where template.code='planner-agent-report' and manager.code='personal' and version.version=1),
  'approved','the Planner seed is approved only after governed evaluation'
);
select is(
  (select version.evaluation_result
   from public.prompt_versions version
   join public.prompt_templates template on template.id=version.template_id
   join public.managers manager on manager.id=template.manager_id
   where template.code='planner-agent-report' and manager.code='personal' and version.version=1),
  '{"passed":true,"caseCount":24,"managerCount":8,"safetyPassed":true,"evidencePassed":true,"toolAuthorityPassed":true,"schemaPassed":true,"costPassed":true,"latencyPassed":true}'::jsonb,
  'the Planner seed stores the exact passing 24-case, eight-manager evaluator result'
);
select is(
  (select template.active_version
   from public.prompt_templates template
   join public.managers manager on manager.id=template.manager_id
   where template.code='planner-agent-report' and manager.code='personal'),
  1,'the evaluated Planner seed is the active prompt version'
);

create temporary table ai17_planner_fixture_owner (
  user_id uuid not null,
  email text not null
) on commit drop;

do $fixture$
declare
  target_email text;
  target_user_id uuid;
begin
  select (regexp_match(pg_get_constraintdef(oid), $pattern$'([^']+)'$pattern$))[1]
  into target_email
  from pg_constraint
  where conrelid = 'public.app_users'::regclass
    and conname = 'app_users_email_check';
  select id into target_user_id
  from public.app_users
  where lower(email) = lower(target_email);
  if target_user_id is null then
    select id into target_user_id
    from auth.users
    where lower(email) = lower(target_email)
    limit 1;
    if target_user_id is null then
      target_user_id := '00000000-0000-4000-8000-000000000317';
      insert into auth.users (
        instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000',target_user_id,
        'authenticated','authenticated',target_email,
        crypt('synthetic-only',gen_salt('bf')),now(),'{}'::jsonb,'{}'::jsonb,
        now(),now()
      );
    end if;
    insert into public.app_users(id,email,is_allowed)
    values (target_user_id,target_email,true)
    on conflict (id) do update set is_allowed=true;
  end if;
  insert into ai17_planner_fixture_owner values (target_user_id,target_email);
end;
$fixture$;

insert into public.workflow_runs (
  id,user_id,workflow_definition_id,status,trigger,idempotency_key
)
select
  '00000000-0000-4000-8000-000000000318',
  (select user_id from ai17_planner_fixture_owner),
  definition.id,'running','on_demand','ai17-planner-source-run'
from public.workflow_definitions definition
join public.managers manager on manager.id=definition.manager_id
where definition.code='personal-on-demand-plan' and manager.code='personal'
on conflict (id) do nothing;

insert into public.workflow_runs (
  id,user_id,workflow_definition_id,status,trigger,idempotency_key
)
select
  '00000000-0000-4000-8000-000000000319',
  (select user_id from ai17_planner_fixture_owner),
  definition.id,'queued','inter_agent_request','ai17-planner-child-run'
from public.workflow_definitions definition
join public.managers manager on manager.id=definition.manager_id
where definition.code='travel-on-demand-plan' and manager.code='travel'
on conflict (id) do nothing;

insert into public.job_queue (
  user_id,run_id,job_type,payload,attempt_count,status,deduplication_key
) values (
  (select user_id from ai17_planner_fixture_owner),
  '00000000-0000-4000-8000-000000000318','workflow_execute',
  '{"request":{"purpose":"Plan a short trip","constraints":"Use existing evidence only."}}'::jsonb,
  1,'awaiting_provider','ai17-planner-source-job'
) on conflict (deduplication_key) do nothing;

insert into public.on_demand_budgets (
  user_id,run_id,manager_code,hard_cap,model_ceiling,search_ceiling,expires_at
) values (
  (select user_id from ai17_planner_fixture_owner),
  '00000000-0000-4000-8000-000000000318','personal',0.25,
  'gpt-5.6-luna',0,now()+interval '1 hour'
);

select public.reserve_instrumented_ai_call(
  (select user_id from ai17_planner_fixture_owner),
  '00000000-0000-4000-8000-000000000318',
  (select id from public.ai_model_catalog where model_id='gpt-5.6-luna'),
  (select version.id
   from public.prompt_versions version
   join public.prompt_templates template on template.id=version.template_id
   join public.managers manager on manager.id=template.manager_id
   where template.code='planner-agent-report' and manager.code='personal'
     and version.version=1),
  0.10,'ai17:planner:source-job:attempt:1',
  '{"workflow":"personal-on-demand-plan","evidence_ids":[],"allowed_action_types":[]}'::jsonb
);
select public.mark_instrumented_ai_call_submitted(
  (select id from public.ai_calls where run_id='00000000-0000-4000-8000-000000000318'),
  'resp_ai17planner123'
);
insert into public.job_provider_submissions (
  response_id,job_id,attempt_count,status,submitted_at,expires_at
)
select 'resp_ai17planner123',job.id,1,'awaiting_provider',now(),now()+interval '10 minutes'
from public.job_queue job where job.deduplication_key='ai17-planner-source-job'
on conflict (response_id) do nothing;

insert into public.inter_agent_requests (
  id,user_id,source_manager_code,destination_manager_code,status,objective,
  required_output_contract,idempotency_key,source_run_id,correlation_id,
  destination_workflow_definition_id,destination_run_id,delegation_depth,routing_path
)
select
  '00000000-0000-4000-8000-000000000320',
  (select user_id from ai17_planner_fixture_owner),
  'personal','travel','accepted','Plan a short trip using approved evidence.',
  '{"type":"object","required":["summary","itinerary"]}'::jsonb,
  'ai17-planner-specialist-request',
  '00000000-0000-4000-8000-000000000318',
  source.correlation_id,
  destination.id,
  '00000000-0000-4000-8000-000000000319',
  1,array['personal','travel']::text[]
from public.workflow_runs source
cross join public.workflow_definitions destination
join public.managers manager on manager.id=destination.manager_id
where source.id='00000000-0000-4000-8000-000000000318'
  and destination.code='travel-on-demand-plan' and manager.code='travel'
on conflict (id) do nothing;

select throws_ok(
  $$select public.complete_inter_agent_plan_with_queue(
    (select id from public.job_queue where deduplication_key='ai17-planner-source-job'),
    'resp_ai17planner123',
    (select id from public.ai_calls where run_id='00000000-0000-4000-8000-000000000318'),
    '00000000-0000-4000-8000-000000000321',
    0.02,100,40,0,0,
    '{"input_tokens":100,"output_tokens":40,"cached_input_tokens":0,"cache_write_tokens":0,"reasoning_tokens":0,"search_calls":0}'::jsonb,
    '{"response_id":"resp_ai17planner123","validation_passed":true}'::jsonb
  )$$,
  'P0001','planner_specialist_request_missing',
  'a missing specialist request cannot settle the Planner response'
);
select is(
  (select status from public.ai_calls where run_id='00000000-0000-4000-8000-000000000318'),
  'submitted','rejected delegation leaves the reserved AI call recoverable'
);
select is(
  (select status::text from public.job_queue where deduplication_key='ai17-planner-source-job'),
  'awaiting_provider','rejected delegation leaves its provider job recoverable'
);

select lives_ok(
  $$select public.complete_inter_agent_plan_with_queue(
    (select id from public.job_queue where deduplication_key='ai17-planner-source-job'),
    'resp_ai17planner123',
    (select id from public.ai_calls where run_id='00000000-0000-4000-8000-000000000318'),
    '00000000-0000-4000-8000-000000000320',
    0.02,100,40,0,0,
    '{"input_tokens":100,"output_tokens":40,"cached_input_tokens":0,"cache_write_tokens":0,"reasoning_tokens":0,"search_calls":0}'::jsonb,
    '{"response_id":"resp_ai17planner123","validation_passed":true}'::jsonb
  )$$,
  'a valid Planner delegation settles usage and completes its provider job atomically'
);
select is(
  (select status from public.ai_calls where run_id='00000000-0000-4000-8000-000000000318'),
  'succeeded','the Planner provider call settles once'
);
select is(
  (select status::text from public.job_queue where deduplication_key='ai17-planner-source-job'),
  'succeeded','the Planner provider queue job completes'
);
select is(
  (select status::text from public.job_provider_submissions where response_id='resp_ai17planner123'),
  'succeeded','the exact provider submission is marked complete'
);
select is(
  (select status::text from public.workflow_runs where id='00000000-0000-4000-8000-000000000318'),
  'waiting_for_dependency','the Planner run waits for the persisted Travel specialist result'
);
select is(
  (select count(*)::integer from public.reports where run_id='00000000-0000-4000-8000-000000000318'),
  0,'a delegation step does not fabricate the consolidated report'
);
select is(
  (select actual_amount from public.on_demand_budgets where run_id='00000000-0000-4000-8000-000000000318'),
  0.02::numeric,'the initiating on-demand budget records actual provider cost'
);
select is(
  public.complete_inter_agent_plan_with_queue(
    (select id from public.job_queue where deduplication_key='ai17-planner-source-job'),
    'resp_ai17planner123',
    (select id from public.ai_calls where run_id='00000000-0000-4000-8000-000000000318'),
    '00000000-0000-4000-8000-000000000320',
    0.02,100,40,0,0,
    '{"input_tokens":100,"output_tokens":40,"cached_input_tokens":0,"cache_write_tokens":0,"reasoning_tokens":0,"search_calls":0}'::jsonb,
    '{"response_id":"resp_ai17planner123","validation_passed":true}'::jsonb
  ),true,'a webhook retry replays the completed Planner settlement idempotently'
);
select is(
  (select actual_amount from public.on_demand_budgets where run_id='00000000-0000-4000-8000-000000000318'),
  0.02::numeric,'replay does not charge the initiating budget twice'
);

select * from finish();
rollback;
