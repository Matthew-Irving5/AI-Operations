-- Pass 08: every provider invocation must be reserved, traceable, validated,
-- and settled before its workflow can be reported as AI-complete.

alter table public.ai_calls
  add column validation_status text not null default 'pending'
    check (validation_status in ('pending', 'passed', 'failed')),
  add column redacted_trace jsonb not null default '{}'::jsonb,
  add column provider_usage jsonb not null default '{}'::jsonb,
  add column completed_at timestamptz;

alter table public.ai_calls add constraint ai_calls_status_check check (
  status in (
    'reserved',
    'submitted',
    'completed_pending_reconciliation',
    'succeeded',
    'failed',
    'cancelled'
  )
);

create index ai_calls_run_created_idx on public.ai_calls(run_id, created_at desc);
create index ai_calls_pending_reconciliation_idx on public.ai_calls(response_id)
  where status = 'completed_pending_reconciliation';

create or replace function public.reserve_instrumented_ai_call(
  p_user_id uuid,
  p_run_id uuid,
  p_model_id uuid,
  p_prompt_version_id uuid,
  p_estimated_cost numeric,
  p_request_id text,
  p_redacted_trace jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  reservation_id uuid;
  call_id uuid;
begin
  if p_estimated_cost < 0 or p_request_id !~ '^[A-Za-z0-9._:-]{8,200}$' then
    raise exception 'invalid_ai_call_reservation';
  end if;
  if not exists (
    select 1 from public.workflow_runs where id = p_run_id and user_id = p_user_id
      and status in ('queued', 'running')
  ) then raise exception 'ai_call_run_not_executable'; end if;
  if not exists (select 1 from public.ai_model_catalog where id = p_model_id and enabled) then
    raise exception 'ai_model_not_enabled';
  end if;
  if not exists (select 1 from public.prompt_versions where id = p_prompt_version_id) then
    raise exception 'ai_prompt_version_not_found';
  end if;

  reservation_id := public.reserve_recurring_budget(p_user_id, p_run_id, p_estimated_cost);
  insert into public.ai_calls(
    user_id, run_id, model_id, prompt_version_id, status, estimated_cost,
    request_id, validation_status, redacted_trace
  ) values (
    p_user_id, p_run_id, p_model_id, p_prompt_version_id, 'reserved',
    p_estimated_cost, p_request_id, 'pending', p_redacted_trace
  ) returning id into call_id;
  update public.workflow_runs set budget_reservation_id = reservation_id where id = p_run_id;
  insert into public.trace_events(user_id, correlation_id, event_type, redacted_payload)
    select p_user_id, correlation_id, 'ai_call_reserved',
      jsonb_build_object('call_id', call_id, 'estimate', p_estimated_cost, 'request_id', p_request_id)
      from public.workflow_runs where id = p_run_id;
  return call_id;
end; $$;

create or replace function public.settle_instrumented_ai_call(
  p_call_id uuid,
  p_actual_cost numeric,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cached_input_tokens bigint,
  p_reasoning_tokens bigint,
  p_search_calls integer,
  p_provider_usage jsonb,
  p_redacted_trace jsonb,
  p_validation_passed boolean
) returns public.ai_calls language plpgsql security definer set search_path = public as $$
declare
  call_row public.ai_calls;
  reservation public.cost_reservations;
  settled public.ai_calls;
  v_consumed numeric;
  v_released numeric;
begin
  if p_actual_cost < 0 or p_input_tokens < 0 or p_output_tokens < 0
    or p_cached_input_tokens < 0 or p_reasoning_tokens < 0 or p_search_calls < 0 then
    raise exception 'invalid_ai_usage';
  end if;
  select * into call_row from public.ai_calls where id = p_call_id for update;
  if not found then raise exception 'ai_call_not_found'; end if;
  if call_row.status not in ('reserved', 'submitted', 'completed_pending_reconciliation') then
    raise exception 'ai_call_not_settleable';
  end if;
  select * into reservation from public.cost_reservations
    where id = (select budget_reservation_id from public.workflow_runs where id = call_row.run_id)
    for update;
  if not found then raise exception 'ai_call_reservation_not_found'; end if;
  if p_actual_cost > reservation.reserved_amount then
    raise exception 'actual_cost_exceeds_reservation';
  end if;

  v_consumed := p_actual_cost;
  v_released := reservation.reserved_amount - v_consumed;
  update public.cost_reservations
    set consumed_amount = v_consumed,
        released_amount = v_released,
        status = 'consumed'
    where id = reservation.id;
  update public.monthly_budgets
    set actual_recurring = actual_recurring + v_consumed
    where user_id = call_row.user_id
      and month = date_trunc('month', now() at time zone 'Europe/London')::date;
  update public.ai_calls
    set status = case when p_validation_passed then 'succeeded' else 'failed' end,
        actual_cost = p_actual_cost,
        actual_input_tokens = p_input_tokens,
        actual_output_tokens = p_output_tokens,
        cached_input_tokens = p_cached_input_tokens,
        reasoning_tokens = p_reasoning_tokens,
        search_calls = p_search_calls,
        provider_usage = p_provider_usage,
        redacted_trace = p_redacted_trace,
        validation_status = case when p_validation_passed then 'passed' else 'failed' end,
        completed_at = now()
    where id = p_call_id returning * into settled;
  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
    select call_row.user_id, correlation_id, 'ai_call_settled',
      case when p_validation_passed then 'info' else 'error' end,
      jsonb_build_object('call_id', p_call_id, 'actual_cost', p_actual_cost, 'validation_passed', p_validation_passed)
      from public.workflow_runs where id = call_row.run_id;
  return settled;
end; $$;

revoke all on function public.reserve_instrumented_ai_call(uuid, uuid, uuid, uuid, numeric, text, jsonb) from public;
revoke all on function public.settle_instrumented_ai_call(uuid, numeric, bigint, bigint, bigint, bigint, integer, jsonb, jsonb, boolean) from public;
grant execute on function public.reserve_instrumented_ai_call(uuid, uuid, uuid, uuid, numeric, text, jsonb) to service_role;
grant execute on function public.settle_instrumented_ai_call(uuid, numeric, bigint, bigint, bigint, bigint, integer, jsonb, jsonb, boolean) to service_role;
