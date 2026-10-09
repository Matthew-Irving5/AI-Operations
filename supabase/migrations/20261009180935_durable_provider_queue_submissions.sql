alter type public.job_status add value if not exists 'awaiting_provider';

create table public.job_provider_submissions (
  response_id text primary key
    check (response_id ~ '^resp_[A-Za-z0-9_-]{6,200}$'),
  job_id uuid not null references public.job_queue(id) on delete cascade,
  attempt_count integer not null check (attempt_count > 0),
  status text not null default 'awaiting_provider'
    check (status in (
      'awaiting_provider', 'succeeded', 'terminal_failure', 'expired'
    )),
  submitted_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  error_code text check (
    error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,99}$'
  ),
  unique (job_id, attempt_count),
  check ((status = 'awaiting_provider') = (completed_at is null))
);

create index job_provider_submissions_expiry_idx
  on public.job_provider_submissions (expires_at, job_id)
  where status = 'awaiting_provider';

alter table public.job_provider_submissions enable row level security;
create policy deny_data_api_clients
  on public.job_provider_submissions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
revoke all privileges on table
  public.job_provider_submissions
from public, anon, authenticated, service_role;

create or replace function public.submit_workflow_job_response(
  p_run_id uuid,
  p_response_id text
)
returns public.job_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  submitted_job public.job_queue;
  prior_submission public.job_provider_submissions;
  transition_at timestamptz;
  active_job_count integer;
begin
  if p_response_id is null
    or p_response_id !~ '^resp_[A-Za-z0-9_-]{6,200}$' then
    raise exception 'invalid_provider_response_id';
  end if;

  select *
  into prior_submission
  from public.job_provider_submissions
  where response_id = p_response_id;
  if found then
    select *
    into submitted_job
    from public.job_queue
    where id = prior_submission.job_id
    for update;
    select *
    into prior_submission
    from public.job_provider_submissions
    where response_id = p_response_id
    for update;
    if submitted_job.run_id <> p_run_id then
      raise exception 'provider_response_run_mismatch';
    end if;
    return submitted_job;
  end if;

  select count(*)
  into active_job_count
  from public.job_queue
  where run_id = p_run_id
    and job_type = 'workflow_execute'
    and status = 'leased'
    and lease_expires_at > clock_timestamp();
  if active_job_count = 0 then
    select *
    into prior_submission
    from public.job_provider_submissions
    where response_id = p_response_id;
    if found then
      select *
      into submitted_job
      from public.job_queue
      where id = prior_submission.job_id
      for update;
      select *
      into prior_submission
      from public.job_provider_submissions
      where response_id = p_response_id
      for update;
      if submitted_job.run_id <> p_run_id then
        raise exception 'provider_response_run_mismatch';
      end if;
      return submitted_job;
    end if;
    raise exception 'workflow_job_lease_not_found';
  end if;
  if active_job_count <> 1 then
    raise exception 'workflow_job_lease_ambiguous';
  end if;

  select *
  into submitted_job
  from public.job_queue
  where run_id = p_run_id
    and job_type = 'workflow_execute'
    and status = 'leased'
    and lease_expires_at > clock_timestamp()
  for update;
  if not found then
    select *
    into prior_submission
    from public.job_provider_submissions
    where response_id = p_response_id;
    if found then
      select *
      into submitted_job
      from public.job_queue
      where id = prior_submission.job_id
      for update;
      select *
      into prior_submission
      from public.job_provider_submissions
      where response_id = p_response_id
      for update;
      if submitted_job.run_id <> p_run_id then
        raise exception 'provider_response_run_mismatch';
      end if;
      return submitted_job;
    end if;
    raise exception 'workflow_job_lease_not_found';
  end if;

  transition_at := clock_timestamp();
  if submitted_job.lease_expires_at <= transition_at then
    raise exception 'job_lease_not_owned';
  end if;

  select *
  into prior_submission
  from public.job_provider_submissions
  where response_id = p_response_id
  for update;
  if found then
    if prior_submission.job_id <> submitted_job.id then
      raise exception 'provider_response_run_mismatch';
    end if;
    return submitted_job;
  end if;

  insert into public.job_provider_submissions (
    response_id, job_id, attempt_count, expires_at
  ) values (
    p_response_id,
    submitted_job.id,
    submitted_job.attempt_count,
    transition_at + interval '10 minutes'
  );

  update public.job_queue
  set status = 'awaiting_provider',
      lease_owner = null,
      lease_expires_at = null
  where id = submitted_job.id
  returning * into submitted_job;

  insert into public.trace_events (
    user_id, correlation_id, event_type, severity, redacted_payload
  )
  select
    r.user_id,
    r.correlation_id,
    'job_awaiting_provider',
    'info',
    jsonb_build_object(
      'job_id', submitted_job.id,
      'attempt', submitted_job.attempt_count,
      'response_id', p_response_id,
      'expires_at', transition_at + interval '10 minutes'
    )
  from public.workflow_runs r
  where r.id = submitted_job.run_id;

  return submitted_job;
