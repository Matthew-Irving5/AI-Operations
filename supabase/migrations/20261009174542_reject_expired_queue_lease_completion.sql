create or replace function public.complete_job_queue(
  p_job_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_redacted_error text default null
)
returns public.job_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  completed public.job_queue;
  retry_delay interval;
  transition_at timestamptz;
begin
  select *
  into completed
  from public.job_queue
  where id = p_job_id
    and status = 'leased'
    and lease_owner = p_worker_id
  for update;

  if not found then
    raise exception 'job_lease_not_owned';
  end if;

  transition_at := clock_timestamp();
  if completed.lease_expires_at <= transition_at then
    raise exception 'job_lease_not_owned';
  end if;

  if p_succeeded then
    update public.job_queue
    set status = 'succeeded',
        completed_at = transition_at,
        lease_owner = null,
        lease_expires_at = null
    where id = p_job_id
    returning * into completed;
  elsif completed.attempt_count >= completed.maximum_attempts then
    update public.job_queue
    set status = 'dead_letter',
        completed_at = transition_at,
        lease_owner = null,
        lease_expires_at = null
    where id = p_job_id
    returning * into completed;
  else
    retry_delay := make_interval(
      secs => least(3600, 2 ^ completed.attempt_count)
        + floor(random() * 30)::int
    );
    update public.job_queue
    set status = 'queued',
        available_at = transition_at + retry_delay,
        lease_owner = null,
        lease_expires_at = null
    where id = p_job_id
    returning * into completed;
  end if;

  update public.workflow_runs
  set status = case
        when completed.status = 'succeeded' then 'succeeded'
        when completed.status = 'dead_letter' then 'failed'
        else status
      end,
      completed_at = case
        when completed.status in ('succeeded', 'dead_letter') then transition_at
        else completed_at
      end,
      redacted_error = case
        when completed.status = 'dead_letter' then p_redacted_error
        else redacted_error
      end
  where id = completed.run_id;

  insert into public.trace_events(
    user_id,
    correlation_id,
    event_type,
    severity,
    redacted_payload
  )
  select
    r.user_id,
    r.correlation_id,
    case
      when completed.status = 'succeeded' then 'job_succeeded'
      when completed.status = 'dead_letter' then 'job_dead_lettered'
      else 'job_retry_scheduled'
    end,
    case when completed.status = 'dead_letter' then 'error' else 'info' end,
    jsonb_build_object(
      'job_id', completed.id,
      'attempt', completed.attempt_count,
      'error', p_redacted_error
    )
  from public.workflow_runs r
  where r.id = completed.run_id;

  return completed;
end;
$$;
