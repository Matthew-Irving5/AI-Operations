-- Pass 02: transactional orchestration, cost controls, and observability.
create type public.job_status as enum ('queued', 'leased', 'succeeded', 'dead_letter', 'cancelled');
alter table public.workflow_schedules add column catch_up_policy text not null default 'skip' check (catch_up_policy in ('skip','run_once'));
alter table public.workflow_schedules add column maximum_lateness interval not null default interval '30 minutes';
alter table public.workflow_schedules add column priority smallint not null default 2 check (priority between 0 and 4);
alter table public.workflow_runs add column priority smallint not null default 2 check (priority between 0 and 4);
alter table public.workflow_runs add column budget_reservation_id uuid;
alter table public.workflow_runs add column cancelled_at timestamptz;
alter table public.monthly_budgets add column provider_backstop numeric(12,2);
alter table public.monthly_budgets add column reserve_percentage numeric(5,4) not null default 0.1000 check (reserve_percentage between 0 and 1);
alter table public.monthly_budgets add column locked boolean not null default false;
alter table public.cost_reservations add column released_amount numeric(12,2) not null default 0 check (released_amount >= 0);
alter table public.cost_reservations add column estimate_version integer not null default 1;
alter table public.cost_reservations add constraint cost_reservations_amounts_check check (consumed_amount + released_amount <= reserved_amount);
alter table public.ai_calls add column estimated_cost numeric(12,6) not null default 0 check (estimated_cost >= 0);
alter table public.ai_calls add column response_id text;
alter table public.ai_calls add column request_id text;
alter table public.ai_calls add column cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0);
alter table public.ai_calls add column reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0);
alter table public.ai_calls add column search_calls integer not null default 0 check (search_calls >= 0);
alter table public.ai_calls add column prompt_version_id uuid references public.prompt_versions(id);
alter table public.ai_model_catalog add column supported_tools text[] not null default '{}';
alter table public.ai_model_catalog add column max_context_tokens integer;
alter table public.ai_model_catalog add column max_output_tokens integer;
alter table public.ai_model_catalog add column default_reasoning text;
alter table public.model_pricing add column cache_write_multiplier numeric(8,4) not null default 1.25 check (cache_write_multiplier >= 1);
alter table public.model_pricing add column web_search_per_call numeric(12,6) not null default 0 check (web_search_per_call >= 0);
alter table public.model_pricing add column currency char(3) not null default 'USD' check (currency = 'USD');
alter table public.notifications add column body_reference text;
alter table public.notifications add column correlation_id uuid;
alter table public.notifications add column gmail_message_id text;
alter table public.feedback add column status text not null default 'unreviewed' check (status in ('unreviewed','reviewed','included_in_quality_review'));
create table public.job_queue (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), run_id uuid not null references public.workflow_runs(id) on delete cascade, job_type text not null, payload jsonb not null default '{}'::jsonb, priority smallint not null default 2 check (priority between 0 and 4), available_at timestamptz not null default now(), lease_owner text, lease_expires_at timestamptz, attempt_count integer not null default 0 check (attempt_count >= 0), maximum_attempts integer not null default 3 check (maximum_attempts between 1 and 10), status public.job_status not null default 'queued', deduplication_key text not null unique, created_at timestamptz not null default now(), completed_at timestamptz);
create table public.run_steps (id uuid primary key default gen_random_uuid(), run_id uuid not null references public.workflow_runs(id) on delete cascade, sequence integer not null check (sequence > 0), step_code text not null, status public.run_status not null default 'queued', started_at timestamptz, completed_at timestamptz, redacted_error text, retry_metadata jsonb not null default '{}'::jsonb, unique(run_id, sequence));
create table public.report_sections (id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id) on delete cascade, code text not null, title text not null, display_order integer not null check (display_order >= 0), content text not null, structured_data jsonb not null default '{}'::jsonb, evidence_references jsonb not null default '[]'::jsonb, unique(report_id, code));
create table public.on_demand_budgets (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), run_id uuid unique references public.workflow_runs(id), manager_code text not null, hard_cap numeric(12,2) not null check (hard_cap > 0), reserved_amount numeric(12,2) not null default 0 check (reserved_amount >= 0), actual_amount numeric(12,2) not null default 0 check (actual_amount >= 0), model_ceiling text not null, search_ceiling integer not null default 0 check (search_ceiling >= 0), expires_at timestamptz not null, status text not null default 'active' check (status in ('active','exhausted','expired','closed')));
create table public.spend_forecasts (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), month date not null, calculated_at timestamptz not null default now(), actual_spend numeric(12,6) not null, expected_completed numeric(12,6) not null, original_month_end numeric(12,6) not null, remaining_estimate numeric(12,6) not null, variance_factor numeric(8,4) not null, adjusted_month_end numeric(12,6) not null, confidence text not null check (confidence in ('low','medium','high')), method_version integer not null default 1);
create table public.feedback_categories (id uuid primary key default gen_random_uuid(), workflow_code text not null, section_code text, label text not null, active boolean not null default true, unique(workflow_code, section_code, label));
create table public.webhook_events (id uuid primary key default gen_random_uuid(), provider text not null, external_id text not null, signature_verified boolean not null default false, status text not null default 'received', payload_reference text, received_at timestamptz not null default now(), unique(provider, external_id));
create table public.mfa_reauthentication_events (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, verified_at timestamptz not null default now(), method text not null check(method in ('totp')), created_at timestamptz not null default now());
create index job_queue_claim_idx on public.job_queue(status, available_at, priority, created_at);
create index job_queue_lease_idx on public.job_queue(lease_expires_at) where status = 'leased';
create index trace_events_run_created_idx on public.trace_events(correlation_id, created_at);
alter table public.job_queue enable row level security; alter table public.run_steps enable row level security; alter table public.report_sections enable row level security; alter table public.on_demand_budgets enable row level security; alter table public.spend_forecasts enable row level security; alter table public.feedback_categories enable row level security; alter table public.webhook_events enable row level security;
alter table public.mfa_reauthentication_events enable row level security;
create policy own_jobs on public.job_queue for select using (user_id = auth.uid() and public.is_allowed_aal2());
create policy own_steps on public.run_steps for select using (exists (select 1 from public.workflow_runs r where r.id = run_id and r.user_id = auth.uid()) and public.is_allowed_aal2());
create policy own_sections on public.report_sections for select using (exists (select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid()) and public.is_allowed_aal2());
create policy own_on_demand_budgets on public.on_demand_budgets for select using (user_id = auth.uid() and public.is_allowed_aal2());
create policy own_forecasts on public.spend_forecasts for select using (user_id = auth.uid() and public.is_allowed_aal2());
create policy allowed_feedback_categories on public.feedback_categories for select using (public.is_allowed_aal2());
create policy deny_webhook_reads on public.webhook_events for select using (false);
create policy own_mfa_reauthentication_events on public.mfa_reauthentication_events for insert with check(user_id = auth.uid() and public.is_allowed_aal2());
grant select on public.job_queue, public.run_steps, public.report_sections, public.on_demand_budgets, public.spend_forecasts, public.feedback_categories to authenticated;
grant insert on public.mfa_reauthentication_events to authenticated;

