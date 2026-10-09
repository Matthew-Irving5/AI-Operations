begin;
select plan(3);

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
  '00000000-0000-4000-8000-000000001801',
  '00000000-0000-0000-0000-000000000101',
  id,
  'queued',
  'test',
  'queue-lease-expired-owner-test'
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
  status,
  deduplication_key
)
values (
  '00000000-0000-4000-8000-000000001802',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-4000-8000-000000001801',
  'workflow_execute',
  'worker-expired',
  now() - interval '1 second',
  1,
  'leased',
  'queue-lease-expired-owner-test'
);

select throws_ok(
  $$select public.complete_job_queue(
    '00000000-0000-4000-8000-000000001802',
    'worker-expired',
    true,
    null
  )$$,
  'P0001',
  'job_lease_not_owned',
  'an expired lease cannot be completed by its former owner'
);

select throws_ok(
  $$select public.complete_job_queue(
    '00000000-0000-4000-8000-000000001802',
    'worker-expired',
    'succeeded',
    null
  )$$,
  'P0001',
  'job_lease_not_owned',
  'typed outcome completion also rejects an expired lease'
);

select ok(
  position(
    'for update;'
    in pg_get_functiondef(
    'public.complete_job_queue(uuid,text,text,text)'::regprocedure
    )
  ) < position(
    'transition_at := clock_timestamp()'
    in pg_get_functiondef(
    'public.complete_job_queue(uuid,text,text,text)'::regprocedure
    )
  ),
  'completion reads wall-clock time only after acquiring the job row lock'
);

select * from finish();
rollback;
