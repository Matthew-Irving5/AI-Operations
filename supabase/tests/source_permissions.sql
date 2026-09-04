begin;
select plan(28);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated',
  'matthewirving99@gmail.com', crypt('synthetic-only', gen_salt('bf')), now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into public.app_users(id, email, is_allowed)
values ('00000000-0000-0000-0000-000000000101', 'matthewirving99@gmail.com', true)
on conflict (id) do update set is_allowed = true;
insert into public.app_users(id, email, is_allowed)
values ('00000000-0000-0000-0000-000000000102', 'synthetic-secondary@example.invalid', true)
on conflict (id) do update set is_allowed = true;

select ok(exists(
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'data_freshness'
    and column_name = 'stale_reason'
), 'freshness stores a safe stale/error reason');
select ok(exists(
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'data_freshness'
    and column_name = 'last_verification_evidence'
), 'freshness stores redacted verification evidence');
select ok(exists(
  select 1 from pg_proc where proname = 'record_source_freshness'
), 'freshness updates use a database contract');
select ok(exists(
  select 1 from pg_trigger where tgname = 'mobile_snapshot_source_freshness'
), 'mobile source manifests update per-source freshness');
select ok(exists(
  select 1 from pg_trigger where tgname = 'apple_bridge_receipt_freshness'
), 'legacy Apple bridge receipts update freshness');
select ok(exists(
  select 1 from pg_constraint where conname = 'connections_google_scopes_check'
), 'Google connections enforce the approved scope set');
select ok(exists(
  select 1 from pg_constraint where conname = 'apple_bridge_devices_enabled_lists_check'
), 'Apple bridge lists are restricted to the exact approved allowlist');
select ok((select relrowsecurity from pg_class where relname = 'google_sync_requests' and relnamespace = 'public'::regnamespace),
  'manual Google sync requests have RLS');
select ok(not has_table_privilege('authenticated', 'public.google_sync_requests', 'INSERT'),
  'manual Google sync idempotency rows are not directly writable by the browser');
select ok(not has_table_privilege('authenticated', 'public.connection_credentials', 'SELECT'),
  'encrypted Google credentials are never readable by the browser');

select throws_ok($$
  insert into public.connections(user_id, provider, account_label, scopes)
  values ('00000000-0000-0000-0000-000000000101', 'google', 'Synthetic invalid', '{}')
$$, 'new row for relation "connections" violates check constraint "connections_google_scopes_check"',
  'a Google connection cannot omit an approved scope');
select throws_ok($$
  insert into public.connections(user_id, provider, account_label, scopes)
  values ('00000000-0000-0000-0000-000000000101', 'google', 'Synthetic duplicate', array[
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
  ])
$$, 'new row for relation "connections" violates check constraint "connections_google_scopes_check"',
  'a Google connection cannot contain duplicate scopes');

select lives_ok($$
  select public.record_source_freshness(
    '00000000-0000-0000-0000-000000000101', 'google_gmail', now(), now(),
    interval '24 hours', 'fresh', null,
    '{"provider_status":200,"persisted_count":0}'::jsonb
  )
$$, 'freshness contract accepts redacted evidence');
select is((select state from public.data_freshness where user_id = '00000000-0000-0000-0000-000000000101' and source = 'google_gmail'),
  'fresh', 'Google dataset freshness is independently addressable');
select is((select last_verification_evidence->>'provider_status' from public.data_freshness where user_id = '00000000-0000-0000-0000-000000000101' and source = 'google_gmail'),
  '200', 'freshness evidence retains only safe provider status data');

insert into public.apple_bridge_devices(id, user_id, label, token_hash, token_prefix)
values ('40000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000101',
  'Synthetic source permissions bridge', repeat('c', 64), 'synthetic');
insert into public.mobile_snapshots(
  id, device_id, user_id, snapshot_id, request_id, schema_version,
  client_type, client_version, captured_at, request_hash, status,
  received_count, accepted_count, rejected_count, deferred_count, response_payload
) values (
  '41000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  '42000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001', 1, 'ios-shortcut', '1.0.0', now(),
  repeat('d', 64), 'accepted', 0, 0, 0, 0, '{"status":"accepted"}'::jsonb
);
insert into public.mobile_snapshot_sources(
  snapshot_internal_id, user_id, source, client_requested, client_captured,
  client_captured_at, client_record_count, client_error,
  server_received_count, server_accepted_count, server_rejected_count
) values (
  '41000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000101', 'location', true, true, now(), 0,
  null, 0, 0, 0
);
select is((select state from public.data_freshness where user_id = '00000000-0000-0000-0000-000000000101' and source = 'apple_location'),
  'fresh', 'a successfully persisted mobile source records fresh state');
