import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMobileStagingSql } from './mobile-staging-reader.js';

const userId = '00000000-0000-4000-8000-000000000001';
const rawRecordId = '00000000-0000-4000-8000-000000000002';

test('AI-28 canonical staging reads follow the current explicit grant inventory', async () => {
  const [aclMigration, runner] = await Promise.all([
    readFile(
      new URL(
        '../../supabase/migrations/20261008200132_explicit_service_only_table_access.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../../tests/e2e-live/mobile-shortcuts-acceptance.spec.ts', import.meta.url),
      'utf8',
    ),
  ]);
  const grantBlock = aclMigration.match(/grant select on table([\s\S]*?)to authenticated;/)?.[1];

  assert.ok(grantBlock, 'the current authenticated SELECT projection must be explicit');
  assert.match(
    aclMigration,
    /revoke all privileges on all tables in schema public from authenticated;/,
  );
  assert.match(grantBlock, /public\.apple_bridge_devices/);
  assert.match(grantBlock, /public\.data_freshness/);
  assert.doesNotMatch(grantBlock, /public\.mobile_calendar_event_items/);
  assert.match(runner, /protectedStagingRows<\{[\s\S]{0,180}?\}>\('mobile_calendar_event_items'/);
  assert.doesNotMatch(
    runner,
    /\bownerRows(?:<[\s\S]*?>)?\(\s*page,\s*['"]mobile_calendar_event_items['"]/,
  );
});

test('AI-28 canonical SQL reads require the owner ID and an exact synthetic scope', () => {
  assert.equal(
    buildMobileStagingSql('mobile_calendar_event_items', {
      select: 'id,user_id,raw_record_id',
      user_id: `eq.${userId}`,
      raw_record_id: `eq.${rawRecordId}`,
    }),
    `select id, user_id, raw_record_id from public.mobile_calendar_event_items where user_id = '${userId}' and raw_record_id = '${rawRecordId}' limit 500`,
  );

  const titlePrefix = 'AI28_SYNTH_fixture-123';
  assert.equal(
    buildMobileStagingSql('mobile_calendar_event_items', {
      select: 'id,user_id',
      user_id: `eq.${userId}`,
      title: `like.${titlePrefix}*`,
    }),
    `select id, user_id from public.mobile_calendar_event_items where user_id = '${userId}' and left(title, ${titlePrefix.length}) = '${titlePrefix}' limit 500`,
  );

  assert.throws(
    () =>
      buildMobileStagingSql('mobile_calendar_event_items', {
        select: 'id',
        raw_record_id: `eq.${rawRecordId}`,
      }),
    /required synthetic-row scope/,
  );
  assert.throws(
    () =>
      buildMobileStagingSql('mobile_calendar_event_items', {
        select: 'id',
        user_id: `eq.${userId}`,
        title: 'like.*',
      }),
    /synthetic fixture prefix/,
  );
  assert.throws(
    () =>
      buildMobileStagingSql('mobile_calendar_event_items', {
        select: 'payload',
        user_id: `eq.${userId}`,
        raw_record_id: `eq.${rawRecordId}`,
      }),
    /selected column is not allowlisted/,
  );
});

test('AI-28 protected raw reads require an owner and a device, snapshot, or record scope', () => {
  const deviceId = '00000000-0000-4000-8000-000000000003';
  const snapshotId = '00000000-0000-4000-8000-000000000004';

  assert.match(
    buildMobileStagingSql('mobile_snapshots', {
      select: 'id,user_id',
      user_id: `eq.${userId}`,
      device_id: `eq.${deviceId}`,
      received_count: 'eq.0',
    }),
    new RegExp(`where user_id = '${userId}' and device_id = '${deviceId}'`),
  );
  assert.match(
    buildMobileStagingSql('mobile_snapshot_sources', {
      select: 'id,user_id',
      user_id: `eq.${userId}`,
      snapshot_internal_id: `eq.${snapshotId}`,
    }),
    new RegExp(`where user_id = '${userId}' and snapshot_internal_id = '${snapshotId}'`),
  );
  assert.match(
    buildMobileStagingSql('mobile_record_adaptations', {
      select: 'id,user_id,status',
      user_id: `eq.${userId}`,
      record_internal_id: `eq.${rawRecordId}`,
      adapter_name: 'eq.calendar',
      adapter_version: 'eq.v1',
    }),
    new RegExp(`where user_id = '${userId}' and record_internal_id = '${rawRecordId}'`),
  );

  assert.throws(
    () =>
      buildMobileStagingSql('mobile_snapshots', {
        select: 'id',
        device_id: `eq.${deviceId}`,
      }),
    /required synthetic-row scope/,
  );
  assert.throws(
    () =>
      buildMobileStagingSql('mobile_record_adaptations', {
        select: 'id',
        record_internal_id: `eq.${rawRecordId}`,
        adapter_name: 'eq.calendar',
        adapter_version: 'eq.v1',
      }),
    /required synthetic-row scope/,
  );
});
