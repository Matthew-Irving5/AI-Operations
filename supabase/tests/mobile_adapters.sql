begin;
select plan(49);

insert into public.apple_bridge_devices(id, user_id, label, token_hash, token_prefix)
values ('00000000-0000-4000-8000-000000000301',
  '00000000-0000-0000-0000-000000000101', 'Five-source adapter fixture',
  repeat('3', 64), 'fixture');

select ok(not exists(
  select 1 from pg_class where relnamespace='public'::regnamespace
    and relname in ('mobile_reminder_items','mobile_calendar_event_items',
      'mobile_health_sample_items','mobile_health_sample_normalizations',
      'mobile_location_observation_items','mobile_screen_time_activity_items')
    and not relrowsecurity
), 'Every typed mobile adapter table has RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.mobile_reminder_items', 'INSERT'),
  'Browser sessions cannot insert typed mobile state');

create temp table mobile_side_effect_baseline as
select (select count(*) from public.workflow_runs) workflows,
  (select count(*) from public.actions) actions,
  (select count(*) from public.notifications) notifications;

select is(public.ingest_mobile_snapshot(
  repeat('3', 64), 1,
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  'ios-shortcut', '1.0.0', '2026-08-20T12:00:00+01:00', repeat('4', 64),
  '[
    {"source":"reminders","requested":true,"captured":true,"captured_at":"2026-08-20T12:00:00+01:00","record_count":1,"error":null},
    {"source":"calendar","requested":true,"captured":true,"captured_at":"2026-08-20T12:00:00+01:00","record_count":1,"error":null},
    {"source":"health","requested":true,"captured":true,"captured_at":"2026-08-20T12:00:00+01:00","record_count":1,"error":null},
    {"source":"location","requested":true,"captured":true,"captured_at":"2026-08-20T12:00:00+01:00","record_count":1,"error":null},
    {"source":"screen_time","requested":true,"captured":true,"captured_at":"2026-08-20T12:00:00+01:00","record_count":1,"error":null}
  ]'::jsonb,
  '[
    {"record_id":"31000000-0000-4000-8000-000000000001","source":"reminders","kind":"reminder","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","payload":{"title":"Synthetic reminder","notes":"Fixture","priority":"High","is_completed":false,"is_flagged":true,"due_at":"","completion_at":"","url":"","has_subtasks":false},"raw_record":{"fixture":"reminder"},"ingest_status":"accepted","reject_reason":null},
    {"record_id":"31000000-0000-4000-8000-000000000002","source":"calendar","kind":"calendar_event","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","payload":{"title":"Synthetic event","start_at":"2026-08-20T13:00:00+01:00","end_at":"2026-08-20T14:00:00+01:00","all_day":false,"calendar":"Personal","location":"","notes":"Fixture","url":""},"raw_record":{"fixture":"calendar"},"ingest_status":"accepted","reject_reason":null},
    {"record_id":"31000000-0000-4000-8000-000000000003","source":"health","kind":"health_sample","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","payload":{"type":"Steps","value":"1234","unit":"count","start_at":"2026-08-20T00:00:00+01:00","end_at":"2026-08-20T12:00:00+01:00","duration":"12 hours","source_name":"Synthetic iPhone","name":"Steps"},"raw_record":{"fixture":"health"},"ingest_status":"accepted","reject_reason":null},
    {"record_id":"31000000-0000-4000-8000-000000000004","source":"location","kind":"location_observation","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","payload":{"latitude":54.9783,"longitude":-1.6178,"altitude":42,"name":"Synthetic place","street":"","city":"Newcastle","state":"","postcode":"","region":"England"},"raw_record":{"fixture":"location"},"ingest_status":"accepted","reject_reason":null},
    {"record_id":"31000000-0000-4000-8000-000000000005","source":"screen_time","kind":"app_website_activity","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","payload":{"raw_text":"Synthetic Screen Time item: 12 minutes"},"raw_record":{"fixture":"screen_time"},"ingest_status":"accepted","reject_reason":null}
  ]'::jsonb
)->>'status', 'accepted', 'The raw five-source snapshot is accepted before adaptation');

select is(public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000001')->>'status', 'complete',
  'All five deterministic adapters complete');
select is((select count(*)::text from public.mobile_record_adaptations
  where user_id='00000000-0000-0000-0000-000000000101' and status='adapted'), '5',
  'All five raw records receive adapted provenance');
select is((select count(*) from public.mobile_reminder_items), 1::bigint,
  'reminders:v1 creates one typed reminder');
select ok((select due_at is null and completion_at is null from public.mobile_reminder_items),
  'reminders:v1 normalises empty date strings to null');
select is((select count(*) from public.mobile_calendar_event_items), 1::bigint,
  'calendar:v1 creates one typed event');
