-- The wrapper locks queue ownership before invoking the report transaction.
-- Both the report settlement and queue/run completion commit or roll back together.
create or replace function public.commit_instrumented_ai_report_with_queue(
  p_job_id uuid,
  p_response_id text,
  p_call_id uuid,
  p_report_type text,
  p_notification_policy text,
  p_title text,
  p_summary text,
  p_markdown text,
  p_structured_metrics jsonb,
  p_sections jsonb,
  p_actions jsonb,
  p_actual_cost numeric,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cached_input_tokens bigint,
  p_reasoning_tokens bigint,
  p_provider_usage jsonb,
  p_redacted_trace jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  job_row public.job_queue;
  submission_row public.job_provider_submissions;
  call_row public.ai_calls;
  completed_job public.job_queue;
  report_id uuid;
begin
  select * into job_row from public.job_queue where id = p_job_id for update;
  if not found then raise exception 'provider_job_not_found'; end if;
  select * into submission_row from public.job_provider_submissions
    where response_id = p_response_id and job_id = p_job_id for update;
  if not found then raise exception 'provider_submission_not_found'; end if;
  select * into call_row from public.ai_calls where id = p_call_id for update;
  if not found or call_row.run_id <> job_row.run_id or call_row.response_id <> p_response_id then
    raise exception 'provider_submission_call_mismatch';
  end if;
  if submission_row.attempt_count <> job_row.attempt_count then
    raise exception 'provider_submission_attempt_mismatch';
  end if;
  if submission_row.status = 'succeeded' and job_row.status = 'succeeded'
    and call_row.status = 'succeeded' then
    report_id := public.commit_instrumented_ai_report(
      p_call_id, p_report_type, p_notification_policy, p_title, p_summary,
      p_markdown, p_structured_metrics, p_sections, p_actions, p_actual_cost,
      p_input_tokens, p_output_tokens, p_cached_input_tokens,
      p_reasoning_tokens, p_provider_usage, p_redacted_trace
    );
    completed_job := public.complete_provider_queue_job(p_job_id, p_response_id, 'succeeded', null);
    return report_id;
  end if;
  if submission_row.status = 'expired' or submission_row.expires_at <= now()
    or job_row.status = 'dead_letter' then
    return null;
  end if;
  if submission_row.status not in ('awaiting_provider', 'succeeded') then
    raise exception 'provider_submission_not_completable';
  end if;
  if submission_row.status = 'awaiting_provider' and job_row.status <> 'awaiting_provider' then
    raise exception 'provider_job_not_awaiting';
  end if;

  report_id := public.commit_instrumented_ai_report(
    p_call_id, p_report_type, p_notification_policy, p_title, p_summary,
    p_markdown, p_structured_metrics, p_sections, p_actions, p_actual_cost,
    p_input_tokens, p_output_tokens, p_cached_input_tokens,
    p_reasoning_tokens, p_provider_usage, p_redacted_trace
  );
  perform public.record_workflow_stage(job_row.run_id, 'awaiting_provider', 5, 'succeeded', 'responses:' || p_response_id, null, null);
  perform public.record_workflow_stage(job_row.run_id, 'validate_output', 6, 'succeeded', 'responses:' || p_response_id, null, null);
  perform public.record_workflow_stage(job_row.run_id, 'post_process', 7, 'succeeded', 'reports:' || report_id::text, null, null);
  perform public.record_workflow_stage(job_row.run_id, 'persist_actions', 8, 'succeeded', 'reports:' || report_id::text, null, null);
  perform public.record_workflow_stage(job_row.run_id, 'persist_evidence', 9, 'succeeded', 'reports:' || report_id::text, null, null);
  perform public.record_workflow_stage(job_row.run_id, 'persist_report', 10, 'succeeded', 'reports:' || report_id::text, null, null);
  perform public.record_workflow_stage(job_row.run_id, 'notification_decision', 11, 'succeeded', 'policy:' || p_notification_policy, null, null);

  completed_job := public.complete_provider_queue_job(
    p_job_id, p_response_id, 'succeeded', null
  );
  if completed_job.status <> 'succeeded' then
    raise exception 'provider_job_completion_not_succeeded';
  end if;
  return report_id;
end;
$$;

revoke all on function public.commit_instrumented_ai_report_with_queue(
  uuid, text, uuid, text, text, text, text, text, jsonb, jsonb, jsonb,
  numeric, bigint, bigint, bigint, bigint, jsonb, jsonb
) from public;
grant execute on function public.commit_instrumented_ai_report_with_queue(
  uuid, text, uuid, text, text, text, text, text, jsonb, jsonb, jsonb,
  numeric, bigint, bigint, bigint, bigint, jsonb, jsonb
) to service_role;

create or replace function public.fail_instrumented_ai_provider_response(
  p_job_id uuid,
  p_response_id text,
  p_call_id uuid,
  p_error_code text,
  p_actual_cost numeric,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cached_input_tokens bigint,
  p_reasoning_tokens bigint,
  p_provider_usage jsonb,
  p_redacted_trace jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  job_row public.job_queue;
  submission_row public.job_provider_submissions;
  call_row public.ai_calls;
  completed_job public.job_queue;
begin
  select * into job_row from public.job_queue where id = p_job_id for update;
  if not found then raise exception 'provider_job_not_found'; end if;
  select * into submission_row from public.job_provider_submissions
    where response_id = p_response_id and job_id = p_job_id for update;
  if not found then raise exception 'provider_submission_not_found'; end if;
  select * into call_row from public.ai_calls where id = p_call_id for update;
  if not found or call_row.run_id <> job_row.run_id or call_row.response_id <> p_response_id then
    raise exception 'provider_submission_call_mismatch';
  end if;
  if submission_row.attempt_count <> job_row.attempt_count then
    raise exception 'provider_submission_attempt_mismatch';
  end if;
  if submission_row.status = 'terminal_failure' and job_row.status = 'dead_letter'
    and call_row.status = 'failed' then
    return true;
  end if;
  if submission_row.status = 'expired' or submission_row.expires_at <= now()
    or job_row.status = 'dead_letter' then
    return false;
  end if;
  if submission_row.status not in ('awaiting_provider', 'terminal_failure') then
    raise exception 'provider_submission_not_completable';
  end if;

  if call_row.status in ('submitted', 'completed_pending_reconciliation', 'reconciliation_failed') then
    perform public.settle_instrumented_ai_call(
      p_call_id, p_actual_cost, p_input_tokens, p_output_tokens,
      p_cached_input_tokens, p_reasoning_tokens, 0, p_provider_usage,
      p_redacted_trace || jsonb_build_object('validation_passed', false), false
    );
  elsif call_row.status <> 'failed' then
    raise exception 'ai_call_not_failure_settleable';
  end if;
  perform public.record_workflow_stage(job_row.run_id, 'awaiting_provider', 5, 'failed', 'responses:' || p_response_id, null, p_error_code);
  perform public.record_workflow_stage(job_row.run_id, 'validate_output', 6, 'failed', 'responses:' || p_response_id, null, p_error_code);
  completed_job := public.complete_provider_queue_job(
    p_job_id, p_response_id, 'terminal_failure', p_error_code
  );
  return completed_job.status = 'dead_letter';
end;
$$;

revoke all on function public.fail_instrumented_ai_provider_response(
  uuid, text, uuid, text, numeric, bigint, bigint, bigint, bigint, jsonb, jsonb
) from public;
grant execute on function public.fail_instrumented_ai_provider_response(
  uuid, text, uuid, text, numeric, bigint, bigint, bigint, bigint, jsonb, jsonb
) to service_role;

-- Deterministic managers persist the same notification decision and route it
-- through the canonical account email without writing workflow lifecycle state.
create or replace function public.complete_deterministic_workflow_run(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  workflow_code text;
  policy text;
  report_id uuid;
  run_row record;
begin
  select r.user_id, r.correlation_id, d.code, d.notification_policy into run_row
    from public.workflow_runs r
    join public.workflow_definitions d on d.id = r.workflow_definition_id
   where r.id = p_run_id;
  if not found then raise exception 'workflow_run_not_found'; end if;
  workflow_code := run_row.code;
  policy := run_row.notification_policy;
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

  if policy in ('report', 'exception') then
    insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key)
    select run_row.user_id, policy, account.email,
      case policy when 'exception' then 'Workflow exception report is ready' else 'Workflow report is ready' end,
      'pending', 'workflow-report:' || p_run_id::text
    from public.app_users account where account.id = run_row.user_id
    on conflict (dedupe_key) do nothing;
    if not exists (select 1 from public.app_users where id = run_row.user_id and email is not null) then
      raise exception 'notification_user_email_unavailable';
    end if;
  end if;
  perform public.record_workflow_stage(p_run_id, 'notification_decision', 9, 'succeeded', 'policy:' || policy, null, null);
  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
  select run_row.user_id, run_row.correlation_id, 'workflow_notification_decision', 'info',
    jsonb_build_object('run_id', p_run_id, 'policy', policy, 'notification_created', policy in ('report', 'exception'))
  where not exists (select 1 from public.trace_events where correlation_id = run_row.correlation_id and event_type = 'workflow_notification_decision');
  return report_id;
end;
$$;

revoke all on function public.complete_deterministic_workflow_run(uuid) from public;
grant execute on function public.complete_deterministic_workflow_run(uuid) to service_role;
