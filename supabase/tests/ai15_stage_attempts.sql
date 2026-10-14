begin;
select plan(10);

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
      target_user_id := '00000000-0000-0000-0000-000000000315';
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', target_user_id, 'authenticated', 'authenticated', target_email, crypt('synthetic-only', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now());
    end if;
    insert into public.app_users (id, email, is_allowed) values (target_user_id, target_email, true)
    on conflict (id) do update set is_allowed = true;
  end if;
  insert into ai15_fixture_owner values (target_user_id, target_email);
end;
$fixture$;
insert into public.workflow_runs(id, user_id, workflow_definition_id, status, trigger, idempotency_key)
select '00000000-0000-4000-8000-000000000315', (select user_id from ai15_fixture_owner), id, 'queued', 'on_demand', 'ai15-stage-attempts'
from public.workflow_definitions where code = 'systems-weekly-quality-platform'
on conflict (id) do nothing;
insert into public.job_queue(user_id, run_id, job_type, payload, deduplication_key)
values ((select user_id from ai15_fixture_owner), '00000000-0000-4000-8000-000000000315', 'workflow_execute', '{}'::jsonb, 'ai15-stage-attempts')
on conflict (deduplication_key) do nothing;

select lives_ok($$select public.record_workflow_stage('00000000-0000-4000-8000-000000000315', 'ai_execution', 1, 'running', 'input:synthetic', null, null)$$, 'first stage attempt starts');
select lives_ok($$select public.record_workflow_stage('00000000-0000-4000-8000-000000000315', 'ai_execution', 1, 'succeeded', 'input:synthetic', 'output:synthetic', null)$$, 'first stage attempt completes');
select is((select count(*)::integer from public.run_step_attempts where run_id = '00000000-0000-4000-8000-000000000315' and step_code = 'ai_execution'), 1, 'stage timing is persisted for first queue attempt');
select is((select status::text from public.run_step_attempts where run_id = '00000000-0000-4000-8000-000000000315' and step_code = 'ai_execution' and attempt_number = 1), 'succeeded', 'first attempt status is recorded');
select ok((select duration_ms is not null and completed_at is not null from public.run_step_attempts where run_id = '00000000-0000-4000-8000-000000000315' and step_code = 'ai_execution' and attempt_number = 1), 'first attempt records completion timing');

update public.job_queue set attempt_count = 2 where deduplication_key = 'ai15-stage-attempts';
select lives_ok($$select public.record_workflow_stage('00000000-0000-4000-8000-000000000315', 'ai_execution', 1, 'running', 'input:synthetic', null, null)$$, 'retry starts a distinct stage attempt');
select lives_ok($$select public.record_workflow_stage('00000000-0000-4000-8000-000000000315', 'ai_execution', 1, 'failed', 'input:synthetic', null, 'provider_failed')$$, 'retry failure completes its attempt');
select is((select count(*)::integer from public.run_step_attempts where run_id = '00000000-0000-4000-8000-000000000315' and step_code = 'ai_execution'), 2, 'retry history preserves both attempts');
select is((select attempt_count from public.run_steps where run_id = '00000000-0000-4000-8000-000000000315' and step_code = 'ai_execution'), 2, 'stage summary carries total queue attempt number');
select is((select status::text from public.run_step_attempts where run_id = '00000000-0000-4000-8000-000000000315' and step_code = 'ai_execution' and attempt_number = 2), 'failed', 'retry failure is recorded independently');

select * from finish();
rollback;