select ok((select start_at='2026-08-20T13:00:00+01:00'::timestamptz
  and end_at='2026-08-20T14:00:00+01:00'::timestamptz from public.mobile_calendar_event_items),
  'calendar:v1 parses offset-aware event timestamps');
select is((select count(*) from public.mobile_health_sample_items), 1::bigint,
  'health:v1 creates one typed health sample');
select is((select reported_value from public.mobile_health_sample_items), '"1234"'::jsonb,
  'health:v1 preserves the reported value representation exactly');
select ok((select normalized_value=1234 and normalized_unit='count' and status='normalized'
  from public.mobile_health_sample_normalizations),
  'health:v1 applies only an explicit type-and-unit normalisation');
select is((select count(*) from public.mobile_location_observation_items), 1::bigint,
  'location:v1 creates one typed observation');
select ok((select latitude=54.9783 and longitude=-1.6178 and altitude=42
  from public.mobile_location_observation_items),
  'location:v1 preserves reported coordinates and altitude');
select ok(not exists(select 1 from information_schema.columns
  where table_schema='public' and table_name='mobile_location_observation_items'
    and column_name like '%accuracy%'), 'location:v1 does not invent GPS accuracy');
select is((select count(*) from public.mobile_screen_time_activity_items), 1::bigint,
  'screen_time:v1 creates one lossless text item');
select is((select raw_text from public.mobile_screen_time_activity_items),
  'Synthetic Screen Time item: 12 minutes',
  'screen_time:v1 preserves the Shortcuts text without interpretation');
select is((select count(*) from public.mobile_record_adaptations
  where adapter_version='v1' and adapter_name in ('reminders','calendar','health','location','screen_time')),
  5::bigint, 'Adapter provenance records every required name and version');
select is((select payload->>'title' from public.mobile_ingestion_records
  where record_id='31000000-0000-4000-8000-000000000001'), 'Synthetic reminder',
  'Adaptation does not mutate the immutable raw payload');
select is(public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000001')->>'duplicate', '5',
  'Reprocessing the same adapter versions is idempotent');
select is((select count(*) from public.mobile_reminder_items)
  +(select count(*) from public.mobile_calendar_event_items)
  +(select count(*) from public.mobile_health_sample_items)
  +(select count(*) from public.mobile_location_observation_items)
  +(select count(*) from public.mobile_screen_time_activity_items), 5::bigint,
  'Idempotent reprocessing creates no duplicate typed rows');

select is(public.mobile_typed_deduplication_key(
  'native-1', '2026-08-20T12:00:00+01:00'::timestamptz, repeat('a', 64)),
  public.mobile_typed_deduplication_key(
    'native-1', '2026-08-20T11:00:00Z'::timestamptz, repeat('b', 64)),
  'Native identity plus the same native modification time deduplicates regardless of content hash');
select isnt(public.mobile_typed_deduplication_key(
  'native-1', '2026-08-20T11:00:00Z'::timestamptz, repeat('a', 64)),
  public.mobile_typed_deduplication_key(
    'native-1', '2026-08-21T11:00:00Z'::timestamptz, repeat('a', 64)),
  'A genuinely newer native modification creates a new typed version');
select is(public.mobile_typed_deduplication_key(null, null, repeat('a', 64)),
  'content:' || repeat('a', 64),
  'Records without native identity use canonical content hash as the cross-snapshot fallback');