create or replace function public.claim_job_queue(p_worker_id text, p_limit integer default 1)
returns setof public.job_queue language plpgsql security definer set search_path = public as $$
begin
  return query with claimed as (
    select id from public.job_queue
    where (status = 'queued' and available_at <= now()) or (status = 'leased' and lease_expires_at < now())
    order by priority asc, available_at asc, created_at asc for update skip locked limit greatest(1, least(p_limit, 20))
  ) update public.job_queue q set status = 'leased', lease_owner = p_worker_id, lease_expires_at = now() + interval '5 minutes', attempt_count = q.attempt_count + 1
  from claimed where q.id = claimed.id returning q.*;
end; $$;

create or replace function public.reserve_recurring_budget(p_user_id uuid, p_run_id uuid, p_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_budget public.monthly_budgets; v_reserved numeric; v_reservation uuid;
begin
  select * into v_budget from public.monthly_budgets where user_id = p_user_id and month = date_trunc('month', now() at time zone 'Europe/London')::date for update;
  if not found then insert into public.monthly_budgets(user_id, month) values (p_user_id, date_trunc('month', now() at time zone 'Europe/London')::date) returning * into v_budget; end if;
  select coalesce(sum(reserved_amount - consumed_amount - released_amount), 0) into v_reserved from public.cost_reservations where user_id = p_user_id and category = 'recurring' and status = 'reserved';
  if v_budget.actual_recurring + v_reserved + p_amount > v_budget.recurring_hard_cap then raise exception 'recurring_hard_cap_exceeded'; end if;
  insert into public.cost_reservations(user_id, run_id, category, reserved_amount, status) values (p_user_id, p_run_id, 'recurring', p_amount, 'reserved') returning id into v_reservation;
  return v_reservation;
end; $$;

create or replace function public.dispatch_due_schedules(p_now timestamptz default now())
returns table(run_id uuid, user_id uuid, correlation_id uuid) language plpgsql security definer set search_path = public as $$
declare schedule_row record; created_run uuid; created_correlation uuid;
begin
  if not pg_try_advisory_xact_lock(hashtext('ai_operations.scheduler_dispatch')) then return; end if;
  for schedule_row in
    select s.* from public.workflow_schedules s
    where s.enabled and s.next_due_at <= p_now
      and (s.next_due_at >= p_now - s.maximum_lateness or s.catch_up_policy = 'run_once')
    order by s.next_due_at for update skip locked
  loop
    created_correlation := gen_random_uuid();
    insert into public.workflow_runs(user_id, workflow_definition_id, trigger, priority, correlation_id, idempotency_key)
      values (schedule_row.user_id, schedule_row.workflow_definition_id, 'schedule', schedule_row.priority, created_correlation, 'schedule:' || schedule_row.id || ':' || schedule_row.next_due_at)
      on conflict (idempotency_key) do nothing returning id into created_run;
    if created_run is not null then
      insert into public.job_queue(user_id, run_id, job_type, priority, deduplication_key)
        values (schedule_row.user_id, created_run, 'workflow_execute', schedule_row.priority, 'run:' || created_run);
      insert into public.trace_events(user_id, correlation_id, event_type, redacted_payload)
        values (schedule_row.user_id, created_correlation, 'run_queued', jsonb_build_object('schedule_id', schedule_row.id, 'run_id', created_run));
      run_id := created_run; user_id := schedule_row.user_id; correlation_id := created_correlation; return next;
    end if;
    created_run := null;
  end loop;
end; $$;

create or replace function public.complete_job_queue(p_job_id uuid, p_worker_id text, p_succeeded boolean, p_redacted_error text default null)
returns public.job_queue language plpgsql security definer set search_path = public as $$
declare completed public.job_queue; retry_delay interval;
begin
  select * into completed from public.job_queue where id = p_job_id and status = 'leased' and lease_owner = p_worker_id for update;
  if not found then raise exception 'job_lease_not_owned'; end if;
  if p_succeeded then
    update public.job_queue set status = 'succeeded', completed_at = now(), lease_owner = null, lease_expires_at = null where id = p_job_id returning * into completed;
  elsif completed.attempt_count >= completed.maximum_attempts then
    update public.job_queue set status = 'dead_letter', completed_at = now(), lease_owner = null, lease_expires_at = null where id = p_job_id returning * into completed;
  else
    retry_delay := make_interval(secs => least(3600, 2 ^ completed.attempt_count) + floor(random() * 30)::int);
    update public.job_queue set status = 'queued', available_at = now() + retry_delay, lease_owner = null, lease_expires_at = null where id = p_job_id returning * into completed;
  end if;
  update public.workflow_runs set status = case when completed.status = 'succeeded' then 'succeeded' when completed.status = 'dead_letter' then 'failed' else status end, completed_at = case when completed.status in ('succeeded','dead_letter') then now() else completed_at end, redacted_error = case when completed.status = 'dead_letter' then p_redacted_error else redacted_error end where id = completed.run_id;
  insert into public.trace_events(user_id, correlation_id, event_type, severity, redacted_payload)
    select r.user_id, r.correlation_id, case when completed.status = 'succeeded' then 'job_succeeded' when completed.status = 'dead_letter' then 'job_dead_lettered' else 'job_retry_scheduled' end, case when completed.status = 'dead_letter' then 'error' else 'info' end, jsonb_build_object('job_id', completed.id, 'attempt', completed.attempt_count, 'error', p_redacted_error) from public.workflow_runs r where r.id = completed.run_id;
  return completed;
end; $$;

create or replace function public.create_on_demand_run(p_user_id uuid, p_workflow_id uuid, p_manager_code text, p_hard_cap numeric, p_model_ceiling text, p_search_ceiling integer, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare created_run uuid;
begin
  if p_hard_cap <= 0 or p_hard_cap > 1000 then raise exception 'invalid_on_demand_cap'; end if;
  if p_search_ceiling < 0 or p_search_ceiling > 20 then raise exception 'invalid_search_ceiling'; end if;
  insert into public.workflow_runs(user_id, workflow_definition_id, status, trigger, priority, idempotency_key)
    values (p_user_id, p_workflow_id, 'queued', 'on_demand', 1, p_idempotency_key)
    on conflict (idempotency_key) do nothing returning id into created_run;
  if created_run is null then select id into created_run from public.workflow_runs where idempotency_key = p_idempotency_key and user_id = p_user_id; return created_run; end if;
  insert into public.on_demand_budgets(user_id, run_id, manager_code, hard_cap, model_ceiling, search_ceiling, expires_at)
    values (p_user_id, created_run, p_manager_code, p_hard_cap, p_model_ceiling, p_search_ceiling, now() + interval '24 hours');
  insert into public.job_queue(user_id, run_id, job_type, priority, deduplication_key)
    values (p_user_id, created_run, 'workflow_execute', 1, 'run:' || created_run);
  insert into public.trace_events(user_id, correlation_id, event_type, redacted_payload)
    select user_id, correlation_id, 'on_demand_run_queued', jsonb_build_object('run_id', created_run, 'hard_cap', p_hard_cap) from public.workflow_runs where id = created_run;
  return created_run;
end; $$;

create or replace function public.decide_approval(p_user_id uuid, p_approval_id uuid, p_decision public.approval_decision, p_note text default null)
returns public.approvals language plpgsql security definer set search_path = public as $$
declare decided public.approvals;
begin
  if p_decision not in ('approved','rejected') then raise exception 'invalid_approval_decision'; end if;
  if not exists(select 1 from public.mfa_reauthentication_events where user_id = p_user_id and verified_at >= now() - interval '5 minutes') then raise exception 'fresh_mfa_required'; end if;
  update public.approvals set decision = p_decision, decided_at = now() where id = p_approval_id and user_id = p_user_id and decision = 'pending' and expires_at > now() returning * into decided;
  if not found then raise exception 'approval_not_pending'; end if;
  update public.actions set status = case when p_decision = 'approved' then 'approved' else 'rejected' end where id = decided.action_id;
  insert into public.audit_events(user_id, actor_type, action_type, target_type, target_id, aal, result, redacted_after) values (p_user_id, 'user', 'decide_approval', 'approval', p_approval_id::text, 'aal2_fresh', 'success', jsonb_build_object('decision', p_decision, 'note', left(coalesce(p_note, ''), 500)));
  return decided;
end; $$;

create or replace function public.complete_synthetic_systems_run(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare run_row record; created_report uuid; notification_key text;
begin
  select r.id, r.user_id, r.correlation_id, d.code into run_row from public.workflow_runs r join public.workflow_definitions d on d.id = r.workflow_definition_id where r.id = p_run_id for update;
  if not found or run_row.code not like 'systems-%' then raise exception 'unsupported_synthetic_run'; end if;
  insert into public.reports(user_id, run_id, report_type, title, summary, markdown, structured_metrics, status)
    values (run_row.user_id, p_run_id, run_row.code, 'Systems platform report', 'Synthetic platform health is within policy.', '## Systems platform report\n\nSynthetic platform health is within policy.', jsonb_build_object('workflow', run_row.code, 'deterministic', true), 'validated')
    on conflict do nothing returning id into created_report;
  if created_report is null then select id into created_report from public.reports where run_id = p_run_id; return created_report; end if;
  insert into public.report_sections(report_id, code, title, display_order, content, structured_data, evidence_references)
    values (created_report, 'platform-health', 'Platform health', 0, 'Synthetic platform health is within policy.', jsonb_build_object('deterministic', true), jsonb_build_array('synthetic-platform-health'));
  if run_row.code <> 'systems-daily-cost-capacity' then
    notification_key := 'report:' || created_report;
    insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key, correlation_id)
      values (run_row.user_id, 'report', 'Matthew.irving.ai@gmail.com', '[AI Operations] Systems platform report', 'queued', notification_key, run_row.correlation_id)
      on conflict (dedupe_key) do nothing;
  end if;
  insert into public.trace_events(user_id, correlation_id, event_type, redacted_payload)
    values (run_row.user_id, run_row.correlation_id, 'report_validated', jsonb_build_object('report_id', created_report, 'workflow', run_row.code));
  return created_report;
end; $$;

create or replace function public.calculate_spend_forecast(p_user_id uuid, p_month date default date_trunc('month', now() at time zone 'Europe/London')::date)
returns public.spend_forecasts language plpgsql security definer set search_path = public as $$
declare result public.spend_forecasts; actual_total numeric := 0; expected_total numeric := 0; remaining numeric := 0; factor numeric := 1; completed_calls integer := 0;
begin
  select coalesce(sum(actual_cost), 0), coalesce(sum(estimated_cost), 0), count(*) into actual_total, expected_total, completed_calls
  from public.ai_calls where user_id = p_user_id and status = 'succeeded' and created_at >= p_month and created_at < (p_month + interval '1 month');
  select coalesce(sum(reserved_amount - consumed_amount - released_amount), 0) into remaining from public.cost_reservations where user_id = p_user_id and category = 'recurring' and status = 'reserved';
  if expected_total > 0 then factor := actual_total / expected_total; end if;
  factor := least(3, greatest(0.5, factor));
  insert into public.spend_forecasts(user_id, month, actual_spend, expected_completed, original_month_end, remaining_estimate, variance_factor, adjusted_month_end, confidence)
    values (p_user_id, p_month, actual_total, expected_total, actual_total + remaining, remaining, factor, actual_total + remaining * factor, case when completed_calls >= 20 then 'high' when completed_calls >= 5 then 'medium' else 'low' end)
    returning * into result;
  return result;
end; $$;

alter table public.workflow_definitions drop constraint workflow_definitions_manager_id_version_key;
alter table public.workflow_definitions add constraint workflow_definitions_manager_code_version_key unique(manager_id, code, version);

insert into public.workflow_definitions(manager_id, code, version, trigger_type, input_schema, output_schema, active)
select id, 'systems-daily-cost-capacity', 1, 'schedule_or_manual', '{"type":"object","additionalProperties":false}'::jsonb, '{"type":"object","additionalProperties":false}'::jsonb, true from public.managers where code = 'systems'
on conflict (code) do nothing;

update public.ai_model_catalog set enabled = true, supported_tools = array['web_search','function'], max_context_tokens = 1050000, max_output_tokens = 128000, default_reasoning = case tier when 'luna' then 'low' when 'terra' then 'medium' else 'high' end;
insert into public.model_pricing(model_id, effective_from, input_per_million, cached_input_per_million, output_per_million, source_url, verified_at, cache_write_multiplier, web_search_per_call)
select id, '2026-08-03T00:00:00Z', case model_id when 'gpt-5.6-luna' then 1.00 when 'gpt-5.6-terra' then 2.50 else 5.00 end, case model_id when 'gpt-5.6-luna' then 0.10 when 'gpt-5.6-terra' then 0.25 else 0.50 end, case model_id when 'gpt-5.6-luna' then 6.00 when 'gpt-5.6-terra' then 15.00 else 30.00 end, 'https://developers.openai.com/api/docs/models/compare', '2026-08-03T00:00:00Z', 1.25, 0 from public.ai_model_catalog
on conflict (model_id, effective_from) do nothing;
insert into public.workflow_definitions(manager_id, code, version, trigger_type, input_schema, output_schema, active)
select id, 'systems-weekly-quality-platform', 1, 'schedule_or_manual', '{"type":"object","additionalProperties":false}'::jsonb, '{"type":"object","additionalProperties":false}'::jsonb, true from public.managers where code = 'systems'
on conflict (code) do nothing;
insert into public.workflow_definitions(manager_id, code, version, trigger_type, input_schema, output_schema, active)
select id, 'systems-monthly-cost-report', 1, 'schedule_or_manual', '{"type":"object","additionalProperties":false}'::jsonb, '{"type":"object","additionalProperties":false}'::jsonb, true from public.managers where code = 'systems'
on conflict (code) do nothing;

-- The dispatcher itself retains the advisory lock; this durable cron trigger is therefore safe
-- when an operator also invokes the authenticated Edge Function for recovery.
create extension if not exists pg_cron;
select cron.schedule(
  'ai-operations-scheduler-dispatch-5m',
  '*/5 * * * *',
  $$select public.dispatch_due_schedules();$$
);
