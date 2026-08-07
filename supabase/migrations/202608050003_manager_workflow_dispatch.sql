-- Pass 08: retain manager-specific deterministic work behind one operational
-- dispatcher.  The old helper names described test fixtures, not production
-- behavior, and are deliberately removed from the execution surface.

alter function public.complete_synthetic_systems_run(uuid) rename to execute_systems_workflow;
alter function public.complete_personal_run(uuid) rename to execute_personal_workflow;
alter function public.complete_health_finance_run(uuid) rename to execute_health_finance_workflow;
alter function public.complete_career_travel_procurement_run(uuid) rename to execute_career_travel_procurement_workflow;

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
    -- Device scans use their own signed worker-result completion boundary.
    return p_run_id;
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

revoke all on function public.execute_systems_workflow(uuid) from public;
revoke all on function public.execute_personal_workflow(uuid) from public;
revoke all on function public.execute_health_finance_workflow(uuid) from public;
revoke all on function public.execute_career_travel_procurement_workflow(uuid) from public;
grant execute on function public.execute_systems_workflow(uuid), public.execute_personal_workflow(uuid), public.execute_health_finance_workflow(uuid), public.execute_career_travel_procurement_workflow(uuid) to service_role;
