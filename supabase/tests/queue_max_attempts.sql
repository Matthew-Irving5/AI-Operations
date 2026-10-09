begin;
select plan(4);

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
  id,
  user_id,
  workflow_definition_id,
  status,
  trigger,
  idempotency_key
)
select
  '00000000-0000-4000-8000-000000001805',
  '00000000-0000-0000-0000-000000000101',
  id,
  'running',
  'test',
  'queue-expired-max-attempts-test'
from public.workflow_definitions
where code = 'systems-daily-cost-capacity';

insert into public.job_queue (
  id,
  user_id,
  run_id,
  job_type,
  lease_owner,
  lease_expires_at,
  attempt_count,
  maximum_attempts,
  status,
  deduplication_key
)
values (
  '00000000-0000-4000-8000-000000001806',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-4000-8000-000000001805',
  'workflow_execute',
  'worker-expired',
  now() - interval '1 second',
  3,
  3,
  'leased',
  'queue-expired-max-attempts-test'
);

select is(
  (select count(*) from public.claim_job_queue('worker-recovery', 1)),
  0::bigint,
  'an exhausted expired lease is not claimed for another attempt'
);

select is(
  (select status::text from public.job_queue where id = '00000000-0000-4000-8000-000000001806'),
  'dead_letter',
  'an exhausted expired lease moves to dead letter'
);

select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001805'),
  'failed',
  'dead-letter recovery marks the canonical run failed'
);

select ok(
  (select attempt_count = 3 and lease_owner is null and lease_expires_at is null and completed_at is not null
   from public.job_queue where id = '00000000-0000-4000-8000-000000001806'),
  'dead-letter recovery preserves the maximum attempt count and clears its stale lease'
);

select * from finish();
rollback;
