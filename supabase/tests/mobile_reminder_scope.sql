begin;
select plan(13);

insert into public.apple_bridge_devices(
  id, user_id, label, token_hash, token_prefix, enabled_lists
) values (
  '00000000-0000-4000-8000-000000000398',
  '00000000-0000-0000-0000-000000000101',
  'Reminder scope fixture', repeat('9', 64), 'fixture', array['Fitness Plan']
);

select is(public.ingest_mobile_snapshot(
  repeat('9', 64), 1,
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  'ios-shortcut', '1.0.0', now(), repeat('a', 64),
  '[{"source":"reminders","requested":true,"captured":true,"captured_at":null,"record_count":1,"error":null}]'::jsonb,
  '[{"record_id":"98000000-0000-4000-8000-000000000003","source":"reminders","kind":"reminder","canonical_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","payload":{"contract_version":2,"list":"Household & Personal"},"raw_record":{"source":"reminders","kind":"reminder","payload":{"contract_version":2,"list":"Household & Personal"}},"ingest_status":"accepted","reject_reason":null}]'::jsonb
)->>'code', 'reminder_list_not_enabled',
  'The SQL boundary rejects a supported but device-disabled Reminder list');
select is((select count(*) from public.mobile_snapshots
  where snapshot_id='98000000-0000-4000-8000-000000000001'), 0::bigint,
  'A disabled-list snapshot is not retained');
select is((select count(*) from public.mobile_ingestion_records
  where record_id='98000000-0000-4000-8000-000000000003'), 0::bigint,
  'A disabled-list raw record payload is not retained');

select is(public.ingest_mobile_snapshot(
  repeat('9', 64), 1,
  '98000000-0000-4000-8000-000000000011',
  '98000000-0000-4000-8000-000000000012',
  'ios-shortcut', '1.0.0', now(), repeat('c', 64),
  '[{"source":"reminders","requested":true,"captured":true,"captured_at":null,"record_count":1,"error":null}]'::jsonb,
  '[{"record_id":"98000000-0000-4000-8000-000000000013","source":"reminders","kind":"reminder","canonical_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","payload":{"contract_version":1,"list":"Fitness Plan"},"raw_record":{"source":"reminders","kind":"reminder","payload":{"contract_version":1,"list":"Fitness Plan"}},"ingest_status":"accepted","reject_reason":null}]'::jsonb
)->>'code', 'reminder_v2_required',
  'The SQL boundary rejects legacy Reminder payloads missing v2 scope contract');
select is((select count(*) from public.mobile_snapshots
  where snapshot_id='98000000-0000-4000-8000-000000000011'), 0::bigint,
  'A legacy Reminder snapshot is not retained');

select is(public.ingest_mobile_snapshot(
  repeat('9', 64), 1,
  '98000000-0000-4000-8000-000000000021',
  '98000000-0000-4000-8000-000000000022',
  'ios-shortcut', '1.0.0', now(), repeat('e', 64),
  '[{"source":"reminders","requested":true,"captured":true,"captured_at":null,"record_count":1,"error":null}]'::jsonb,
  '[{"record_id":"98000000-0000-4000-8000-000000000023","source":"reminders","kind":"reminder","canonical_hash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","payload":{"contract_version":2,"list":"Fitness Plan","title":"Synthetic allowed reminder","notes":"","priority":"None","is_completed":false,"is_flagged":false,"due_at":"","completion_at":"","url":"","has_subtasks":false},"raw_record":{"source":"reminders","kind":"reminder","payload":{"contract_version":2,"list":"Fitness Plan"}},"ingest_status":"accepted","reject_reason":null}]'::jsonb
)->>'status', 'accepted',
  'A v2 Reminder from a list enabled on the device is accepted');
select is(public.adapt_mobile_snapshot(repeat('9', 64),
  '98000000-0000-4000-8000-000000000021')->>'adapted', '1',
  'A scoped v2 Reminder is adapted once');
