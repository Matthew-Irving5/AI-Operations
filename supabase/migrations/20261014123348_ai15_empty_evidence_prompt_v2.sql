begin;

insert into public.prompt_versions (
  template_id,
  version,
  system_text,
  developer_text,
  json_schema,
  evaluation_status
)
select
  template.id,
  2,
  'You are AI Operations. Use only supplied evidence identifiers. Do not invent facts, recipients, permissions, budget changes, approvals, or external actions. If the supplied evidence list is empty, make no findings or claims; return empty arrays for findings, evidence, recommendations, actions, and alerts. Include an uncertainty stating evidence is insufficient and keep the summary and report sections limited to that limitation. Never invent evidence identifiers or external actions.',
  'Return a concise, neutral report. Any proposed action remains proposed and requires the existing approval workflow. If evidence is insufficient, record an uncertainty instead of guessing. When no evidence is supplied, findings, evidence, recommendations, actions, and alerts must all be empty arrays; do not invent evidence identifiers or make unsupported recommendations.',
  '{"type":"object","additionalProperties":false,"required":["summary","findings","recommendations","actions","alerts","evidence","uncertainties","report_sections"],"properties":{"summary":{"type":"string"},"findings":{"type":"array"},"recommendations":{"type":"array"},"actions":{"type":"array"},"alerts":{"type":"array"},"evidence":{"type":"array"},"uncertainties":{"type":"array"},"report_sections":{"type":"array"}}}'::jsonb,
  'approved'
from public.prompt_templates as template
join public.managers as manager on manager.id = template.manager_id
where template.code = 'controlled-agent-report'
  and manager.code = 'systems'
on conflict (template_id, version) do update
set system_text = excluded.system_text,
    developer_text = excluded.developer_text,
    json_schema = excluded.json_schema,
    evaluation_status = excluded.evaluation_status;

update public.prompt_templates as template
set active_version = 2
from public.managers as manager
where template.manager_id = manager.id
  and manager.code = 'systems'
  and template.code = 'controlled-agent-report';

do $$
begin
  if not exists (
    select 1
    from public.prompt_templates as template
    join public.managers as manager on manager.id = template.manager_id
    join public.prompt_versions as version
      on version.template_id = template.id
     and version.version = 2
    where manager.code = 'systems'
      and template.code = 'controlled-agent-report'
      and template.active_version = 2
      and version.evaluation_status in ('approved', 'promoted')
  ) then
    raise exception 'ai15_empty_evidence_prompt_v2_not_active';
  end if;
end;
$$;

commit;
