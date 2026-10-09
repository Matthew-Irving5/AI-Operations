begin;
select plan(5);

select has_column('public', 'run_steps', 'input_reference', 'run stages retain protected input references');
select has_column('public', 'run_steps', 'output_reference', 'run stages retain protected output references');
select has_column('public', 'run_steps', 'trace_id', 'run stages retain trace correlation');

create temporary table ai15_fixture_owner (user_id uuid not null, email text not null) on commit drop;
do $fixture$
declare
  target_email text;
  target_user_id uuid;
begin
  select (regexp_match(pg_get_constraintdef(oid), $pattern$'([^']+)'$pattern$))[1]
    into target_email
  from pg_constraint
  where conrelid = 'public.app_users'::regclass and conname = 'app_users_email_check';
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

insert into public.workflow_runs (id, user_id, workflow_definition_id, status, trigger, idempotency_key)
select '00000000-0000-4000-8000-000000000315', (select user_id from ai15_fixture_owner), id, 'queued', 'manual', 'ai15-stage-lifecycle-regression'
from public.workflow_definitions where code = 'systems-daily-cost-capacity'
on conflict (id) do nothing;

select lives_ok(
  $$select public.complete_deterministic_workflow_run('00000000-0000-4000-8000-000000000315')$$,
  'deterministic stage execution returns report evidence without owning run terminal state'
);
select is(
  (select status::text from public.workflow_runs where id = '00000000-0000-4000-8000-000000000315'),
  'queued',
  'only queue completion transitions the top-level run from queued'
);

select * from finish();
rollback;
