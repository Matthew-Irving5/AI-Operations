begin;
select plan(55);

select ok(
  not exists (
    select 1
    from pg_tables t
    left join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
    where t.schemaname = 'public' and c.relrowsecurity is false
  ),
  'every public application table has row level security enabled'
);

select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='workflow_runs' and qual is null), 'workflow runs has no unrestricted select policy');
select ok((select relrowsecurity from pg_class where relname='audit_events' and relnamespace = 'public'::regnamespace), 'audit events has RLS enabled');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'matthewirving99@gmail.com', crypt('synthetic-only', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'second-user@example.test', crypt('synthetic-only', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.app_users(id, email, is_allowed)
values ('00000000-0000-0000-0000-000000000101', 'matthewirving99@gmail.com', true)
on conflict (id) do update set email = excluded.email, is_allowed = true;

delete from public.mfa_reauthentication_events where user_id = '00000000-0000-0000-0000-000000000101';

insert into public.workflow_runs(user_id, workflow_definition_id, trigger, idempotency_key)
select '00000000-0000-0000-0000-000000000101', id, 'test', 'synthetic-primary-run'
from public.workflow_definitions where code = 'systems-daily-cost-capacity';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000202","aal":"aal2"}', true);
select is((select count(*) from public.workflow_runs), 0::bigint, 'a synthetic second user cannot read the primary user workflow run');
select is((select count(*) from public.app_users), 0::bigint, 'a synthetic second user cannot read the primary user identity row');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","aal":"aal1"}', true);
select is((select count(*) from public.managers), 0::bigint, 'AAL1 cannot read application manager configuration');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","aal":"aal2"}', true);
select is((select count(*) from public.managers), 8::bigint, 'the allowlisted primary identity at AAL2 can read manager configuration');

select lives_ok(
  $$select count(*) from public.actions where user_id = '00000000-0000-0000-0000-000000000101'$$,
  'RLS query for a protected table does not expose an error channel'
);

reset role;
select ok(exists(select 1 from pg_proc where proname = 'claim_job_queue'), 'queue claim function exists');
select ok(exists(select 1 from pg_proc where proname = 'dispatch_due_schedules'), 'scheduler dispatch function exists');
select ok(exists(select 1 from cron.job where jobname = 'ai-operations-scheduler-dispatch-5m' and schedule = '*/5 * * * *'), 'scheduler dispatch is registered every five minutes');
select ok(exists(select 1 from pg_constraint where conname = 'cost_reservations_amounts_check'), 'reservation consumption cannot exceed the amount reserved');
select is((select count(*) from public.workflow_definitions where code like 'systems-%' and active), 3::bigint, 'all Systems workflows are seeded and active while schedules remain separate');
insert into public.job_queue(user_id, run_id, job_type, deduplication_key)
select user_id, id, 'workflow_execute', 'synthetic-primary-job' from public.workflow_runs where idempotency_key = 'synthetic-primary-run';
select is((select count(*) from public.claim_job_queue('pg-tap-worker', 1)), 1::bigint, 'a queued workflow job receives one lease');
select lives_ok($$select public.complete_synthetic_systems_run(id) from public.workflow_runs where idempotency_key = 'synthetic-primary-run'$$, 'the synthetic manager creates a report');
select is((select count(*) from public.reports where run_id = (select id from public.workflow_runs where idempotency_key = 'synthetic-primary-run')), 1::bigint, 'a synthetic run has exactly one report');
select is((select status::text from public.complete_job_queue((select id from public.job_queue where deduplication_key = 'synthetic-primary-job'), 'pg-tap-worker', true)), 'succeeded', 'completing a lease succeeds the job');
select lives_ok($$select public.calculate_spend_forecast('00000000-0000-0000-0000-000000000101')$$, 'a deterministic forecast snapshot can be calculated');
insert into public.workflow_runs(user_id, workflow_definition_id, trigger, idempotency_key)
select '00000000-0000-0000-0000-000000000101', id, 'manual', 'synthetic-cancellable-run'
from public.workflow_definitions where code = 'systems-daily-cost-capacity';
select ok(public.cancel_queued_run('00000000-0000-0000-0000-000000000101', (select id from public.workflow_runs where idempotency_key = 'synthetic-cancellable-run')), 'an eligible queued run can be cancelled transactionally');
select ok(exists(select 1 from pg_proc where proname = 'claim_notification_delivery'), 'notification delivery uses a lease claim function');
select lives_ok($$select public.record_provider_usage_reconciliation('00000000-0000-0000-0000-000000000101', now() - interval '1 day', now(), 0, 'synthetic-provider-usage')$$, 'provider usage reconciliation records a deterministic comparison');
select throws_ok($$select public.add_model_pricing('00000000-0000-0000-0000-000000000101', (select id from public.ai_model_catalog limit 1), now(), 1, 1, 1, 'https://example.test/pricing')$$, 'fresh_mfa_required', 'pricing changes require fresh MFA');
insert into public.feedback(user_id, report_id, positive, categories, comment) values ('00000000-0000-0000-0000-000000000101', (select id from public.reports where run_id = (select id from public.workflow_runs where idempotency_key = 'synthetic-primary-run')), false, array['evidence'], 'synthetic quality feedback');
insert into public.workflow_runs(user_id, workflow_definition_id, trigger, idempotency_key) select '00000000-0000-0000-0000-000000000101', id, 'schedule', 'synthetic-weekly-quality-run' from public.workflow_definitions where code = 'systems-weekly-quality-platform';
select lives_ok($$select public.complete_synthetic_systems_run(id) from public.workflow_runs where idempotency_key = 'synthetic-weekly-quality-run'$$, 'weekly Systems quality review creates a report');
select is((select status from public.feedback order by created_at desc limit 1), 'included_in_quality_review', 'weekly quality review marks included feedback');
select ok(exists(select 1 from public.workflow_definitions where code = 'personal-morning-plan' and active), 'Personal morning workflow is active');
select ok(exists(select 1 from pg_proc where proname = 'complete_personal_run'), 'deterministic Personal completion function exists');
insert into public.workflow_runs(user_id, workflow_definition_id, trigger, idempotency_key)
select '00000000-0000-0000-0000-000000000101', id, 'schedule', 'synthetic-personal-midday-run'
from public.workflow_definitions where code = 'personal-midday-exception';
select lives_ok($$select public.complete_personal_run(id) from public.workflow_runs where idempotency_key = 'synthetic-personal-midday-run'$$, 'a midpoint Personal run completes without an integration error');
select is((select count(*) from public.notifications where dedupe_key like 'personal-report:%'), 0::bigint, 'an empty midpoint exception scan queues no email');
select is((select material_change from public.personal_plans where report_id = (select id from public.reports where run_id = (select id from public.workflow_runs where idempotency_key = 'synthetic-personal-midday-run'))), false, 'midpoint no-change plan is recorded as non-material');
select ok(exists(select 1 from public.workflow_definitions where code = 'health-daily-processing' and active), 'Health daily workflow is active');
select ok(exists(select 1 from public.workflow_definitions where code = 'finance-monthly-close' and active), 'Finance monthly workflow is active');
select ok(exists(select 1 from pg_proc where proname = 'complete_health_finance_run'), 'Health and Finance deterministic completion function exists');
insert into public.workflow_runs(user_id, workflow_definition_id, trigger, idempotency_key)
select '00000000-0000-0000-0000-000000000101', id, 'schedule', 'synthetic-health-daily-run' from public.workflow_definitions where code = 'health-daily-processing';
select lives_ok($$select public.complete_health_finance_run(id) from public.workflow_runs where idempotency_key = 'synthetic-health-daily-run'$$, 'Health daily run completes safely with incomplete data');
select ok(exists(select 1 from public.workflow_definitions where code = 'career-daily-evidence-sync' and active), 'Career daily evidence workflow is active');
select ok(exists(select 1 from public.workflow_definitions where code = 'digital-estate-lightweight' and active), 'Digital Estate lightweight workflow is active');
select ok(exists(select 1 from public.workflow_definitions where code = 'digital-estate-deep-scan' and active), 'Digital Estate deep workflow is active');
select ok(exists(select 1 from pg_constraint where conname = 'digital_scans_status_check'), 'Digital scan status is constrained');
select ok(exists(select 1 from pg_constraint where conname = 'worker_devices_state_check'), 'Worker device state is constrained');
select ok((select relrowsecurity from pg_class where relname='worker_heartbeats' and relnamespace = 'public'::regnamespace), 'Worker heartbeat history has RLS enabled');
select ok((select relrowsecurity from pg_class where relname='storage_forecasts' and relnamespace = 'public'::regnamespace), 'Storage forecasts have RLS enabled');
select ok((select relrowsecurity from pg_class where relname='onboarding_checklist_items' and relnamespace = 'public'::regnamespace), 'Onboarding checklist has RLS enabled');
select ok((select relrowsecurity from pg_class where relname='production_acceptances' and relnamespace = 'public'::regnamespace), 'Production acceptance has RLS enabled');
select ok(exists(select 1 from pg_proc where proname = 'production_onboarding_complete'), 'Production onboarding completion guard exists');
select ok(not has_table_privilege('authenticated', 'public.workflow_schedules', 'UPDATE'), 'Direct schedule enablement is not available to browser roles');
select is(public.production_onboarding_complete('00000000-0000-0000-0000-000000000101'), false, 'Schedules remain gated until the preliminary onboarding steps are recorded');
select ok((select relrowsecurity from pg_class where relname='edge_request_windows' and relnamespace = 'public'::regnamespace), 'Edge rate windows have RLS enabled');
select is(public.consume_edge_request_quota('00000000-0000-0000-0000-000000000101', 'test_quota', 1), true, 'First rate-limited request is accepted');
select is(public.consume_edge_request_quota('00000000-0000-0000-0000-000000000101', 'test_quota', 1), false, 'Rate limit rejects a request after its quota is exhausted');
select ok(exists(select 1 from public.workflow_definitions where code = 'travel-on-demand-plan' and active), 'Travel on-demand workflow is active');
select ok(exists(select 1 from public.workflow_definitions where code = 'procurement-on-demand-research' and active), 'Procurement on-demand workflow is active');
select ok(exists(select 1 from pg_proc where proname = 'create_on_demand_run_request'), 'Bounded on-demand request function exists');
select throws_ok($$select public.create_on_demand_run_request('00000000-0000-0000-0000-000000000101', (select id from public.workflow_definitions where code='travel-on-demand-plan'), 'procurement', 1, 'gpt-5.6-terra', 1, 'on-demand-mismatch', '{"purpose":"test"}'::jsonb)$$, 'manager_workflow_mismatch', 'On-demand manager and workflow must match');
select lives_ok($$select public.create_on_demand_run_request('00000000-0000-0000-0000-000000000101', (select id from public.workflow_definitions where code='travel-on-demand-plan'), 'travel', 1, 'gpt-5.6-terra', 1, 'on-demand-travel-request', '{"purpose":"Test trip","constraints":"No booking"}'::jsonb)$$, 'Bounded Travel request is queued with its brief');
select ok(exists(select 1 from pg_proc where proname = 'complete_deterministic_workflow_run'), 'the shared deterministic completion contract exists');
select lives_ok($$select public.complete_deterministic_workflow_run(id) from public.workflow_runs where idempotency_key = 'on-demand-travel-request'$$, 'the shared contract completes an on-demand manager without synthetic manager SQL');
select is((select structured_metrics->>'ai_called' from public.reports where run_id = (select id from public.workflow_runs where idempotency_key = 'on-demand-travel-request')), 'false', 'deterministic completion records that no provider call occurred');
select is((select count(*) from public.audit_events where action_type = 'complete_deterministic_workflow'), 1::bigint, 'deterministic completion records an immutable audit event');
select is((select count(*) from public.trace_events where event_type = 'workflow_completed'), 1::bigint, 'deterministic completion records a redacted validation trace');
insert into public.workflow_runs(user_id, workflow_definition_id, trigger, idempotency_key)
select '00000000-0000-0000-0000-000000000101', id, 'manual', 'synthetic-career-run' from public.workflow_definitions where code = 'career-daily-evidence-sync';
select lives_ok($$select public.complete_career_travel_procurement_run(id) from public.workflow_runs where idempotency_key = 'synthetic-career-run'$$, 'Career completion creates a provenance-constrained report');
select throws_ok($$insert into public.career_github_evidence(user_id, repository_external_id, repository_name, owner_login, evidence_kind, source_url, retrieved_at) values ('00000000-0000-0000-0000-000000000101', 1, 'denied', 'BrightSG', 'repository', 'https://github.com/Matthew-Irving5/denied', now())$$, 'new row for relation "career_github_evidence" violates check constraint "career_github_evidence_owner_login_check"', 'BrightSG can never be stored as Career GitHub evidence');

select * from finish();
rollback;
