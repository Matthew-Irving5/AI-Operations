begin;
select plan(16);

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
      target_user_id := '00000000-0000-0000-0000-000000000316';
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
select '00000000-0000-4000-8000-000000000316', (select user_id from ai15_fixture_owner), id, 'running', 'on_demand', 'ai15-report-commit-regression'
from public.workflow_definitions where code = 'systems-weekly-quality-platform'
on conflict (id) do nothing;
insert into public.job_queue(user_id, run_id, job_type, payload, attempt_count, status, deduplication_key)
values ((select user_id from ai15_fixture_owner), '00000000-0000-4000-8000-000000000316', 'workflow_execute', '{}'::jsonb, 1, 'awaiting_provider', 'ai15-report-commit-job')
on conflict (deduplication_key) do nothing;
insert into public.on_demand_budgets (user_id, run_id, manager_code, hard_cap, model_ceiling, search_ceiling, expires_at)
values ((select user_id from ai15_fixture_owner), '00000000-0000-4000-8000-000000000316', 'systems', 1.00, 'gpt-5.6-luna', 0, now() + interval '1 hour');

select public.reserve_instrumented_ai_call(
  (select user_id from ai15_fixture_owner),
  '00000000-0000-4000-8000-000000000316',
  (select id from public.ai_model_catalog where model_id = 'gpt-5.6-luna'),
  (select v.id from public.prompt_versions v join public.prompt_templates t on t.id = v.template_id where t.code = 'controlled-agent-report' and v.version = 1),
  0.10,
  'ai15:run:attempt:1',
  '{"allowed_action_types":["review_prompt_promotion"]}'::jsonb
);
select public.mark_instrumented_ai_call_submitted(
  (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000316'),
  'resp_ai15regression123'
);
insert into public.job_provider_submissions(response_id, job_id, attempt_count, status, submitted_at, expires_at)
select 'resp_ai15regression123', id, 1, 'awaiting_provider', now(), now() + interval '10 minutes'
from public.job_queue where deduplication_key = 'ai15-report-commit-job'
on conflict (response_id) do nothing;

select throws_ok(
  $$select public.commit_instrumented_ai_report_with_queue(
    (select id from public.job_queue where deduplication_key = 'ai15-report-commit-job'),
    'resp_ai15regression123',
    (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000316'),
    'systems-weekly-quality-platform', 'report', 'Test report', 'Summary', '## Test report', '{}'::jsonb,
    '[{"code":"bad code","title":"Section","display_order":0,"content":"Content","structured_data":{},"evidence_references":[]}]'::jsonb, '[]'::jsonb,
    0.01, 10, 20, 0, 0, '{"input_tokens":10,"output_tokens":20}'::jsonb, '{}'::jsonb
  )$$,
  'P0001',
  'ai_report_sections_invalid',
  'a failed report write rolls back usage settlement and leaves the call recoverable'
);
select is((select status from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000316'), 'submitted', 'failed atomic commit leaves one AI call submitted');
select is((select count(*)::integer from public.reports where run_id = '00000000-0000-4000-8000-000000000316'), 0, 'failed atomic commit stores no partial report');
select is((select status::text from public.job_queue where deduplication_key = 'ai15-report-commit-job'), 'awaiting_provider', 'failed report commit leaves provider job recoverable');

select lives_ok(
  $$select public.commit_instrumented_ai_report_with_queue(
    (select id from public.job_queue where deduplication_key = 'ai15-report-commit-job'),
    'resp_ai15regression123',
    (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000316'),
    'systems-weekly-quality-platform', 'report', 'Test report', 'Summary', '## Test report', '{}'::jsonb,
    '[{"code":"quality-review","title":"Quality review","display_order":0,"content":"Content","structured_data":{},"evidence_references":[]}]'::jsonb,
    '[{"action_type":"review_prompt_promotion","title":"Review flagged quality issue","risk_class":"low"}]'::jsonb,
    0.01, 10, 20, 0, 0, '{"input_tokens":10,"output_tokens":20}'::jsonb, '{}'::jsonb
  )$$,
  'a retry settles and stores the report atomically'
);
select is(
  public.commit_instrumented_ai_report_with_queue(
    (select id from public.job_queue where deduplication_key = 'ai15-report-commit-job'),
    'resp_ai15regression123',
    (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000316'),
    'systems-weekly-quality-platform', 'report', 'Test report', 'Summary', '## Test report', '{}'::jsonb,
    '[{"code":"quality-review","title":"Quality review","display_order":0,"content":"Content","structured_data":{},"evidence_references":[]}]'::jsonb,
    '[{"action_type":"review_prompt_promotion","title":"Review flagged quality issue","risk_class":"low"}]'::jsonb,
    0.01, 10, 20, 0, 0, '{"input_tokens":10,"output_tokens":20}'::jsonb, '{}'::jsonb
  ),
  (select id from public.reports where run_id = '00000000-0000-4000-8000-000000000316'),
  'replaying a successful commit returns the existing report without repeating settlement'
);
select is((select status from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000316'), 'succeeded', 'the recovered call settles once');
select is((select count(*)::integer from public.reports where run_id = '00000000-0000-4000-8000-000000000316'), 1, 'the recovered call stores one report');
select is((select count(*)::integer from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000316'), 1, 'retrying report commit creates no duplicate AI call');
select is((select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000000316'), 'succeeded', 'queue completion owns and advances the top-level run state');
select is((select status::text from public.job_queue where deduplication_key = 'ai15-report-commit-job'), 'succeeded', 'report and queue completion commit atomically');
select is((select count(*)::integer from public.notifications where dedupe_key = 'workflow-report:00000000-0000-4000-8000-000000000316'), 1, 'report policy creates one account-linked notification');
select is((select recipient from public.notifications where dedupe_key = 'workflow-report:00000000-0000-4000-8000-000000000316'), (select email from ai15_fixture_owner), 'notification recipient comes from the linked user account');
select is((select count(*)::integer from public.actions where run_id = '00000000-0000-4000-8000-000000000316'), 1, 'validated actions persist as proposals once and remain approval-gated');

insert into public.workflow_runs (id, user_id, workflow_definition_id, status, trigger, idempotency_key)
select '00000000-0000-4000-8000-000000000317', (select user_id from ai15_fixture_owner), id, 'running', 'on_demand', 'ai15-silent-report-regression'
from public.workflow_definitions where code = 'systems-weekly-quality-platform'
on conflict (id) do nothing;
insert into public.job_queue(user_id, run_id, job_type, payload, attempt_count, status, deduplication_key)
values ((select user_id from ai15_fixture_owner), '00000000-0000-4000-8000-000000000317', 'workflow_execute', '{}'::jsonb, 1, 'awaiting_provider', 'ai15-silent-report-job')
on conflict (deduplication_key) do nothing;
insert into public.on_demand_budgets(user_id, run_id, manager_code, hard_cap, model_ceiling, search_ceiling, expires_at)
values ((select user_id from ai15_fixture_owner), '00000000-0000-4000-8000-000000000317', 'systems', 1.00, 'gpt-5.6-luna', 0, now() + interval '1 hour');
select public.reserve_instrumented_ai_call(
  (select user_id from ai15_fixture_owner), '00000000-0000-4000-8000-000000000317',
  (select id from public.ai_model_catalog where model_id = 'gpt-5.6-luna'),
  (select v.id from public.prompt_versions v join public.prompt_templates t on t.id = v.template_id where t.code = 'controlled-agent-report' and v.version = 1),
  0.10, 'ai15:silent:attempt:1', '{}'::jsonb
);
select public.mark_instrumented_ai_call_submitted(
  (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000317'), 'resp_ai15silent123'
);
insert into public.job_provider_submissions(response_id, job_id, attempt_count, status, submitted_at, expires_at)
select 'resp_ai15silent123', id, 1, 'awaiting_provider', now(), now() + interval '10 minutes'
from public.job_queue where deduplication_key = 'ai15-silent-report-job'
on conflict (response_id) do nothing;
select lives_ok($$select public.commit_instrumented_ai_report_with_queue(
  (select id from public.job_queue where deduplication_key = 'ai15-silent-report-job'),
  'resp_ai15silent123', (select id from public.ai_calls where run_id = '00000000-0000-4000-8000-000000000317'),
  'systems-weekly-quality-platform', 'silent', 'Silent report', 'Summary', '## Silent report', '{}'::jsonb,
  '[{"code":"quality-review","title":"Quality review","display_order":0,"content":"Content","structured_data":{},"evidence_references":[]}]'::jsonb,
  '[]'::jsonb, 0.01, 10, 20, 0, 0, '{"input_tokens":10,"output_tokens":20}'::jsonb, '{}'::jsonb
)$$, 'silent notification policy still commits report and queue outcome');
select is((select count(*)::integer from public.notifications where dedupe_key = 'workflow-report:00000000-0000-4000-8000-000000000317'), 0, 'silent policy records no notification row');

select * from finish();
rollback;
