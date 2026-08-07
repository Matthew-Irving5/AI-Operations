-- Pass 08: a completed local scan must produce the same durable report, trace,
-- and audit evidence as every other deterministic manager workflow. Device
-- execution remains worker-owned; only the post-scan control-plane completion
-- is centralised here.

create or replace function public.execute_digital_estate_workflow(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  run_row record;
  scan_row record;
  created_report uuid;
  title_text text;
  summary_text text;
begin
  select r.id, r.user_id, r.correlation_id, d.code
    into run_row
    from public.workflow_runs r
    join public.workflow_definitions d on d.id = r.workflow_definition_id
   where r.id = p_run_id
   for update;
  if not found or run_row.code not like 'digital-estate-%' then
    raise exception 'unsupported_digital_estate_run';
  end if;

  select s.id, s.scan_kind, s.status, s.progress,
         (select count(*) from public.digital_inventory_items i where i.scan_id = s.id) as inventory_count,
         (select count(*) from public.digital_findings f where f.scan_id = s.id) as finding_count
    into scan_row
    from public.digital_scans s
   where s.run_id = p_run_id
   for update;
  if not found or scan_row.status <> 'complete' then
    raise exception 'digital_scan_not_complete';
  end if;

  title_text := 'Digital Estate scan report';
  summary_text := format(
    'The completed %s scan recorded %s inventory items and %s findings. Any local changes still require an explicitly approved signed manifest.',
    scan_row.scan_kind,
    scan_row.inventory_count,
    scan_row.finding_count
  );
  insert into public.reports(
    user_id, run_id, report_type, title, summary, markdown, structured_metrics, status
  ) values (
    run_row.user_id,
    p_run_id,
    run_row.code,
    title_text,
    summary_text,
    '## ' || title_text || E'\n\n' || summary_text,
    jsonb_build_object(
      'workflow', run_row.code,
      'execution_mode', 'deterministic',
      'ai_called', false,
      'scan_id', scan_row.id,
      'inventory_count', scan_row.inventory_count,
      'finding_count', scan_row.finding_count,
      'validation', 'passed'
    ),
    'validated'
  ) on conflict (run_id) do nothing returning id into created_report;
  if created_report is null then
    select id into created_report from public.reports where run_id = p_run_id;
    return created_report;
  end if;
  insert into public.report_sections(
    report_id, code, title, display_order, content, structured_data, evidence_references
  ) values (
    created_report,
    'scan-summary',
    'Scan summary',
    0,
    summary_text,
    jsonb_build_object('scan_id', scan_row.id, 'scan_kind', scan_row.scan_kind),
    '[]'::jsonb
  );
  insert into public.notifications(
    user_id, type, recipient, subject, status, dedupe_key, correlation_id
  ) values (
    run_row.user_id,
    'report',
    'Matthew.irving.ai@gmail.com',
    '[AI Operations] ' || title_text,
    'queued',
    'digital-estate-report:' || created_report,
    run_row.correlation_id
  ) on conflict (dedupe_key) do nothing;
  update public.workflow_runs
     set status = 'succeeded', completed_at = now(), redacted_error = null
   where id = p_run_id;
  return created_report;
end; $$;

create or replace function public.complete_deterministic_workflow_run(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare workflow_code text; report_id uuid; run_row record;
begin
  select r.user_id, r.correlation_id, d.code into run_row
    from public.workflow_runs r
    join public.workflow_definitions d on d.id = r.workflow_definition_id
   where r.id = p_run_id;
  if not found then raise exception 'workflow_run_not_found'; end if;
  workflow_code := run_row.code;
  if workflow_code like 'systems-%' then
    report_id := public.execute_systems_workflow(p_run_id);
  elsif workflow_code like 'personal-%' then
    report_id := public.execute_personal_workflow(p_run_id);
  elsif workflow_code like 'health-%' or workflow_code like 'finance-%' then
    report_id := public.execute_health_finance_workflow(p_run_id);
  elsif workflow_code like 'career-%' or workflow_code like 'travel-%' or workflow_code like 'procurement-%' then
    report_id := public.execute_career_travel_procurement_workflow(p_run_id);
  elsif workflow_code like 'digital-estate-%' then
    report_id := public.execute_digital_estate_workflow(p_run_id);
  else
    raise exception 'workflow_code_not_supported';
  end if;

  update public.reports
     set structured_metrics = structured_metrics || jsonb_build_object(
       'execution_mode', 'deterministic', 'ai_called', false, 'validation', 'passed'
     )
   where id = report_id;
  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
  select run_row.user_id, run_row.correlation_id, 'workflow_completed', 'info',
    jsonb_build_object('run_id', p_run_id, 'report_id', report_id, 'workflow', workflow_code, 'execution_mode', 'deterministic', 'validation', 'passed', 'ai_called', false)
  where not exists (select 1 from public.trace_events where correlation_id = run_row.correlation_id and event_type = 'workflow_completed');
  insert into public.audit_events(user_id, actor_type, action_type, target_type, target_id, aal, result, redacted_after)
  select run_row.user_id, 'system', 'complete_deterministic_workflow', 'workflow_run', p_run_id, 'system', 'success',
    jsonb_build_object('report_id', report_id, 'workflow', workflow_code, 'ai_called', false)
  where not exists (select 1 from public.audit_events where target_id = p_run_id::text and action_type = 'complete_deterministic_workflow');
  return report_id;
end; $$;

revoke all on function public.execute_digital_estate_workflow(uuid) from public;
grant execute on function public.execute_digital_estate_workflow(uuid) to service_role;