select is((select last_verification_evidence->>'transport' from public.data_freshness where user_id = '00000000-0000-0000-0000-000000000101' and source = 'apple_location'),
  'mobile_snapshot', 'Apple freshness evidence identifies the persisted transport');
insert into public.mobile_snapshot_sources(
  snapshot_internal_id, user_id, source, client_requested, client_captured,
  client_captured_at, client_record_count, client_error,
  server_received_count, server_accepted_count, server_rejected_count
) values (
  '41000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000101', 'screen_time', true, true, now(), 1,
  null, 0, 0, 0
);
select is((select state from public.data_freshness where user_id = '00000000-0000-0000-0000-000000000101' and source = 'apple_screen_time'),
  'error', 'inconsistent mobile counts cannot report fresh state');
select ok(not has_function_privilege('authenticated', 'public.record_source_freshness(uuid,text,timestamptz,timestamptz,interval,text,text,jsonb)', 'EXECUTE'),
  'authenticated sessions cannot write freshness directly');
select ok(exists(
  select 1 from pg_proc where proname = 'revoke_apple_bridge_device'
), 'Apple revoke uses a narrow transactional RPC');
select is(public.revoke_apple_bridge_device(
  '40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001'
), '{"code":"fresh_mfa_required"}'::jsonb,
  'Apple revoke RPC rejects unauthenticated calls');
select ok(exists(
  select 1 from pg_proc where proname = 'update_google_source_selection'
), 'Google source selection uses a narrow transactional RPC');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated","aal":"aal2"}', true);
select is(public.update_google_source_selection(
  '60000000-0000-4000-8000-000000000001', '{}', '{}',
  '50000000-0000-4000-8000-000000000001'
), '{"code":"invalid_mfa_gate"}'::jsonb,
  'source selection rejects an invalid MFA gate');
insert into public.mfa_action_gates(id, user_id, action_key, expires_at, created_at)
values
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000102', 'connection_scope_change', now() + interval '2 minutes', now()),
  ('50000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000101', 'connection_scope_change', now() - interval '1 minute', now() - interval '2 minutes'),
  ('50000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000101', 'connection_scope_change', now() + interval '2 minutes', now()),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000101', 'apple_bridge_create', now() + interval '2 minutes', now()),
  ('50000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000101', 'connection_scope_change', now() + interval '2 minutes', now());
insert into public.connections(id, user_id, provider, account_label, status, sync_enabled, scopes)
values (
  '60000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000101', 'google', 'Synthetic Google',
  'connected', true, array[
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
  ]
);
update public.mfa_action_gates
set consumed_at = now()
where id = '50000000-0000-4000-8000-000000000004';
select is(public.update_google_source_selection(
  '60000000-0000-4000-8000-000000000001', '{}', '{}',
  '50000000-0000-4000-8000-000000000002'
), '{"code":"mfa_gate_wrong_user"}'::jsonb,
  'source selection rejects a gate owned by another user');
select is(public.update_google_source_selection(
  '60000000-0000-4000-8000-000000000001', '{}', '{}',
  '50000000-0000-4000-8000-000000000003'
), '{"code":"mfa_gate_expired"}'::jsonb,
  'source selection rejects an expired gate');
select is(public.update_google_source_selection(
  '60000000-0000-4000-8000-000000000001', '{}', '{}',
  '50000000-0000-4000-8000-000000000004'
), '{"code":"mfa_gate_replayed"}'::jsonb,
  'source selection rejects a replayed gate');
select is(public.update_google_source_selection(
  '60000000-0000-4000-8000-000000000001', '{}', '{}',
  '50000000-0000-4000-8000-000000000005'
), '{"code":"mfa_gate_invalid_action"}'::jsonb,
  'source selection rejects a gate for another action');
select is((public.update_google_source_selection(
  '60000000-0000-4000-8000-000000000001', '{calendar@example.com}', '{drive-file-1}',
  '50000000-0000-4000-8000-000000000006'
)->>'status'), 'updated', 'source selection persists through the MFA RPC');
select is((select configuration->'selected_calendar_ids'->>0 from public.connections
  where id = '60000000-0000-4000-8000-000000000001'), 'calendar@example.com',
  'selected calendar IDs are persisted');
select is((select consumed_at is not null from public.mfa_action_gates
  where id = '50000000-0000-4000-8000-000000000006'), true,
  'source selection consumes its gate exactly once');

select * from finish();
rollback;
