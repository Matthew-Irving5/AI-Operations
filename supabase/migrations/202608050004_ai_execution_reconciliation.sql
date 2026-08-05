-- Pass 08: one server-side contract owns AI reservation, submission, pricing,
-- and settlement.  It works for both scheduled (recurring) and on-demand runs.

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
  on_demand public.on_demand_budgets;
  selected_model text;
  model_rank integer;
  ceiling_rank integer;
begin
  if p_estimated_cost < 0 or p_request_id !~ '^[A-Za-z0-9._:-]{8,200}$' then
    raise exception 'invalid_ai_call_reservation';
  end if;
  if not exists (
    select 1 from public.workflow_runs where id = p_run_id and user_id = p_user_id
      and status in ('queued', 'running')
  ) then raise exception 'ai_call_run_not_executable'; end if;
  select model_id into selected_model from public.ai_model_catalog where id = p_model_id and enabled;
  if selected_model is null then raise exception 'ai_model_not_enabled'; end if;
  if not exists (select 1 from public.prompt_versions where id = p_prompt_version_id) then
    raise exception 'ai_prompt_version_not_found';
  end if;
  select * into on_demand from public.on_demand_budgets where run_id = p_run_id for update;
  if found then
    if on_demand.status <> 'active' or on_demand.expires_at <= now() then
      raise exception 'on_demand_budget_unavailable';
    end if;
    model_rank := case selected_model when 'gpt-5.6-luna' then 1 when 'gpt-5.6-terra' then 2 when 'gpt-5.6-sol' then 3 else 99 end;
    ceiling_rank := case on_demand.model_ceiling when 'gpt-5.6-luna' then 1 when 'gpt-5.6-terra' then 2 when 'gpt-5.6-sol' then 3 else 0 end;
    if model_rank > ceiling_rank or p_estimated_cost > on_demand.hard_cap - on_demand.reserved_amount then
      raise exception 'on_demand_hard_cap_exceeded';
    end if;
    insert into public.cost_reservations(user_id, run_id, category, reserved_amount, status)
      values (p_user_id, p_run_id, 'on_demand', p_estimated_cost, 'reserved') returning id into reservation_id;
    update public.on_demand_budgets set reserved_amount = reserved_amount + p_estimated_cost where id = on_demand.id;
  else
    reservation_id := public.reserve_recurring_budget(p_user_id, p_run_id, p_estimated_cost);
  end if;
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
      jsonb_build_object('call_id', call_id, 'estimate', p_estimated_cost, 'request_id', p_request_id, 'category', coalesce((select category from public.cost_reservations where id = reservation_id), 'recurring'))
      from public.workflow_runs where id = p_run_id;
  return call_id;
end; $$;

create or replace function public.mark_instrumented_ai_call_submitted(p_call_id uuid, p_response_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_response_id !~ '^resp_[A-Za-z0-9_-]{6,200}$' then raise exception 'invalid_provider_response_id'; end if;
  update public.ai_calls set status = 'submitted', response_id = p_response_id
    where id = p_call_id and status = 'reserved';
  if not found then raise exception 'ai_call_not_submittable'; end if;
end; $$;

create or replace function public.calculate_instrumented_ai_cost(
  p_model_id uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cached_input_tokens bigint,
  p_search_calls integer
) returns numeric language sql stable security definer set search_path = public as $$
  select round(((p_input_tokens - p_cached_input_tokens) * price.input_per_million +
      p_cached_input_tokens * price.cached_input_per_million +
      p_output_tokens * price.output_per_million) / 1000000::numeric +
      p_search_calls * price.web_search_per_call, 6)
  from public.model_pricing price
  where price.model_id = p_model_id and price.effective_from <= now()
  order by price.effective_from desc limit 1
$$;

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

revoke all on function public.mark_instrumented_ai_call_submitted(uuid, text), public.calculate_instrumented_ai_cost(uuid, bigint, bigint, bigint, integer) from public;
grant execute on function public.mark_instrumented_ai_call_submitted(uuid, text), public.calculate_instrumented_ai_cost(uuid, bigint, bigint, bigint, integer) to service_role;
