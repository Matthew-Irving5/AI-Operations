begin;
select plan(5);

select is(
  (
    select template.active_version
    from public.prompt_templates as template
    join public.managers as manager on manager.id = template.manager_id
    where manager.code = 'systems'
      and template.code = 'controlled-agent-report'
  ),
  2,
  'systems report prompt promotes the explicit empty-evidence version'
);

select is(
  (
    select count(*)::integer
    from public.prompt_versions as version
    join public.prompt_templates as template on template.id = version.template_id
    join public.managers as manager on manager.id = template.manager_id
    where manager.code = 'systems'
      and template.code = 'controlled-agent-report'
      and version.version = 1
  ),
  1,
  'previous prompt version remains available for pinned runs'
);

select is(
  (
    select version.evaluation_status
    from public.prompt_versions as version
    join public.prompt_templates as template on template.id = version.template_id
    join public.managers as manager on manager.id = template.manager_id
    where manager.code = 'systems'
      and template.code = 'controlled-agent-report'
      and version.version = 2
  ),
  'approved',
  'new prompt version is approved for the runtime loader'
);

select ok(
  (
    select position('If the supplied evidence list is empty' in version.system_text) > 0
      and position('empty arrays for findings, evidence, recommendations, actions, and alerts' in version.system_text) > 0
      and position('recommendations, actions, and alerts' in version.system_text) > 0
      and position('Include an uncertainty stating evidence is insufficient' in version.system_text) > 0
    from public.prompt_versions as version
    join public.prompt_templates as template on template.id = version.template_id
    join public.managers as manager on manager.id = template.manager_id
    where manager.code = 'systems'
      and template.code = 'controlled-agent-report'
      and version.version = 2
  ),
  'system instructions forbid findings and citations when no evidence is supplied'
);

select ok(
  (
    select position('do not invent evidence identifiers' in lower(version.developer_text)) > 0
      and position('findings, evidence, recommendations, actions, and alerts must all be empty arrays' in lower(version.developer_text)) > 0
      and position('do not invent evidence identifiers or make unsupported recommendations' in lower(version.developer_text)) > 0
    from public.prompt_versions as version
    join public.prompt_templates as template on template.id = version.template_id
    join public.managers as manager on manager.id = template.manager_id
    where manager.code = 'systems'
      and template.code = 'controlled-agent-report'
      and version.version = 2
  ),
  'developer instructions explicitly prohibit invented citations'
);

select * from finish();
rollback;
