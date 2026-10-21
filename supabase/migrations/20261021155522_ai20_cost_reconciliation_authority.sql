-- AI-20: keep reservation, provider actuals, and the hard-cap ledger aligned.
alter table public.workflow_runs
  add column cost_root_run_id uuid references public.workflow_runs(id);
alter table public.ai_calls
  add column model_pricing_id uuid references public.model_pricing(id),
  add column cache_write_tokens bigint not null default 0
    check (cache_write_tokens >= 0);
alter table public.monthly_budgets
  alter column actual_recurring type numeric(12,6),
  alter column actual_on_demand type numeric(12,6);
alter table public.on_demand_budgets
  alter column reserved_amount type numeric(12,6),
  alter column actual_amount type numeric(12,6);

alter table public.cost_reservations
  drop constraint cost_reservations_amounts_check;
alter table public.cost_reservations
  add constraint cost_reservations_amounts_check check (
    released_amount <= greatest(reserved_amount - consumed_amount, 0)
    and (status <> 'consumed' or released_amount = greatest(reserved_amount - consumed_amount, 0))
  );

create or replace function public.reserve_recurring_budget(p_user_id uuid, p_run_id uuid, p_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_budget public.monthly_budgets; v_reserved numeric; v_reservation uuid;
begin
  select * into v_budget from public.monthly_budgets
   where user_id = p_user_id
     and month = date_trunc('month', now() at time zone 'Europe/London')::date
   for update;
  if not found then
    insert into public.monthly_budgets(user_id, month)
    values (p_user_id, date_trunc('month', now() at time zone 'Europe/London')::date)
    returning * into v_budget;
  end if;
  if v_budget.locked then raise exception 'recurring_budget_locked'; end if;
  select coalesce(sum(reserved_amount - consumed_amount - released_amount), 0)
    into v_reserved from public.cost_reservations
   where user_id = p_user_id and category = 'recurring' and status = 'reserved';
  if v_budget.actual_recurring + v_reserved + p_amount > v_budget.recurring_hard_cap then
    raise exception 'recurring_hard_cap_exceeded';
  end if;
  insert into public.cost_reservations(user_id, run_id, category, reserved_amount, status)
  values (p_user_id, p_run_id, 'recurring', p_amount, 'reserved') returning id into v_reservation;
  return v_reservation;
end; $$;

drop function public.reserve_instrumented_ai_call(uuid, uuid, uuid, uuid, numeric, text, jsonb);
create function public.reserve_instrumented_ai_call(
  p_user_id uuid,
  p_run_id uuid,
  p_model_id uuid,
  p_prompt_version_id uuid,
  p_estimated_cost numeric,
  p_request_id text,
  p_redacted_trace jsonb default '{}'::jsonb,
  p_pricing_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  reservation_id uuid;
  call_id uuid;
  on_demand public.on_demand_budgets;
  selected_model text;
  model_rank integer;
  ceiling_rank integer;
  budget_root_run_id uuid;
  pricing_row public.model_pricing;
begin
  if p_estimated_cost < 0 or p_request_id !~ '^[A-Za-z0-9._:-]{8,200}$' then
    raise exception 'invalid_ai_call_reservation';
  end if;
  select coalesce(cost_root_run_id, id) into budget_root_run_id
    from public.workflow_runs where id = p_run_id and user_id = p_user_id
      and status in ('queued', 'running');
  if not found then raise exception 'ai_call_run_not_executable'; end if;
  select model_id into selected_model from public.ai_model_catalog where id = p_model_id and enabled;
  if selected_model is null then raise exception 'ai_model_not_enabled'; end if;
  select * into pricing_row from public.model_pricing price
   where price.model_id = p_model_id
     and price.effective_from <= now()
     and (p_pricing_id is null or price.id = p_pricing_id)
   order by price.effective_from desc limit 1;
  if not found then raise exception 'model_pricing_unavailable'; end if;
  if pricing_row.verified_at < now() - interval '90 days'
    or pricing_row.source_url !~ '^https://([a-z0-9-]+\.)*openai\.com/' then
    raise exception 'model_pricing_stale_or_unverified';
  end if;
  if not exists (select 1 from public.prompt_versions where id = p_prompt_version_id) then
    raise exception 'ai_prompt_version_not_found';
  end if;
  select * into on_demand from public.on_demand_budgets where run_id = budget_root_run_id for update;
  if found then
    if on_demand.status <> 'active' or on_demand.expires_at <= now() then
      raise exception 'on_demand_budget_unavailable';
    end if;
    model_rank := case selected_model when 'gpt-5.6-luna' then 1 when 'gpt-5.6-terra' then 2 when 'gpt-5.6-sol' then 3 else 99 end;
    ceiling_rank := case on_demand.model_ceiling when 'gpt-5.6-luna' then 1 when 'gpt-5.6-terra' then 2 when 'gpt-5.6-sol' then 3 else 0 end;
    if model_rank > ceiling_rank or
       p_estimated_cost > on_demand.hard_cap - on_demand.actual_amount - on_demand.reserved_amount then
      raise exception 'on_demand_hard_cap_exceeded';
    end if;
    insert into public.cost_reservations(user_id, run_id, category, reserved_amount, status)
      values (p_user_id, p_run_id, 'on_demand', p_estimated_cost, 'reserved') returning id into reservation_id;
    update public.on_demand_budgets
       set reserved_amount = reserved_amount + p_estimated_cost where id = on_demand.id;
  else
    reservation_id := public.reserve_recurring_budget(p_user_id, p_run_id, p_estimated_cost);
  end if;
  insert into public.ai_calls(
    user_id, run_id, model_id, prompt_version_id, status, estimated_cost,
    request_id, validation_status, redacted_trace, model_pricing_id
  ) values (
    p_user_id, p_run_id, p_model_id, p_prompt_version_id, 'reserved',
    p_estimated_cost, p_request_id, 'pending', p_redacted_trace, pricing_row.id
  ) returning id into call_id;
  update public.workflow_runs set budget_reservation_id = reservation_id where id = p_run_id;
  insert into public.trace_events(user_id, correlation_id, event_type, redacted_payload)
    select p_user_id, correlation_id, 'ai_call_reserved',
      jsonb_build_object('call_id', call_id, 'estimate', p_estimated_cost, 'request_id', p_request_id,
        'category', coalesce((select category from public.cost_reservations where id = reservation_id), 'recurring'))
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
  v_released numeric;
  usage_month date;
  budget_root_run_id uuid;
  v_cache_write_tokens bigint;
begin
  v_cache_write_tokens := coalesce((p_provider_usage ->> 'cache_write_tokens')::bigint, 0);
  if p_actual_cost < 0 or p_input_tokens < 0 or p_output_tokens < 0
    or p_cached_input_tokens < 0 or p_reasoning_tokens < 0 or p_search_calls < 0
    or v_cache_write_tokens < 0
    or p_cached_input_tokens + v_cache_write_tokens > p_input_tokens then
    raise exception 'invalid_ai_usage';
  end if;
  select * into call_row from public.ai_calls where id = p_call_id for update;
  if not found then raise exception 'ai_call_not_found'; end if;
  if call_row.status not in ('reserved', 'submitted', 'completed_pending_reconciliation', 'reconciliation_failed') then
    raise exception 'ai_call_not_settleable';
  end if;
  select coalesce(cost_root_run_id, id) into budget_root_run_id
    from public.workflow_runs where id = call_row.run_id;
  if not found then raise exception 'ai_call_run_not_found'; end if;
  select * into reservation from public.cost_reservations
    where id = (select budget_reservation_id from public.workflow_runs where id = call_row.run_id)
    for update;
  if not found then raise exception 'ai_call_reservation_not_found'; end if;

  v_released := greatest(reservation.reserved_amount - p_actual_cost, 0);
  update public.cost_reservations
     set consumed_amount = p_actual_cost, released_amount = v_released, status = 'consumed'
   where id = reservation.id;
  usage_month := date_trunc('month', call_row.created_at at time zone 'Europe/London')::date;
  if reservation.category = 'on_demand' then
    update public.on_demand_budgets
       set reserved_amount = greatest(0, reserved_amount - reservation.reserved_amount),
           actual_amount = actual_amount + p_actual_cost,
           status = case when actual_amount + p_actual_cost >= hard_cap then 'exhausted' else status end
     where run_id = budget_root_run_id;
    insert into public.monthly_budgets(user_id, month, actual_on_demand)
    values (call_row.user_id, usage_month, p_actual_cost)
    on conflict (user_id, month) do update
      set actual_on_demand = public.monthly_budgets.actual_on_demand + excluded.actual_on_demand;
  else
    insert into public.monthly_budgets(user_id, month, actual_recurring)
    values (call_row.user_id, usage_month, p_actual_cost)
    on conflict (user_id, month) do update
      set actual_recurring = public.monthly_budgets.actual_recurring + excluded.actual_recurring;
  end if;
  update public.ai_calls
     set status = case when p_validation_passed then 'succeeded' else 'failed' end,
         actual_cost = p_actual_cost, actual_input_tokens = p_input_tokens,
         actual_output_tokens = p_output_tokens, cached_input_tokens = p_cached_input_tokens,
         cache_write_tokens = v_cache_write_tokens,
         reasoning_tokens = p_reasoning_tokens, search_calls = p_search_calls,
         provider_usage = p_provider_usage, redacted_trace = p_redacted_trace,
         validation_status = case when p_validation_passed then 'passed' else 'failed' end,
         completed_at = now()
   where id = p_call_id returning * into settled;
  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
    select call_row.user_id, correlation_id, 'ai_call_settled',
      case when p_validation_passed then 'info' else 'error' end,
      jsonb_build_object('call_id', p_call_id, 'actual_cost', p_actual_cost,
        'reserved_cost', reservation.reserved_amount,
        'reservation_overage', greatest(p_actual_cost - reservation.reserved_amount, 0),
        'validation_passed', p_validation_passed, 'category', reservation.category)
      from public.workflow_runs where id = call_row.run_id;
  return settled;
end; $$;

drop function public.calculate_instrumented_ai_cost(uuid, bigint, bigint, bigint, integer);
create function public.calculate_instrumented_ai_cost(
  p_model_id uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cached_input_tokens bigint,
  p_search_calls integer,
  p_cache_write_tokens bigint default 0,
  p_pricing_id uuid default null
) returns numeric language plpgsql stable security definer set search_path = public as $$
declare price public.model_pricing;
begin
  if p_input_tokens < 0 or p_output_tokens < 0 or p_cached_input_tokens < 0
    or p_search_calls < 0 or p_cache_write_tokens < 0
    or p_cached_input_tokens + p_cache_write_tokens > p_input_tokens then
    raise exception 'invalid_ai_usage';
  end if;
  select * into price from public.model_pricing candidate
   where candidate.model_id = p_model_id
     and candidate.effective_from <= now()
     and (p_pricing_id is null or candidate.id = p_pricing_id)
   order by candidate.effective_from desc limit 1;
  if not found then raise exception 'model_pricing_unavailable'; end if;
  return ceil((
    ((p_input_tokens - p_cached_input_tokens - p_cache_write_tokens) * price.input_per_million
      + p_cached_input_tokens * price.cached_input_per_million
      + p_cache_write_tokens * price.input_per_million * price.cache_write_multiplier
      + p_output_tokens * price.output_per_million) / 1000000::numeric
      + p_search_calls * price.web_search_per_call
  ) * 1000000) / 1000000;
end; $$;

create or replace function public.prevent_model_pricing_version_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'model_pricing_version_immutable';
end; $$;

create trigger model_pricing_versions_immutable
  before update or delete on public.model_pricing
  for each row execute function public.prevent_model_pricing_version_mutation();

create or replace function public.add_model_pricing(
  p_user_id uuid, p_model_id uuid, p_effective_from timestamptz,
  p_input numeric, p_cached_input numeric, p_output numeric, p_source_url text
) returns public.model_pricing language plpgsql security definer set search_path = public as $$
declare result public.model_pricing;
begin
  if not exists (
    select 1 from public.mfa_reauthentication_events
     where user_id = p_user_id and verified_at >= now() - interval '5 minutes'
  ) then raise exception 'fresh_mfa_required'; end if;
  if p_input < 0 or p_cached_input < 0 or p_output < 0
    or p_source_url !~ '^https://([a-z0-9-]+\.)*openai\.com/' then
    raise exception 'invalid_pricing_input';
  end if;
  insert into public.model_pricing(
    model_id, effective_from, input_per_million, cached_input_per_million,
    output_per_million, source_url, verified_at
  ) values (
    p_model_id, p_effective_from, p_input, p_cached_input, p_output,
    p_source_url, now()
  ) on conflict (model_id, effective_from) do nothing returning * into result;
  if not found then
    select * into result from public.model_pricing
     where model_id = p_model_id and effective_from = p_effective_from;
    if result.input_per_million <> p_input
      or result.cached_input_per_million <> p_cached_input
      or result.output_per_million <> p_output
      or result.source_url <> p_source_url then
      raise exception 'model_pricing_version_immutable';
    end if;
  end if;
  return result;
end; $$;

revoke all on function public.reserve_instrumented_ai_call(uuid, uuid, uuid, uuid, numeric, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.reserve_instrumented_ai_call(uuid, uuid, uuid, uuid, numeric, text, jsonb, uuid) to service_role;
revoke all on function public.calculate_instrumented_ai_cost(uuid, bigint, bigint, bigint, integer, bigint, uuid) from public, anon, authenticated;
grant execute on function public.calculate_instrumented_ai_cost(uuid, bigint, bigint, bigint, integer, bigint, uuid) to service_role;
revoke all on function public.prevent_model_pricing_version_mutation() from public, anon, authenticated, service_role;

create or replace function public.calculate_spend_forecast(
  p_user_id uuid,
  p_month date default date_trunc('month', now() at time zone 'Europe/London')::date
) returns public.spend_forecasts language plpgsql security definer set search_path = public as $$
declare
  result public.spend_forecasts;
  actual_total numeric := 0;
  expected_total numeric := 0;
  remaining numeric := 0;
  factor numeric := 1;
  completed_calls integer := 0;
  period_start timestamptz := p_month::timestamp at time zone 'Europe/London';
  period_end timestamptz := (p_month + interval '1 month')::timestamp at time zone 'Europe/London';
begin
  select coalesce(sum(actual_cost), 0), coalesce(sum(estimated_cost), 0), count(*)
    into actual_total, expected_total, completed_calls
    from public.ai_calls
   where user_id = p_user_id and status in ('succeeded', 'failed') and actual_cost is not null
     and created_at >= period_start and created_at < period_end;
  select coalesce(sum(reserved_amount - consumed_amount - released_amount), 0)
    into remaining from public.cost_reservations
   where user_id = p_user_id and category = 'recurring' and status = 'reserved';
  if expected_total > 0 then factor := actual_total / expected_total; end if;
  factor := least(3, greatest(0.5, factor));
  insert into public.spend_forecasts(
    user_id, month, actual_spend, expected_completed, original_month_end,
    remaining_estimate, variance_factor, adjusted_month_end, confidence
  ) values (
    p_user_id, p_month, actual_total, expected_total, actual_total + remaining,
    remaining, factor, actual_total + remaining * factor,
    case when completed_calls >= 20 then 'high' when completed_calls >= 5 then 'medium' else 'low' end
  ) returning * into result;
  return result;
end; $$;

create or replace function public.record_provider_usage_reconciliation(
  p_user_id uuid, p_period_start timestamptz, p_period_end timestamptz,
  p_reported_cost numeric, p_source_reference text default null
) returns public.provider_usage_reconciliations language plpgsql security definer set search_path = public as $$
declare calculated numeric; result public.provider_usage_reconciliations;
begin
  select coalesce(sum(actual_cost), 0) into calculated from public.ai_calls
   where user_id = p_user_id and created_at >= p_period_start and created_at < p_period_end
     and actual_cost is not null;
  insert into public.provider_usage_reconciliations(
    user_id, provider, period_start, period_end, provider_reported_cost,
    calculated_cost, status, source_reference
  ) values (
    p_user_id, 'openai', p_period_start, p_period_end, p_reported_cost, calculated,
    case when abs(p_reported_cost - calculated) <= 0.01 then 'matched' else 'investigate' end,
    p_source_reference
  ) on conflict (user_id, provider, period_start, period_end) do update
    set provider_reported_cost = excluded.provider_reported_cost,
        calculated_cost = excluded.calculated_cost, status = excluded.status,
        source_reference = excluded.source_reference, reconciled_at = now()
  returning * into result;
  return result;
end; $$;
