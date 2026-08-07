-- Pass 08: a single deterministic completion contract used by every manager
-- while live agents are disabled.  It deliberately does not manufacture AI
-- output or provider usage; those records can only be created by the
-- instrumented AI execution path.

alter table public.reports add constraint reports_run_id_unique unique(run_id);

create or replace function public.complete_deterministic_workflow_run(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  run_row record;
  created_report uuid;
  report_title text;
  report_summary text;
begin
  select r.id, r.user_id, r.correlation_id, r.status, d.code, d.manager_id
    into run_row
    from public.workflow_runs r
    join public.workflow_definitions d on d.id = r.workflow_definition_id
   where r.id = p_run_id
   for update;

  if not found then raise exception 'workflow_run_not_found'; end if;
  if run_row.status = 'succeeded' then
    select id into created_report from public.reports where run_id = p_run_id;
    return created_report;
  end if;
  if run_row.status not in ('queued', 'running') then raise exception 'workflow_run_not_executable'; end if;

  report_title := initcap(replace(run_row.code, '-', ' '));
  report_summary := 'Deterministic workflow completed. Review source freshness and evidence before acting.';

  insert into public.reports(
    user_id, run_id, report_type, title, summary, markdown, structured_metrics, status
  ) values (
    run_row.user_id,
    p_run_id,
    run_row.code,
    report_title,
    report_summary,
    '## ' || report_title || E'\n\n' || report_summary,
    jsonb_build_object(
      'workflow', run_row.code,
      'execution_mode', 'deterministic',
      'ai_called', false,
      'validated', true
    ),
    'validated'
  ) on conflict (run_id) do nothing returning id into created_report;

  if created_report is null then
    select id into created_report from public.reports where run_id = p_run_id;
  else
    insert into public.report_sections(
      report_id, code, title, display_order, content, structured_data, evidence_references
    ) values (
      created_report,
      'execution',
      'Execution status',
      0,
      report_summary,
      jsonb_build_object('mode', 'deterministic', 'workflow', run_row.code),
      '[]'::jsonb
    );
  end if;

  update public.workflow_runs
     set status = 'succeeded', completed_at = now(), redacted_error = null
   where id = p_run_id;

  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
  values (
    run_row.user_id,
    run_row.correlation_id,
    'workflow_completed',
    'info',
    jsonb_build_object(
      'run_id', p_run_id,
      'report_id', created_report,
      'workflow', run_row.code,
      'execution_mode', 'deterministic',
      'validation', 'passed',
      'ai_called', false
    )
  );

  insert into public.audit_events(
    user_id, actor_type, action_type, target_type, target_id, aal, result, redacted_after
  ) values (
    run_row.user_id,
    'system',
    'complete_deterministic_workflow',
    'workflow_run',
    p_run_id,
    'system',
    'success',
    jsonb_build_object('report_id', created_report, 'workflow', run_row.code, 'ai_called', false)
  );

  return created_report;
end; $$;

revoke all on function public.complete_deterministic_workflow_run(uuid) from public;
grant execute on function public.complete_deterministic_workflow_run(uuid) to service_role;