select is((select list_name from public.mobile_reminder_items
  where raw_record_id=(select id from public.mobile_ingestion_records
    where record_id='98000000-0000-4000-8000-000000000023')),
  'Fitness Plan', 'Typed Reminder state retains its authorized source list');
select is((select adapter_version from public.mobile_record_adaptations
  where record_internal_id=(select id from public.mobile_ingestion_records
    where record_id='98000000-0000-4000-8000-000000000023')
    and adapter_name='reminders'), 'v2',
  'Adapter provenance records the Reminder v2 contract');

select is(public.ingest_mobile_snapshot(
  repeat('9', 64), 1,
  '98000000-0000-4000-8000-000000000031',
  '98000000-0000-4000-8000-000000000032',
  'ios-shortcut', '1.0.0', now(), repeat('2', 64),
  '[{"source":"reminders","requested":true,"captured":true,"captured_at":null,"record_count":1,"error":null}]'::jsonb,
  '[{"record_id":"98000000-0000-4000-8000-000000000033","source":"reminders","kind":"reminder","canonical_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","payload":{"contract_version":2,"list":"Fitness Plan"},"raw_record":{"source":" reminders ","kind":" reminder ","payload":{"contract_version":2,"list":"Fitness Plan"}},"ingest_status":"accepted","reject_reason":null}]'::jsonb
)->>'status', 'accepted',
  'The SQL guard honors the Edge compatibility normalizer while checking raw source and kind identity');

select is((
  select count(*) from generate_series(1, 16) as request(n)
  cross join lateral (
    select public.ingest_mobile_snapshot(
      repeat('9', 64), 1,
      ('98000000-0000-4000-8000-' || lpad((100 + request.n)::text, 12, '0'))::uuid,
      ('98000000-0000-4000-8000-' || lpad((200 + request.n)::text, 12, '0'))::uuid,
      'ios-shortcut', '1.0.0', now(), repeat('f', 64),
      '[{"source":"reminders","requested":true,"captured":true,"captured_at":null,"record_count":1,"error":null}]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'record_id', ('98000000-0000-4000-8000-' || lpad((300 + request.n)::text, 12, '0')),
        'source', 'reminders', 'kind', 'reminder',
        'canonical_hash', repeat('b', 64),
        'payload', jsonb_build_object('contract_version', 2, 'list', 'Fitness Plan'),
        'raw_record', jsonb_build_object('source', 'reminders', 'kind', 'reminder',
          'payload', jsonb_build_object('contract_version', 2, 'list', 'Fitness Plan')),
        'ingest_status', 'accepted', 'reject_reason', null
      ))
    ) as result
  ) as rpc
  where rpc.result->>'status' = 'accepted'
), 16::bigint, 'The device may submit at most 20 snapshots in one minute');
select is(public.ingest_mobile_snapshot(
  repeat('9', 64), 1,
  '98000000-0000-4000-8000-000000000901',
  '98000000-0000-4000-8000-000000000902',
  'ios-shortcut', '1.0.0', now(), repeat('1', 64),
  '[{"source":"reminders","requested":true,"captured":true,"captured_at":null,"record_count":1,"error":null}]'::jsonb,
  '[{"record_id":"98000000-0000-4000-8000-000000000903","source":"reminders","kind":"reminder","canonical_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","payload":{"contract_version":2,"list":"Fitness Plan"},"raw_record":{"source":"reminders","kind":"reminder","payload":{"contract_version":2,"list":"Fitness Plan"}},"ingest_status":"accepted","reject_reason":null}]'::jsonb
)->>'code', 'rate_limit_exceeded',
  'The database enforces the per-user mobile snapshot rate limit');
select is((select count(*) from public.mobile_snapshots
  where snapshot_id='98000000-0000-4000-8000-000000000901'), 0::bigint,
  'A rate-limited snapshot is not retained');

select * from finish();
rollback;
