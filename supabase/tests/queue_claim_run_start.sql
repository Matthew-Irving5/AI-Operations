begin;
select plan(9);

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
select run_id, '00000000-0000-0000-0000-000000000101', id, 'queued', 'test', key
from public.workflow_definitions
cross join (values
  ('00000000-0000-4000-8000-000000001831'::uuid, 'queue-claim-start-workflow'),
  ('00000000-0000-4000-8000-000000001832'::uuid, 'queue-claim-start-nonworkflow')
) as fixture(run_id, key)
where code = 'systems-daily-cost-capacity';

insert into public.job_queue (
  id, user_id, run_id, job_type, priority, deduplication_key
)
values
  ('00000000-0000-4000-8000-000000001841', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001831', 'workflow_execute', 0, 'queue-claim-start-workflow'),
  ('00000000-0000-4000-8000-000000001842', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001832', 'notification_delivery', 4, 'queue-claim-start-nonworkflow');

select is(
  (select job_type from public.claim_job_queue('worker-start', 1)),
  'workflow_execute',
  'claim returns the highest-priority workflow job'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001831'),
  'running',
  'claim atomically moves a queued workflow run to running'
);
select ok(
  (select started_at is not null from public.workflow_runs where id = '00000000-0000-4000-8000-000000001831'),
  'claim records the first start timestamp'
);

create temporary table original_start as
select started_at
from public.workflow_runs
where id = '00000000-0000-4000-8000-000000001831';
update public.job_queue
set lease_expires_at = clock_timestamp() - interval '1 second'
where id = '00000000-0000-4000-8000-000000001841';
select is(
  (select started_at from public.workflow_runs where id = '00000000-0000-4000-8000-000000001831'),
  (select started_at from original_start),
  'reclaim preserves the original workflow start timestamp'
);
select is(
  (select job_type from public.claim_job_queue('worker-start', 1)),
  'workflow_execute',
  'expired workflow lease is reclaimed before lower-priority work'
);
select is(
  (select job_type from public.claim_job_queue('worker-start', 1)),
  'notification_delivery',
  'claim next returns the non-workflow job'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001832'),
  'queued',
  'claiming a non-workflow job does not start its run'
);
select ok(
  (select started_at is null from public.workflow_runs where id = '00000000-0000-4000-8000-000000001832'),
  'non-workflow claim leaves the run start timestamp empty'
);
select is(
  (select count(*) from public.trace_events
   where event_type = 'job_leased'
     and redacted_payload->>'job_id' in (
       '00000000-0000-4000-8000-000000001841',
       '00000000-0000-4000-8000-000000001842'
     )),
  3::bigint,
  'each successful claim attempt writes one lease trace'
);

select * from finish();
rollback;
