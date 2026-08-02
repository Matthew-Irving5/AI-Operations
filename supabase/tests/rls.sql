begin;
select plan(8);

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
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'second-user@example.test', crypt('synthetic-only', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.app_users(id, email, is_allowed)
values ('00000000-0000-0000-0000-000000000101', 'matthewirving99@gmail.com', true);

insert into public.workflow_runs(user_id, workflow_definition_id, trigger, idempotency_key)
select '00000000-0000-0000-0000-000000000101', id, 'test', 'synthetic-primary-run'
from public.workflow_definitions limit 1;

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

select * from finish();
rollback;
