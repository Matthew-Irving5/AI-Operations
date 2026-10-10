create or replace function public.commit_instrumented_ai_report(
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
  call_row public.ai_calls;
  report_id uuid;
  run_row record;
  inserted_sections integer;
  inserted_actions integer;
begin
  select * into call_row from public.ai_calls where id = p_call_id for update;
  if not found or call_row.run_id is null then
    raise exception 'ai_report_call_not_found';
  end if;
  if jsonb_typeof(p_sections) <> 'array'
    or jsonb_array_length(p_sections) not between 1 and 20
    or jsonb_typeof(p_actions) <> 'array'
    or jsonb_array_length(p_actions) > 20 then
    raise exception 'invalid_ai_report_commit';
  end if;
  if p_report_type !~ '^[a-z0-9][a-z0-9-]{1,119}$'
    or p_notification_policy not in ('silent', 'report', 'exception')
    or length(p_title) not between 1 and 200
    or length(p_summary) not between 1 and 8000
    or length(p_markdown) not between 1 and 60000
    or jsonb_typeof(p_structured_metrics) <> 'object' then
    raise exception 'invalid_ai_report_commit';
  end if;

  select id into report_id from public.reports where run_id = call_row.run_id;
  if report_id is not null then
    if call_row.status <> 'succeeded' then
      raise exception 'report_exists_call_not_settled';
    end if;
    return report_id;
  end if;

  if call_row.status not in ('reserved', 'submitted', 'completed_pending_reconciliation') then
    raise exception 'ai_report_call_not_settleable';
  end if;
  select user_id, correlation_id into run_row
    from public.workflow_runs where id = call_row.run_id;
  if not found or run_row.user_id <> call_row.user_id then
    raise exception 'ai_report_run_owner_mismatch';
  end if;

  perform public.settle_instrumented_ai_call(
    p_call_id,
    p_actual_cost,
    p_input_tokens,
    p_output_tokens,
    p_cached_input_tokens,
    p_reasoning_tokens,
    0,
    p_provider_usage,
    p_redacted_trace,
    true
  );

  insert into public.reports(
    user_id, run_id, report_type, title, summary, markdown,
    structured_metrics, status
  ) values (
    call_row.user_id,
    call_row.run_id,
    p_report_type,
    p_title,
    p_summary,
    p_markdown,
    p_structured_metrics,
    'validated'
  ) returning id into report_id;

  insert into public.report_sections(
    report_id, code, title, display_order, content, structured_data, evidence_references
  )
  select report_id, section.code, section.title, section.display_order,
    section.content, section.structured_data, section.evidence_references
  from jsonb_to_recordset(p_sections) as section(
    code text,
    title text,
    display_order integer,
    content text,
    structured_data jsonb,
    evidence_references jsonb
  )
  where section.code ~ '^[a-z0-9-]{1,100}$'
    and length(section.title) between 1 and 200
    and section.display_order between 0 and 19
    and length(section.content) between 1 and 8000
    and jsonb_typeof(section.structured_data) = 'object'
    and jsonb_typeof(section.evidence_references) = 'array';
  get diagnostics inserted_sections = row_count;

  if inserted_sections <> jsonb_array_length(p_sections) then
    raise exception 'ai_report_sections_invalid';
  end if;

  insert into public.actions(
    user_id, run_id, action_type, title, description, risk_class, status, proposed_payload
  )
  select call_row.user_id, call_row.run_id, action.action_type, action.title,
    'AI-proposed action; explicit approval is required before execution.',
    action.risk_class::public.risk_class,
    'proposed',
    jsonb_build_object('source', 'validated_ai_output', 'response_id', call_row.response_id)
  from jsonb_to_recordset(p_actions) as action(action_type text, title text, risk_class text)
  where action.action_type ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$'
    and length(action.title) between 1 and 500
    and action.risk_class in ('low', 'medium', 'high', 'critical')
    and action.action_type in (
      select jsonb_array_elements_text(coalesce(call_row.redacted_trace -> 'allowed_action_types', '[]'::jsonb))
    );
  get diagnostics inserted_actions = row_count;
  if inserted_actions <> jsonb_array_length(p_actions) then
    raise exception 'ai_report_actions_invalid';
  end if;

  insert into public.trace_events(
    user_id, correlation_id, event_type, severity, redacted_payload
  ) values (
    run_row.user_id,
    run_row.correlation_id,
    'ai_report_validated',
    'info',
    jsonb_build_object(
      'call_id', p_call_id,
      'report_id', report_id,
      'response_id', call_row.response_id,
      'validation', 'passed',
      'notification_policy', p_notification_policy
    )
  );
  insert into public.audit_events(
    user_id, actor_type, action_type, target_type, target_id, aal,
    result, correlation_id, redacted_after
  ) values (
    run_row.user_id,
    'system',
    'persist_validated_ai_report',
    'workflow_run',
    call_row.run_id::text,
    'system',
    'success',
    run_row.correlation_id,
    jsonb_build_object('report_id', report_id, 'call_id', p_call_id)
  );
  if p_notification_policy in ('report', 'exception') then
    if not exists (select 1 from public.app_users where id = call_row.user_id and email is not null) then
      raise exception 'notification_user_email_unavailable';
    end if;
    insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key)
    select call_row.user_id,
      p_notification_policy,
      account.email,
      case p_notification_policy
        when 'exception' then 'Workflow exception report is ready'
        else 'Workflow report is ready'
      end,
      'pending',
      'workflow-report:' || call_row.run_id::text
    from public.app_users account
    where account.id = call_row.user_id
    on conflict (dedupe_key) do nothing;
  end if;
  return report_id;
end;
$$;

revoke all on function public.commit_instrumented_ai_report(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb, numeric,
  bigint, bigint, bigint, bigint, jsonb, jsonb
) from public;
grant execute on function public.commit_instrumented_ai_report(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb, numeric,
  bigint, bigint, bigint, bigint, jsonb, jsonb
) to service_role;
