begin;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000101',
  'authenticated', 'authenticated', 'matthewirving99@gmail.com',
  crypt('synthetic-only', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb,
  now(), now()
)
on conflict (id) do nothing;
insert into public.app_users(id, email, is_allowed)
values ('00000000-0000-0000-0000-000000000101', 'matthewirving99@gmail.com', true)
on conflict (id) do update set is_allowed = excluded.is_allowed;

insert into public.workflow_runs (
  id, user_id, workflow_definition_id, status, trigger, idempotency_key
)
select run_id, '00000000-0000-0000-0000-000000000101', id, 'running', 'test', key
from public.workflow_definitions
cross join (values
  ('00000000-0000-4000-8000-000000001811'::uuid, 'queue-outcome-success'),
  ('00000000-0000-4000-8000-000000001812'::uuid, 'queue-outcome-retry'),
  ('00000000-0000-4000-8000-000000001813'::uuid, 'queue-outcome-terminal'),
  ('00000000-0000-4000-8000-000000001814'::uuid, 'queue-outcome-exhausted')
) as fixture(run_id, key)
where code = 'systems-daily-cost-capacity';

insert into public.job_queue (
  id, user_id, run_id, job_type, status, lease_owner, lease_expires_at,
  attempt_count, maximum_attempts, deduplication_key
)
values
  ('00000000-0000-4000-8000-000000001821', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001811', 'workflow_execute', 'leased', 'worker-outcome', now() + interval '5 minutes', 1, 3, 'queue-outcome-success'),
  ('00000000-0000-4000-8000-000000001822', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001812', 'workflow_execute', 'leased', 'worker-outcome', now() + interval '5 minutes', 1, 3, 'queue-outcome-retry'),
  ('00000000-0000-4000-8000-000000001823', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001813', 'workflow_execute', 'leased', 'worker-outcome', now() + interval '5 minutes', 1, 3, 'queue-outcome-terminal'),
  ('00000000-0000-4000-8000-000000001824', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001814', 'workflow_execute', 'leased', 'worker-outcome', now() + interval '5 minutes', 3, 3, 'queue-outcome-exhausted');

select is(
  (select status::text from public.complete_job_queue('00000000-0000-4000-8000-000000001821', 'worker-outcome', 'succeeded', null)),
  'succeeded',
  'success completes the queue job'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001811'),
  'succeeded',
  'success completes the canonical run'
);
select is(
  (select status::text from public.complete_job_queue('00000000-0000-4000-8000-000000001822', 'worker-outcome', 'retryable_failure', 'provider_unavailable')),
  'queued',
  'retryable failure requeues while attempts remain'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001812'),
  'running',
  'retryable failure leaves the canonical run resumable'
);
select is(
  (select error_code from public.workflow_runs where id = '00000000-0000-4000-8000-000000001812'),
  'provider_unavailable',
  'retryable failure persists only its safe error code'
);
select ok(
  (select available_at > now() and lease_owner is null and lease_expires_at is null
   from public.job_queue where id = '00000000-0000-4000-8000-000000001822'),
  'retry clears lease and schedules a backoff'
);
select is(
  (select status::text from public.complete_job_queue('00000000-0000-4000-8000-000000001823', 'worker-outcome', 'terminal_failure', 'invalid_workflow')),
  'dead_letter',
  'terminal failure dead-letters immediately'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001813'),
  'failed',
  'terminal failure fails the canonical run'
);
select is(
  (select status::text from public.complete_job_queue('00000000-0000-4000-8000-000000001824', 'worker-outcome', 'retryable_failure', 'provider_unavailable')),
  'dead_letter',
  'retryable failure dead-letters at maximum attempts'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001814'),
  'failed',
  'maximum attempts fails the canonical run'
);
select throws_ok(
  $$select public.complete_job_queue('00000000-0000-4000-8000-000000001821', 'worker-outcome', 'unknown', null)$$,
  'P0001',
  'invalid_job_outcome',
  'unknown outcomes are rejected'
);
select ok(
  position('for update;' in pg_get_functiondef('public.complete_job_queue(uuid,text,text,text)'::regprocedure))
    < position('transition_at := clock_timestamp()' in pg_get_functiondef('public.complete_job_queue(uuid,text,text,text)'::regprocedure)),
  'typed completion checks lease time only after acquiring the job lock'
);

select * from finish();
rollback;
