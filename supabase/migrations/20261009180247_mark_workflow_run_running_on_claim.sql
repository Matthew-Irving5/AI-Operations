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
begin
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
    where id = expired_job.run_id
      and status in ('queued', 'running');

    insert into public.trace_events (
      user_id,
      correlation_id,
      event_type,
      severity,
      redacted_payload
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
      user_id,
      correlation_id,
      event_type,
      severity,
      redacted_payload
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
