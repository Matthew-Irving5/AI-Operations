begin;
select plan(4);

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
      target_user_id := '00000000-0000-0000-0000-000000000101';
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', target_user_id,
        'authenticated', 'authenticated', target_email,
        crypt('synthetic-only', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
      );
    end if;
    insert into public.app_users(id, email, is_allowed)
    values (target_user_id, target_email, true)
    on conflict (id) do update set is_allowed = true;
  end if;
  insert into ai15_fixture_owner values (target_user_id, target_email);
end;
$fixture$;

select lives_ok($$
  insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key)
  select user_id, 'test', upper(email), 'Synthetic test notification', 'sending', 'ai15-recipient-owner-test'
  from ai15_fixture_owner
$$, 'a bounded test notification may use the linked account recipient');

select lives_ok($$
  insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key)
  select user_id, 'report', email, 'Synthetic report', 'pending', 'ai15-recipient-owner-report'
  from ai15_fixture_owner
$$, 'configured notifications may use the canonical linked account email');

select throws_ok($$
  insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key)
  select user_id, 'report', 'other@example.test', 'Synthetic report', 'pending', 'ai15-recipient-mismatch'
  from ai15_fixture_owner
$$, 'P0001', 'notification_recipient_user_mismatch', 'notifications reject a recipient that differs from the linked account');

select throws_ok($$
  insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key)
  select user_id, 'test', 'other@example.test', 'Synthetic test', 'sending', 'ai15-test-recipient-mismatch'
  from ai15_fixture_owner
$$, 'P0001', 'notification_recipient_user_mismatch', 'bounded test notifications also reject arbitrary recipients');

select * from finish();
rollback;
