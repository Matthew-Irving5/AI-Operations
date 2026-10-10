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
on conflict (id) do update set email = excluded.email, is_allowed = excluded.is_allowed;

insert into public.workflow_runs (
  id, user_id, workflow_definition_id, status, trigger, idempotency_key
)
select run_id, '00000000-0000-0000-0000-000000000101', id, 'queued', 'test', key
from public.workflow_definitions
cross join (values
  ('00000000-0000-4000-8000-000000001881'::uuid, 'targeted-queue-request'),
  ('00000000-0000-4000-8000-000000001882'::uuid, 'older-unrelated-queue-request')
) as fixture(run_id, key)
where code = 'systems-daily-cost-capacity';

insert into public.job_queue (
  id, user_id, run_id, job_type, priority, deduplication_key, created_at
)
values
  ('00000000-0000-4000-8000-000000001891', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001882', 'workflow_execute', 0, 'older-unrelated-queue-request', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000001892', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001881', 'workflow_execute', 4, 'targeted-queue-request', now()),
  ('00000000-0000-4000-8000-000000001893', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001881', 'notification_delivery', 0, 'targeted-notification', now());

select is(
  (select id from public.claim_job_queue_for_run('worker-targeted', '00000000-0000-4000-8000-000000001881')),
  '00000000-0000-4000-8000-000000001892'::uuid,
  'targeted claim leases only the requested run even behind an older higher-priority job'
);
select is(
  (select status::text from public.job_queue where id = '00000000-0000-4000-8000-000000001892'),
  'leased',
  'target queue row receives a lease'
);
select is(
  (select lease_owner from public.job_queue where id = '00000000-0000-4000-8000-000000001892'),
  'worker-targeted',
  'target lease is bound to the requesting worker'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001881'),
  'running',
  'target run starts atomically with its lease'
);
select is(
  (select status::text from public.job_queue where id = '00000000-0000-4000-8000-000000001891'),
  'queued',
  'targeted dispatch leaves the older unrelated queue row untouched'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001882'),
  'queued',
  'targeted dispatch leaves the unrelated run untouched'
);
select is(
  (select status::text from public.job_queue where id = '00000000-0000-4000-8000-000000001893'),
  'queued',
  'targeted workflow claim does not claim a different job type from the same run'
);
select is(
  (select count(*) from public.claim_job_queue_for_run('worker-second', '00000000-0000-4000-8000-000000001881')),
  0::bigint,
  'a live target lease cannot be claimed a second time'
);
select is(
  (select count(*) from public.claim_job_queue_for_run('worker-missing', '00000000-0000-4000-8000-000000001899')),
  0::bigint,
  'a target with no eligible queue row does not fall back to generic work'
);
select is(
  (select count(*) from public.claim_job_queue_for_run('worker-null', null)),
  0::bigint,
  'a null target cannot degrade into a generic queue claim'
);
select is(
  (select id from public.claim_job_queue('worker-generic', 1)),
  '00000000-0000-4000-8000-000000001891'::uuid,
  'generic claims retain their existing priority and ordering semantics'
);
select is(
  (select status::text from public.job_queue where id = '00000000-0000-4000-8000-000000001891'),
  'leased',
  'older unrelated work remains available to the generic worker'
);

select * from finish();
rollback;
