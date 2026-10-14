-- The provider-backed lifecycle persists its notification decision as a stage,
-- but the stage was not mirrored into the redacted trace used by the audit UI.
-- Keep the trace write in the atomic report/queue transaction.
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
  run_row record;
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
  select run.user_id, run.correlation_id, definition.notification_policy into run_row
    from public.workflow_runs run
    join public.workflow_definitions definition on definition.id = run.workflow_definition_id
    where run.id = job_row.run_id;
  if not found then raise exception 'workflow_run_not_found'; end if;

  if submission_row.status = 'succeeded' and job_row.status = 'succeeded'
    and call_row.status = 'succeeded' then
    report_id := public.commit_instrumented_ai_report(
      p_call_id, p_report_type, p_notification_policy, p_title, p_summary,
      p_markdown, p_structured_metrics, p_sections, p_actions, p_actual_cost,
      p_input_tokens, p_output_tokens, p_cached_input_tokens,
      p_reasoning_tokens, p_provider_usage, p_redacted_trace
    );
    completed_job := public.complete_provider_queue_job(p_job_id, p_response_id, 'succeeded', null);
    insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
    select run_row.user_id, run_row.correlation_id, 'workflow_notification_decision', 'info',
      jsonb_build_object(
        'run_id', job_row.run_id,
        'policy', run_row.notification_policy,
        'notification_created', exists (
          select 1 from public.notifications
          where dedupe_key = 'workflow-report:' || job_row.run_id::text
        )
      )
    where not exists (
      select 1 from public.trace_events
      where correlation_id = run_row.correlation_id
        and event_type = 'workflow_notification_decision'
    );
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
  perform public.record_workflow_stage(job_row.run_id, 'notification_decision', 11, 'succeeded', 'policy:' || run_row.notification_policy, null, null);
  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
  select run_row.user_id, run_row.correlation_id, 'workflow_notification_decision', 'info',
    jsonb_build_object(
      'run_id', job_row.run_id,
      'policy', run_row.notification_policy,
      'notification_created', exists (
        select 1 from public.notifications
        where dedupe_key = 'workflow-report:' || job_row.run_id::text
      )
    )
  where not exists (
    select 1 from public.trace_events
    where correlation_id = run_row.correlation_id
      and event_type = 'workflow_notification_decision'
  );

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

-- Recover the redacted notification-decision event for completed runs from the
-- pre-fix AI path. This is metadata-only and idempotent.
insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
select run.user_id, run.correlation_id, 'workflow_notification_decision', 'info',
  jsonb_build_object(
    'run_id', run.id,
    'policy', definition.notification_policy,
    'notification_created', exists (
      select 1 from public.notifications
      where dedupe_key = 'workflow-report:' || run.id::text
    )
  )
from public.workflow_runs run
join public.workflow_definitions definition on definition.id = run.workflow_definition_id
where run.status = 'succeeded'
  and definition.notification_policy in ('silent', 'report', 'exception')
  and exists (
    select 1 from public.run_step_attempts attempt
    where attempt.run_id = run.id
      and attempt.step_code = 'notification_decision'
      and attempt.status = 'succeeded'
  )
  and exists (
    select 1 from public.reports report
    where report.run_id = run.id
      and report.status = 'validated'
  )
  and exists (
    select 1 from public.ai_calls call
    where call.run_id = run.id
      and call.status = 'succeeded'
  )
  and not exists (
    select 1 from public.trace_events event
    where event.correlation_id = run.correlation_id
      and event.event_type = 'workflow_notification_decision'
  );
