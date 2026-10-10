alter table public.run_steps
  add column attempt_count integer not null default 1 check (attempt_count > 0);

create table public.run_step_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_code text not null,
  attempt_number integer not null check (attempt_number > 0),
  status public.run_status not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms bigint,
  redacted_error text,
  trace_id uuid,
  unique (run_id, step_code, attempt_number),
  check ((status = 'running' and completed_at is null) or (status <> 'running' and completed_at is not null))
);
alter table public.run_step_attempts enable row level security;
revoke all privileges on table public.run_step_attempts from public, anon, authenticated, service_role;
create policy own_run_step_attempts on public.run_step_attempts for select
  using (exists (select 1 from public.workflow_runs r where r.id = run_id and r.user_id = auth.uid()) and public.is_allowed_aal2());
grant select on public.run_step_attempts to authenticated;

create or replace function public.record_workflow_stage(
  p_run_id uuid,
  p_step_code text,
  p_sequence integer,
  p_status text,
  p_input_reference text default null,
  p_output_reference text default null,
  p_redacted_error text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  stage_status public.run_status;
  queue_attempt integer;
  started timestamptz;
  finished timestamptz;
  trace uuid;
begin
  if p_step_code !~ '^[a-z][a-z0-9_]{1,99}$' or p_sequence < 1
    or p_status not in ('running', 'succeeded', 'failed') then
    raise exception 'invalid_workflow_stage';
  end if;
  stage_status := p_status::public.run_status;
  select greatest(coalesce(max(attempt_count), 1), 1) into queue_attempt
    from public.job_queue where run_id = p_run_id and job_type = 'workflow_execute';
  select correlation_id into trace from public.workflow_runs where id = p_run_id;
  if trace is null then raise exception 'workflow_run_not_found'; end if;
  started := now();
  finished := case when stage_status = 'running' then null else now() end;

  insert into public.run_steps(
    run_id, sequence, step_code, status, started_at, completed_at,
    redacted_error, input_reference, output_reference, trace_id, attempt_count
  ) values (
    p_run_id, p_sequence, p_step_code, stage_status, started, finished,
    p_redacted_error, p_input_reference, p_output_reference, trace, queue_attempt
  ) on conflict (run_id, step_code) do update set
    sequence = excluded.sequence,
    status = excluded.status,
    started_at = coalesce(public.run_steps.started_at, excluded.started_at),
    completed_at = case when excluded.status = 'running' then null else coalesce(public.run_steps.completed_at, excluded.completed_at) end,
    redacted_error = excluded.redacted_error,
    input_reference = coalesce(excluded.input_reference, public.run_steps.input_reference),
    output_reference = coalesce(excluded.output_reference, public.run_steps.output_reference),
    trace_id = excluded.trace_id,
    attempt_count = greatest(public.run_steps.attempt_count, excluded.attempt_count);

  insert into public.run_step_attempts(
    run_id, step_code, attempt_number, status, started_at, completed_at,
    duration_ms, redacted_error, trace_id
  ) values (
    p_run_id, p_step_code, queue_attempt, stage_status, started, finished,
    case when finished is null then null else greatest(0, (extract(epoch from (finished - started)) * 1000)::bigint) end,
    p_redacted_error, trace
  ) on conflict (run_id, step_code, attempt_number) do update set
    status = excluded.status,
    started_at = coalesce(public.run_step_attempts.started_at, excluded.started_at),
    completed_at = case when excluded.status = 'running' then null else coalesce(public.run_step_attempts.completed_at, excluded.completed_at) end,
    duration_ms = case when excluded.status = 'running' then null else coalesce(public.run_step_attempts.duration_ms, greatest(0, (extract(epoch from (excluded.completed_at - public.run_step_attempts.started_at)) * 1000)::bigint)) end,
    redacted_error = excluded.redacted_error,
    trace_id = excluded.trace_id;
end;
$$;

revoke all on function public.record_workflow_stage(uuid, text, integer, text, text, text, text) from public;
grant execute on function public.record_workflow_stage(uuid, text, integer, text, text, text, text) to service_role;
