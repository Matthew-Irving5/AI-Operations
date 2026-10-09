begin;
select plan(26);

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
  id, user_id, workflow_definition_id, status, trigger, idempotency_key, started_at
)
select run_id, '00000000-0000-0000-0000-000000000101', id, 'running', 'test', key, now()
from public.workflow_definitions
cross join (values
  ('00000000-0000-4000-8000-000000001851'::uuid, 'queue-provider-success'),
  ('00000000-0000-4000-8000-000000001852'::uuid, 'queue-provider-terminal'),
  ('00000000-0000-4000-8000-000000001853'::uuid, 'queue-provider-sweep-timeout'),
  ('00000000-0000-4000-8000-000000001854'::uuid, 'queue-provider-direct-timeout'),
  ('00000000-0000-4000-8000-000000001855'::uuid, 'queue-provider-stale-attempt'),
  ('00000000-0000-4000-8000-000000001856'::uuid, 'queue-provider-no-lease'),
  ('00000000-0000-4000-8000-000000001857'::uuid, 'queue-provider-duplicate-lease')
) as fixture(run_id, key)
where code = 'systems-daily-cost-capacity';

insert into public.job_queue (
  id, user_id, run_id, job_type, status, lease_owner, lease_expires_at,
  attempt_count, maximum_attempts, deduplication_key
)
values
  ('00000000-0000-4000-8000-000000001861', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001851', 'workflow_execute', 'leased', 'worker-provider', now() + interval '5 minutes', 1, 3, 'queue-provider-success'),
  ('00000000-0000-4000-8000-000000001862', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001852', 'workflow_execute', 'leased', 'worker-provider', now() + interval '5 minutes', 1, 3, 'queue-provider-terminal'),
  ('00000000-0000-4000-8000-000000001863', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001853', 'workflow_execute', 'leased', 'worker-provider', now() + interval '5 minutes', 1, 3, 'queue-provider-sweep-timeout'),
  ('00000000-0000-4000-8000-000000001864', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001854', 'workflow_execute', 'leased', 'worker-provider', now() + interval '5 minutes', 1, 3, 'queue-provider-direct-timeout'),
  ('00000000-0000-4000-8000-000000001865', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001855', 'workflow_execute', 'leased', 'worker-provider', now() + interval '5 minutes', 1, 3, 'queue-provider-stale-attempt'),
  ('00000000-0000-4000-8000-000000001867', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001857', 'workflow_execute', 'leased', 'worker-provider', now() + interval '5 minutes', 1, 3, 'queue-provider-duplicate-a'),
  ('00000000-0000-4000-8000-000000001868', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000001857', 'workflow_execute', 'leased', 'worker-provider', now() + interval '5 minutes', 1, 3, 'queue-provider-duplicate-b');

select ok(
  (select relrowsecurity from pg_class where relname = 'job_provider_submissions' and relnamespace = 'public'::regnamespace),
  'provider response references have row-level security enabled'
);
select ok(
  not has_table_privilege('service_role', 'public.job_provider_submissions', 'SELECT,INSERT,UPDATE,DELETE'),
  'provider response references are accessible only through queue RPCs'
);

select public.submit_workflow_job_response('00000000-0000-4000-8000-000000001851', 'resp_success0001');
select public.submit_workflow_job_response('00000000-0000-4000-8000-000000001852', 'resp_terminal0001');
select public.submit_workflow_job_response('00000000-0000-4000-8000-000000001853', 'resp_sweep000001');
select public.submit_workflow_job_response('00000000-0000-4000-8000-000000001854', 'resp_direct00001');
select public.submit_workflow_job_response('00000000-0000-4000-8000-000000001855', 'resp_stale00001');

select is(
  (select status::text from public.job_queue where id = '00000000-0000-4000-8000-000000001861'),
  'awaiting_provider',
  'submission moves the leased queue job to awaiting_provider'
);
select ok(
  (select lease_owner is null and lease_expires_at is null from public.job_queue where id = '00000000-0000-4000-8000-000000001861'),
  'submission releases the worker lease'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001851'),
  'running',
  'submission keeps the canonical run running'
);
select is(
  (select status::text from public.submit_workflow_job_response('00000000-0000-4000-8000-000000001851', 'resp_success0001')),
  'awaiting_provider',
  'replaying the same submit request is idempotent'
);
select ok(
  (select expires_at between submitted_at + interval '9 minutes 59 seconds'
       and submitted_at + interval '10 minutes 1 second'
   from public.job_provider_submissions where response_id = 'resp_success0001'),
  'provider response retrieval deadline is bounded to ten minutes'
);
select throws_ok(
  $$select public.submit_workflow_job_response('00000000-0000-4000-8000-000000001851', 'not-a-response')$$,
  'P0001',
  'invalid_provider_response_id',
  'provider response IDs are validated'
);
select throws_ok(
  $$select public.submit_workflow_job_response('00000000-0000-4000-8000-000000001856', 'resp_nolease0001')$$,
  'P0001',
  'workflow_job_lease_not_found',
  'submission rejects a run without an active workflow lease'
);
select throws_ok(
  $$select public.submit_workflow_job_response('00000000-0000-4000-8000-000000001857', 'resp_multiple0001')$$,
  'P0001',
  'workflow_job_lease_ambiguous',
  'submission rejects ambiguous duplicate workflow leases'
);

select is(
  (select status::text from public.complete_provider_queue_job('00000000-0000-4000-8000-000000001861', 'resp_success0001', 'succeeded', null)),
  'succeeded',
  'verified completion succeeds the queue job'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000001851'),
  'succeeded',
  'verified completion succeeds the canonical run'
);
select is(
  (select status::text from public.complete_provider_queue_job('00000000-0000-4000-8000-000000001861', 'resp_success0001', 'succeeded', null)),
  'succeeded',
  'duplicate completion returns prior state without repeating the transition'
);
select is(
  (select count(*) from public.trace_events where event_type = 'job_succeeded' and redacted_payload->>'response_id' = 'resp_success0001'),
  1::bigint,
  'duplicate completion emits no duplicate success trace'
);

select is(
  (select status::text from public.complete_provider_queue_job('00000000-0000-4000-8000-000000001862', 'resp_terminal0001', 'terminal_failure', 'provider_failed')),
  'dead_letter',
  'terminal provider failure dead-letters the queue job'
);
select public.complete_provider_queue_job('00000000-0000-4000-8000-000000001862', 'resp_terminal0001', 'terminal_failure', 'provider_failed');
select is(
  (select status::text || ':' || error_code from public.workflow_runs where id = '00000000-0000-4000-8000-000000001852'),
  'failed:provider_failed',
  'terminal provider failure fails the canonical run with a safe code'
);
select is(
  (select count(*) from public.trace_events where event_type = 'job_dead_lettered' and redacted_payload->>'response_id' = 'resp_terminal0001'),
  1::bigint,
  'duplicate terminal completion emits one trace'
);

select throws_ok(
  $$select public.complete_provider_queue_job('00000000-0000-4000-8000-000000001861', 'resp_other000001', 'succeeded', null)$$,
  'P0001',
  'provider_submission_not_found',
  'completion requires the exact job and response pair'
);

update public.job_queue
set attempt_count = 2
where id = '00000000-0000-4000-8000-000000001865';
select throws_ok(
  $$select public.complete_provider_queue_job('00000000-0000-4000-8000-000000001865', 'resp_stale00001', 'succeeded', null)$$,
  'P0001',
  'stale_provider_response',
  'completion from an older job attempt cannot complete a newer attempt'
);

update public.job_provider_submissions
set expires_at = clock_timestamp() - interval '1 second'
where response_id = 'resp_direct00001';
select throws_ok(
  $$select public.complete_provider_queue_job('00000000-0000-4000-8000-000000001864', 'resp_direct00001', 'succeeded', null)$$,
  'P0001',
  'provider_response_expired',
  'late webhook completion is rejected atomically'
);
select is(
  (select status::text from public.job_queue where id = '00000000-0000-4000-8000-000000001864'),
  'awaiting_provider',
  'rejected late completion does not partially transition the queue job'
);

update public.job_provider_submissions
set expires_at = clock_timestamp() - interval '2 seconds'
where response_id = 'resp_sweep000001';
select is(
  (select count(*) from public.claim_job_queue('worker-sweep', 1)),
  0::bigint,
  'expired accepted responses are not returned for automatic re-execution'
);
select is(
  (select status::text || ':' || error_code from public.workflow_runs where id = '00000000-0000-4000-8000-000000001853'),
  'failed:provider_response_timeout',
  'claim sweep marks provider timeout for operator attention'
);
select ok(
  (select status::text = 'dead_letter' and attempt_count = 1 from public.job_queue where id = '00000000-0000-4000-8000-000000001863'),
  'provider timeout dead-letters without consuming another attempt'
);
select is(
  (select count(*) from public.claim_job_queue('worker-sweep', 1)),
  0::bigint,
  'claim sweep processes the next overdue provider response without requeueing it'
);
select is(
  (select status::text || ':' || error_code from public.workflow_runs where id = '00000000-0000-4000-8000-000000001854'),
  'failed:provider_response_timeout',
  'expired webhook response is dead-lettered by the timeout sweep'
);

select * from finish();
rollback;
