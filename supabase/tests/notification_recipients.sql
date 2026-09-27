begin;
select plan(4);

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
on conflict (id) do update set is_allowed = true;

select lives_ok($$
  insert into public.notifications(
    user_id, type, recipient, subject, status, dedupe_key
  ) values (
    '00000000-0000-0000-0000-000000000101', 'test',
    'matthewirving99@gmail.com', '[AI Operations] synthetic Gmail test',
    'sending', 'synthetic-gmail-test-owner-recipient'
  )
$$, 'a bounded Gmail test may target only the locked owner inbox');

select lives_ok($$
  insert into public.notifications(
    user_id, type, recipient, subject, status, dedupe_key
  ) values (
    '00000000-0000-0000-0000-000000000101', 'report',
    'matthew.irving.ai@gmail.com', '[AI Operations] synthetic report',
    'queued', 'synthetic-report-production-mailbox'
  )
$$, 'configured notifications may target the locked communication mailbox');

select throws_ok($$
  insert into public.notifications(
    user_id, type, recipient, subject, status, dedupe_key
  ) values (
    '00000000-0000-0000-0000-000000000101', 'report',
    'matthewirving99@gmail.com', '[AI Operations] synthetic report',
    'queued', 'synthetic-report-owner-recipient'
  )
$$, 'new row for relation "notifications" violates check constraint "notifications_recipient_check"',
  'non-test notifications cannot target the owner inbox');

select throws_ok($$
  insert into public.notifications(
    user_id, type, recipient, subject, status, dedupe_key
  ) values (
    '00000000-0000-0000-0000-000000000101', 'test',
    'other@example.com', '[AI Operations] synthetic test',
    'sending', 'synthetic-gmail-test-arbitrary-recipient'
  )
$$, 'new row for relation "notifications" violates check constraint "notifications_recipient_check"',
  'Gmail tests cannot target arbitrary recipients');

select * from finish();
rollback;