select is(public.ingest_mobile_snapshot(
  repeat('3', 64), 1,
  '30000000-0000-4000-8000-000000000021',
  '30000000-0000-4000-8000-000000000022',
  'ios-shortcut', '1.0.0', '2026-08-21T12:00:00+01:00', repeat('6', 64),
  '[
    {"source":"reminders","requested":true,"captured":true,"captured_at":"2026-08-21T12:00:00+01:00","record_count":1,"error":null},
    {"source":"calendar","requested":true,"captured":true,"captured_at":"2026-08-21T12:00:00+01:00","record_count":1,"error":null},
    {"source":"health","requested":true,"captured":true,"captured_at":"2026-08-21T12:00:00+01:00","record_count":1,"error":null},
    {"source":"location","requested":true,"captured":true,"captured_at":"2026-08-21T12:00:00+01:00","record_count":1,"error":null},
    {"source":"screen_time","requested":true,"captured":true,"captured_at":"2026-08-21T12:00:00+01:00","record_count":1,"error":null}
  ]'::jsonb,
  '[
    {"record_id":"32000000-0000-4000-8000-000000000001","source":"reminders","kind":"reminder","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","payload":{"title":"Synthetic reminder","notes":"Fixture","priority":"High","is_completed":false,"is_flagged":true,"due_at":"","completion_at":"","url":"","has_subtasks":false},"raw_record":{"fixture":"duplicate reminder"},"ingest_status":"accepted","reject_reason":null},
    {"record_id":"32000000-0000-4000-8000-000000000002","source":"calendar","kind":"calendar_event","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","payload":{"title":"Synthetic event","start_at":"2026-08-20T13:00:00+01:00","end_at":"2026-08-20T14:00:00+01:00","all_day":false,"calendar":"Personal","location":"","notes":"Fixture","url":""},"raw_record":{"fixture":"duplicate calendar"},"ingest_status":"accepted","reject_reason":null},
    {"record_id":"32000000-0000-4000-8000-000000000003","source":"health","kind":"health_sample","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","payload":{"type":"Steps","value":"1234","unit":"count","start_at":"2026-08-20T00:00:00+01:00","end_at":"2026-08-20T12:00:00+01:00","duration":"12 hours","source_name":"Synthetic iPhone","name":"Steps"},"raw_record":{"fixture":"duplicate health"},"ingest_status":"accepted","reject_reason":null},
    {"record_id":"32000000-0000-4000-8000-000000000004","source":"location","kind":"location_observation","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","payload":{"latitude":54.9783,"longitude":-1.6178,"altitude":42,"name":"Synthetic place","street":"","city":"Newcastle","state":"","postcode":"","region":"England"},"raw_record":{"fixture":"duplicate location"},"ingest_status":"accepted","reject_reason":null},
    {"record_id":"32000000-0000-4000-8000-000000000005","source":"screen_time","kind":"app_website_activity","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","payload":{"raw_text":"Synthetic Screen Time item: 12 minutes"},"raw_record":{"fixture":"duplicate screen time"},"ingest_status":"accepted","reject_reason":null}
  ]'::jsonb
)->>'status', 'accepted', 'A later snapshot still preserves equivalent records in immutable raw storage');
select is(public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000021')->>'duplicate', '5',
  'Equivalent records in a later snapshot are deduplicated across all five adapters');
select is((select count(*) from public.mobile_record_adaptations
  where record_internal_id in (select id from public.mobile_ingestion_records
    where snapshot_internal_id=(select id from public.mobile_snapshots
      where snapshot_id='30000000-0000-4000-8000-000000000021')) and status='duplicate'),
  5::bigint, 'Cross-snapshot duplicates retain provenance to canonical typed rows');
select is((select count(*) from public.mobile_reminder_items)
  +(select count(*) from public.mobile_calendar_event_items)
  +(select count(*) from public.mobile_health_sample_items)
  +(select count(*) from public.mobile_location_observation_items)
  +(select count(*) from public.mobile_screen_time_activity_items), 5::bigint,
  'Cross-snapshot deduplication creates no repeated typed state');
select is((select count(*) from public.mobile_ingestion_records
  where snapshot_internal_id in (select id from public.mobile_snapshots
    where snapshot_id in ('30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000021'))), 10::bigint,
  'Cross-snapshot deduplication never deletes raw receipts');

select is(public.ingest_mobile_snapshot(
  repeat('3', 64), 1,
  '30000000-0000-4000-8000-000000000031',
  '30000000-0000-4000-8000-000000000032',
  'ios-shortcut', '1.0.0', now(), repeat('7', 64),
  '[{"source":"location","requested":true,"captured":true,"captured_at":null,"record_count":1,"error":null}]'::jsonb,
  '[{"record_id":"33000000-0000-4000-8000-000000000001","source":"location","kind":"location_observation","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"1111111111111111111111111111111111111111111111111111111111111111","payload":{"latitude":" 54.9783 ","longitude":"-1.6178","altitude":"42.5","name":"Synthetic string coordinates","street":"","city":"Newcastle","state":"","postcode":"","region":"England"},"raw_record":{"fixture":"string coordinates"},"ingest_status":"accepted","reject_reason":null}]'::jsonb
)->>'status', 'accepted', 'String coordinate compatibility remains inside the typed adapter boundary');
select is(public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000031')->>'status', 'complete',
  'Location accepts deterministic decimal strings from iOS Shortcuts');
select ok((select latitude=54.9783 and longitude=-1.6178 and altitude=42.5
  from public.mobile_location_observation_items
  where raw_record_id=(select id from public.mobile_ingestion_records
    where record_id='33000000-0000-4000-8000-000000000001')),
  'Location decimal strings are normalized to numeric typed columns');
select throws_ok($$select public.mobile_shortcut_numeric(
  '{"latitude":"not-a-coordinate"}'::jsonb, 'latitude')$$,
  'P0001', 'invalid_location_v1_payload',
  'Location compatibility rejects arbitrary non-numeric strings');