end;
$$;

-- AI report settlement callers lock job_queue, then this submission row, then
-- ai_calls; retain the same order here to avoid webhook/timeout deadlocks.
create or replace function public.complete_provider_queue_job(
  p_job_id uuid,
  p_response_id text,
  p_outcome text,
  p_error_code text default null
)
returns public.job_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_job public.job_queue;
  submission public.job_provider_submissions;
  transition_at timestamptz;
begin
  if p_outcome is null or p_outcome not in ('succeeded', 'terminal_failure') then
    raise exception 'invalid_provider_outcome';
  end if;
  if p_outcome = 'terminal_failure'
    and (p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{0,99}$') then
    raise exception 'invalid_job_error_code';
  end if;
  if p_outcome = 'succeeded' and p_error_code is not null then
    raise exception 'invalid_job_error_code';
  end if;

  select *
  into completed_job
  from public.job_queue
  where id = p_job_id
  for update;
  if not found then
    raise exception 'queue_job_not_found';
  end if;

  select *
  into submission
  from public.job_provider_submissions
  where job_id = p_job_id
    and response_id = p_response_id
  for update;
  if not found then
    raise exception 'provider_submission_not_found';
  end if;

  if submission.status <> 'awaiting_provider' then
    return completed_job;
  end if;
  if completed_job.status <> 'awaiting_provider'
    or submission.attempt_count <> completed_job.attempt_count then
    raise exception 'stale_provider_response';
  end if;

  transition_at := clock_timestamp();
  if submission.expires_at <= transition_at then
    raise exception 'provider_response_expired';
  end if;

  update public.job_provider_submissions
  set status = p_outcome,
      completed_at = transition_at,
      error_code = p_error_code
  where response_id = submission.response_id;

  update public.job_queue
  set status = case
        when p_outcome = 'succeeded' then 'succeeded'::public.job_status
        else 'dead_letter'::public.job_status
      end,
      completed_at = transition_at
  where id = p_job_id
  returning * into completed_job;

  update public.workflow_runs
  set status = case
        when p_outcome = 'succeeded' then 'succeeded'::public.run_status
        else 'failed'::public.run_status
      end,
      completed_at = transition_at,
      error_code = p_error_code,
      redacted_error = p_error_code
  where id = completed_job.run_id;

  insert into public.trace_events (
    user_id, correlation_id, event_type, severity, redacted_payload
  )
  select
    r.user_id,
    r.correlation_id,
    case when p_outcome = 'succeeded' then 'job_succeeded' else 'job_dead_lettered' end,
    case when p_outcome = 'succeeded' then 'info' else 'error' end,
    jsonb_build_object(
      'job_id', completed_job.id,
      'attempt', completed_job.attempt_count,
      'response_id', p_response_id,
      'outcome', p_outcome,
      'error_code', p_error_code
    )
  from public.workflow_runs r
  where r.id = completed_job.run_id;

  return completed_job;
end;
$$;

create or replace function public.claim_job_queue(
  p_worker_id text,
  p_limit integer default 1
)
returns setof public.job_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_job public.job_queue;
  expired_submission public.job_provider_submissions;
begin
  for expired_submission in
    select s.*
    from public.job_provider_submissions s
    join public.job_queue q on q.id = s.job_id
    where s.status = 'awaiting_provider'
      and s.expires_at <= clock_timestamp()
      and q.status = 'awaiting_provider'
      and q.attempt_count = s.attempt_count
    order by s.expires_at, s.submitted_at
    for update of q skip locked
    limit greatest(1, least(p_limit, 20))
  loop
    update public.job_provider_submissions
    set status = 'expired',
        completed_at = clock_timestamp(),
        error_code = 'provider_response_timeout'
    where response_id = expired_submission.response_id;

    update public.job_queue
    set status = 'dead_letter',
        completed_at = clock_timestamp()
    where id = expired_submission.job_id
    returning * into expired_job;

    update public.workflow_runs
    set status = 'failed',
        completed_at = clock_timestamp(),
        error_code = 'provider_response_timeout',
        redacted_error = 'Background provider response timed out.'
    where id = expired_job.run_id;

    insert into public.trace_events (
      user_id, correlation_id, event_type, severity, redacted_payload
    )
    select
      r.user_id,
      r.correlation_id,
      'job_dead_lettered',
      'error',
      jsonb_build_object(
        'job_id', expired_job.id,
        'attempt', expired_job.attempt_count,
        'reason', 'provider_response_timeout'
      )
    from public.workflow_runs r
    where r.id = expired_job.run_id;
  end loop;

  for expired_job in
    select q.*
    from public.job_queue q
    where q.status = 'leased'
      and q.lease_expires_at <= clock_timestamp()
      and q.attempt_count >= q.maximum_attempts
    order by q.lease_expires_at, q.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 20))
  loop
    update public.job_queue
    set status = 'dead_letter',
        completed_at = clock_timestamp(),
        lease_owner = null,
        lease_expires_at = null
    where id = expired_job.id
    returning * into expired_job;

    update public.workflow_runs
    set status = 'failed',
        completed_at = clock_timestamp(),
        error_code = 'maximum_attempts_exhausted',
        redacted_error = 'Worker lease expired after maximum attempts.'
    where id = expired_job.run_id;

    insert into public.trace_events (
      user_id, correlation_id, event_type, severity, redacted_payload
    )
    select
      r.user_id,
      r.correlation_id,
      'job_dead_lettered',
      'error',
      jsonb_build_object(
        'job_id', expired_job.id,
        'attempt', expired_job.attempt_count,
        'reason', 'lease_expired_after_maximum_attempts'
      )
    from public.workflow_runs r
    where r.id = expired_job.run_id;
  end loop;

  return query
  with candidates as (
    select q.id
    from public.job_queue q
    where (q.status = 'queued' and q.available_at <= clock_timestamp())
       or (
         q.status = 'leased'
         and q.lease_expires_at <= clock_timestamp()
         and q.attempt_count < q.maximum_attempts
       )
    order by q.priority asc, q.available_at asc, q.created_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 20))
  ), leased_jobs as (
    update public.job_queue q
    set status = 'leased',
        lease_owner = p_worker_id,
        lease_expires_at = clock_timestamp() + interval '5 minutes',
        attempt_count = q.attempt_count + 1
    from candidates
    where q.id = candidates.id
    returning q.*
  ), started_runs as (
    update public.workflow_runs r
    set status = 'running',
        started_at = coalesce(r.started_at, clock_timestamp())
    from leased_jobs j
    where j.job_type = 'workflow_execute'
      and r.id = j.run_id
      and r.status = 'queued'
    returning r.id
  ), traced_jobs as (
    insert into public.trace_events (
      user_id, correlation_id, event_type, severity, redacted_payload
    )
    select
      r.user_id,
      r.correlation_id,
      'job_leased',
      'info',
      jsonb_build_object(
        'job_id', j.id,
        'worker_id', p_worker_id,
        'attempt', j.attempt_count
      )
    from leased_jobs j
    join public.workflow_runs r on r.id = j.run_id
    returning redacted_payload
  )
  select j.*
  from leased_jobs j
  left join started_runs s on s.id = j.run_id
  left join traced_jobs t on t.redacted_payload->>'job_id' = j.id::text;
end;
$$;

revoke all privileges on function
  public.submit_workflow_job_response(uuid, text),
  public.complete_provider_queue_job(uuid, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function
  public.submit_workflow_job_response(uuid, text),
  public.complete_provider_queue_job(uuid, text, text, text)
to service_role;
