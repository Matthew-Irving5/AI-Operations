-- Pass 08: provider completion reconciliation is retriable. A transient
-- retrieval/pricing failure retains the reservation, records a redacted error,
-- and can later settle the same call without creating a second reservation.

alter table public.ai_calls drop constraint ai_calls_status_check;
alter table public.ai_calls add constraint ai_calls_status_check check (
  status in (
    'reserved',
    'submitted',
    'completed_pending_reconciliation',
    'reconciliation_failed',
    'succeeded',
    'failed',
    'cancelled'
  )
);

create index ai_calls_reconciliation_retry_idx on public.ai_calls(response_id)
  where status = 'reconciliation_failed';

create or replace function public.record_instrumented_ai_reconciliation_failure(
  p_call_id uuid,
  p_error_code text,
  p_redacted_trace jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare call_row public.ai_calls;
begin
  if p_error_code !~ '^[a-z0-9_]{3,100}$' then
    raise exception 'invalid_ai_reconciliation_error';
  end if;
  select * into call_row from public.ai_calls where id = p_call_id for update;
  if not found then raise exception 'ai_call_not_found'; end if;
  if call_row.status not in ('submitted', 'completed_pending_reconciliation', 'reconciliation_failed') then
    raise exception 'ai_call_not_reconcilable';
  end if;
  update public.ai_calls
     set status = 'reconciliation_failed',
         redacted_trace = call_row.redacted_trace || p_redacted_trace || jsonb_build_object('reconciliation_error', p_error_code)
   where id = p_call_id;
  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
  select call_row.user_id, correlation_id, 'ai_call_reconciliation_failed', 'error',
    jsonb_build_object('call_id', p_call_id, 'error_code', p_error_code)
    from public.workflow_runs where id = call_row.run_id;
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
  v_released numeric;
begin
  if p_actual_cost < 0 or p_input_tokens < 0 or p_output_tokens < 0
    or p_cached_input_tokens < 0 or p_reasoning_tokens < 0 or p_search_calls < 0 then
    raise exception 'invalid_ai_usage';
  end if;
  select * into call_row from public.ai_calls where id = p_call_id for update;
  if not found then raise exception 'ai_call_not_found'; end if;
  if call_row.status not in ('reserved', 'submitted', 'completed_pending_reconciliation', 'reconciliation_failed') then
    raise exception 'ai_call_not_settleable';
  end if;
  select * into reservation from public.cost_reservations
    where id = (select budget_reservation_id from public.workflow_runs where id = call_row.run_id)
    for update;
  if not found then raise exception 'ai_call_reservation_not_found'; end if;
  if p_actual_cost > reservation.reserved_amount then
    raise exception 'actual_cost_exceeds_reservation';
  end if;
  v_released := reservation.reserved_amount - p_actual_cost;
  update public.cost_reservations set consumed_amount = p_actual_cost, released_amount = v_released, status = 'consumed' where id = reservation.id;
  if reservation.category = 'on_demand' then
    update public.on_demand_budgets
      set reserved_amount = greatest(0, reserved_amount - reservation.reserved_amount),
          actual_amount = actual_amount + p_actual_cost,
          status = case when actual_amount + p_actual_cost >= hard_cap then 'exhausted' else status end
      where run_id = call_row.run_id;
  else
    update public.monthly_budgets set actual_recurring = actual_recurring + p_actual_cost
      where user_id = call_row.user_id
        and month = date_trunc('month', now() at time zone 'Europe/London')::date;
  end if;
  update public.ai_calls
    set status = case when p_validation_passed then 'succeeded' else 'failed' end,
        actual_cost = p_actual_cost, actual_input_tokens = p_input_tokens,
        actual_output_tokens = p_output_tokens, cached_input_tokens = p_cached_input_tokens,
        reasoning_tokens = p_reasoning_tokens, search_calls = p_search_calls,
        provider_usage = p_provider_usage, redacted_trace = p_redacted_trace,
        validation_status = case when p_validation_passed then 'passed' else 'failed' end,
        completed_at = now()
    where id = p_call_id returning * into settled;
  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
    select call_row.user_id, correlation_id, 'ai_call_settled',
      case when p_validation_passed then 'info' else 'error' end,
      jsonb_build_object('call_id', p_call_id, 'actual_cost', p_actual_cost, 'validation_passed', p_validation_passed, 'category', reservation.category)
      from public.workflow_runs where id = call_row.run_id;
  return settled;
end; $$;

revoke all on function public.record_instrumented_ai_reconciliation_failure(uuid, text, jsonb) from public;
grant execute on function public.record_instrumented_ai_reconciliation_failure(uuid, text, jsonb) to service_role;
grant update on public.webhook_events to service_role;