select throws_ok($$select public.mobile_shortcut_numeric(
  '{"latitude":null}'::jsonb, 'latitude')$$,
  'P0001', 'invalid_location_v1_payload',
  'Location compatibility rejects null rather than coercing it');
select is((select count(*) from public.workflow_runs),
  (select workflows from mobile_side_effect_baseline), 'Adaptation creates no workflow');
select is((select count(*) from public.actions),
  (select actions from mobile_side_effect_baseline), 'Adaptation creates no action');
select is((select count(*) from public.notifications),
  (select notifications from mobile_side_effect_baseline), 'Adaptation creates no notification');

select is(public.ingest_mobile_snapshot(
  repeat('3', 64), 1,
  '30000000-0000-4000-8000-000000000011',
  '30000000-0000-4000-8000-000000000012',
  'ios-shortcut', '1.0.0', now(), repeat('5', 64),
  '[{"source":"reminders","requested":true,"captured":true,"captured_at":null,"record_count":1,"error":null}]'::jsonb,
  '[{"record_id":"31000000-0000-4000-8000-000000000011","source":"reminders","kind":"reminder","external_id":null,"source_created_at":null,"source_modified_at":null,"canonical_hash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","payload":{"title":"Private synthetic title","notes":"Private synthetic notes","priority":"High","is_completed":"No","is_flagged":"Yes","due_at":"","completion_at":"","url":"https://example.invalid/private","has_subtasks":"No"},"raw_record":{"fixture":"malformed"},"ingest_status":"accepted","reject_reason":null}]'::jsonb
)->>'status', 'accepted', 'A generically valid raw record remains accepted before typed validation');
select is(public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000011')->>'status', 'partial',
  'A malformed source payload produces a partial adapter result');
select is(jsonb_array_length((public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000011')->'rejections'->0->'issues')), 3,
  'Reminder rejection reports every mismatched boolean field in one response');
select ok((public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000011')->'rejections'->0->'issues') @>
  '[{"path":"is_completed","expected":"boolean","received_type":"string","received":"No"}]'::jsonb,
  'Reminder rejection includes the safe received boolean representation');
select ok((public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000011')->'rejections'->0->'issues') @>
  '[{"path":"is_flagged","expected":"boolean","received_type":"string","received":"Yes"},{"path":"has_subtasks","expected":"boolean","received_type":"string","received":"No"}]'::jsonb,
  'Reminder rejection identifies all remaining boolean mismatches');
select ok((public.adapt_mobile_snapshot(repeat('3', 64),
  '30000000-0000-4000-8000-000000000011')->'rejections'->0->'issues')::text
  !~ '(Private synthetic title|Private synthetic notes|example[.]invalid)',
  'Reminder diagnostics never expose title, notes, or URL contents');
select ok(public.mobile_adapter_validation_issues(
  'reminders:v1', 'invalid_reminders_v1_payload',
  '{"title":"Synthetic","notes":"","priority":"None","is_completed":false,"is_flagged":false,"due_at":"No Date","completion_at":"","url":"","has_subtasks":false}'::jsonb
) @> '[{"path":"due_at","expected":"empty string or offset-aware ISO-8601 timestamp","received_type":"string"}]'::jsonb,
  'Reminder diagnostics reveal invalid date format without revealing its value');
select ok(public.mobile_adapter_validation_issues(
  'reminders:v1', 'invalid_reminders_v1_payload',
  '{"title":"Synthetic","notes":"","priority":"None","is_completed":false,"is_flagged":false,"due_at":"No Date","completion_at":"","url":"","has_subtasks":false}'::jsonb
)::text !~ 'No Date', 'Reminder diagnostics redact invalid date contents');
select is((select count(*) from public.mobile_record_adaptations
  where record_internal_id=(select id from public.mobile_ingestion_records
    where record_id='31000000-0000-4000-8000-000000000011') and status='rejected'),
  1::bigint, 'Malformed typed payload receives rejected adapter provenance');
select is((select count(*) from public.mobile_ingestion_records
  where record_id='31000000-0000-4000-8000-000000000011'), 1::bigint,
  'A typed adapter rejection retains the immutable raw record');
select is((select count(*) from public.mobile_reminder_items
  where raw_record_id=(select id from public.mobile_ingestion_records
    where record_id='31000000-0000-4000-8000-000000000011')), 0::bigint,
  'A rejected adapter creates no invalid typed reminder');
select ok((pg_get_functiondef('public.adapt_mobile_snapshot(text,uuid)'::regprocedure)
  || pg_get_functiondef('public.adapt_mobile_record_v1(uuid)'::regprocedure))
  !~ '(workflow_runs|notifications|actions|ai_calls|http|net[.])',
  'The snapshot adapter function contains no execution or external-side-effect path');

select * from finish();
rollback;
