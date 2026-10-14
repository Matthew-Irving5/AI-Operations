begin;
select plan(6);

create temporary table ai15_fixture_owner (user_id uuid not null, email text not null) on commit drop;
do $fixture$
declare target_email text; target_user_id uuid;
begin
  select (regexp_match(pg_get_constraintdef(oid), $pattern$'([^']+)'$pattern$))[1] into target_email
  from pg_constraint where conrelid = 'public.app_users'::regclass and conname = 'app_users_email_check';
  select id into target_user_id from public.app_users where lower(email) = lower(target_email);
  if target_user_id is null then
    select id into target_user_id from auth.users where lower(email) = lower(target_email) limit 1;
    if target_user_id is null then
      target_user_id := '00000000-0000-0000-0000-000000000318';
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', target_user_id, 'authenticated', 'authenticated', target_email, crypt('synthetic-only', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now());
    end if;
    insert into public.app_users (id, email, is_allowed) values (target_user_id, target_email, true)
    on conflict (id) do update set is_allowed = true;
  end if;
  insert into ai15_fixture_owner values (target_user_id, target_email);
end;
$fixture$;
insert into public.workflow_runs (id, user_id, workflow_definition_id, status, trigger, idempotency_key)
select '00000000-0000-4000-8000-000000000318', (select user_id from ai15_fixture_owner), id, 'running', 'on_demand', 'ai15-provider-failure-regression'
from public.workflow_definitions where code = 'systems-weekly-quality-platform'
on conflict (id) do nothing;
insert into public.job_queue(user_id, run_id, job_type, payload, attempt_count, status, deduplication_key)
values ((select user_id from ai15_fixture_owner), '00000000-0000-4000-8000-000000000318', 'workflow_execute', '{}'::jsonb, 1, 'awaiting_provider', 'ai15-provider-failure-job')
on conflict (deduplication_key) do nothing;
insert into public.on_demand_budgets (user_id, run_id, manager_code, hard_cap, model_ceiling, search_ceiling, expires_at)
values ((select user_id from ai15_fixture_owner), '00000000-0000-4000-8000-000000000318', 'systems', 1.00, 'gpt-5.6-luna', 0, now() + interval '1 hour');

select public.reserve_instrumented_ai_call(
  (select user_id from ai15_fixture_owner),
  '00000000-0000-4000-8000-000000000318',
  (select id from public.ai_model_catalog where model_id = 'gpt-5.6-luna'),
  (select v.id from public.prompt_versions v join public.prompt_templates t on t.id = v.template_id where t.code = 'controlled-agent-report' and v.version = 1),
  0.10,
  'ai15:failure:attempt:1',
  '{}'::jsonb
);
select public.mark_instrumented_ai_call_submitted(
  (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000318'),
  'resp_ai15failure123'
);
insert into public.job_provider_submissions(response_id, job_id, attempt_count, status, submitted_at, expires_at)
select 'resp_ai15failure123', id, 1, 'awaiting_provider', now(), now() + interval '10 minutes'
from public.job_queue where deduplication_key = 'ai15-provider-failure-job'
on conflict (response_id) do nothing;

select is(public.fail_instrumented_ai_provider_response(
  (select id from public.job_queue where deduplication_key = 'ai15-provider-failure-job'),
  'resp_ai15failure123',
  (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000318'),
  'structured_output_invalid', 0.01, 10, 15, 0, 0,
  '{"input_tokens":10,"output_tokens":15}'::jsonb,
  '{"validation_passed":false}'::jsonb
), true, 'invalid output settlement and terminal queue transition succeed atomically');
select is((select status from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000318'), 'failed', 'invalid output settles the AI call failed');
select is((select status::text from public.job_queue where deduplication_key = 'ai15-provider-failure-job'), 'dead_letter', 'invalid output dead-letters the queue job');
select is((select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000000318'), 'failed', 'queue completion owns the failed run state');
select is((select count(*)::integer from public.reports where run_id = '00000000-0000-4000-8000-000000000318'), 0, 'invalid output produces no report');
select is(public.fail_instrumented_ai_provider_response(
  (select id from public.job_queue where deduplication_key = 'ai15-provider-failure-job'),
  'resp_ai15failure123',
  (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000318'),
  'structured_output_invalid', 0.01, 10, 15, 0, 0,
  '{"input_tokens":10,"output_tokens":15}'::jsonb,
  '{"validation_passed":false}'::jsonb
), true, 'replayed failure completes idempotently');

select * from finish();
rollback;
