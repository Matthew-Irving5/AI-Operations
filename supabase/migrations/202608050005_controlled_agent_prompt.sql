-- The first live agent can only use this persisted, reviewed prompt.  The
-- execution function supplies the locked Structured Output schema separately.

insert into public.prompt_templates(manager_id, code, active_version)
select id, 'controlled-agent-report', 1 from public.managers where code = 'systems'
on conflict (code) do update set active_version = excluded.active_version;

insert into public.prompt_versions(template_id, version, system_text, developer_text, json_schema, evaluation_status)
select id, 1,
  'You are AI Operations. Use only supplied evidence identifiers. Do not invent facts, recipients, permissions, budget changes, approvals, or external actions.',
  'Return a concise, neutral report. Any proposed action remains proposed and requires the existing approval workflow. If evidence is insufficient, record an uncertainty instead of guessing.',
  '{"type":"object","additionalProperties":false,"required":["summary","findings","recommendations","actions","alerts","evidence","uncertainties","report_sections"],"properties":{"summary":{"type":"string"},"findings":{"type":"array"},"recommendations":{"type":"array"},"actions":{"type":"array"},"alerts":{"type":"array"},"evidence":{"type":"array"},"uncertainties":{"type":"array"},"report_sections":{"type":"array"}}}'::jsonb,
  'approved'
from public.prompt_templates where code = 'controlled-agent-report'
on conflict (template_id, version) do update set
  system_text = excluded.system_text,
  developer_text = excluded.developer_text,
  json_schema = excluded.json_schema,
  evaluation_status = excluded.evaluation_status;
