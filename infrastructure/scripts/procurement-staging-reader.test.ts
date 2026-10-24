import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildProcurementStagingSql,
  readProcurementStagingRows,
} from './procurement-staging-reader.js';
const columns =
  'id,user_id,manager_code,hard_cap_minor,reserved_minor,search_limit,searches_used,status,request,decision_record,workflow_run_id,revises_research_run_id,report_id,created_at,completed_at';
const fixture = () =>
  new URLSearchParams({
    select: columns,
    user_id: 'eq.00000000-0000-4000-8000-000000000001',
    manager_code: 'eq.procurement',
    id: 'eq.00000000-0000-4000-8000-000000000002',
    limit: '2',
  });
test('protected research proof uses fixed read-only endpoint and accepts201', async () => {
  const rows = await readProcurementStagingRows(
    fixture(),
    {
      STAGING_PROJECT_REF: 'jqtssfrfocnibffdkqch',
      STAGING_PROJECT_URL: 'https://jqtssfrfocnibffdkqch.supabase.co',
      STAGING_PERSONAL_ACCESS_TOKEN: 'synthetic',
    },
    async (url, options) => {
      assert.match(String(url), /jqtssfrfocnibffdkqch\/database\/query\/read-only$/);
      assert.match(String(options?.body), /public.on_demand_research_runs/);
      return new Response('[]', { status: 201 });
    },
  );
  assert.deepEqual(rows, []);
});
test('rejects unscoped, arbitrary columns, injections and unbounded reads', () => {
  for (const [key, value] of [
    ['user_id', 'eq.bad'],
    ['select', '*'],
    ['limit', '500'],
    ['id', "eq.';delete"],
    ['order', 'id;drop'],
  ]) {
    const query = fixture();
    query.set(key!, value!);
    assert.throws(() => buildProcurementStagingSql(query));
  }
});
test('discovery requires synthetic namespace and timestamp', () => {
  const query = fixture();
  query.delete('id');
  query.set('request->>item', 'eq.personal');
  assert.throws(() => buildProcurementStagingSql(query));
  query.set('request->>item', 'eq.AI-39 acceptance charger synthetic');
  query.set('created_at', 'gte.2026-10-24T00:00:00Z');
  assert.match(buildProcurementStagingSql(query), /created_at >=/);
});
test('rejects production target before network', async () => {
  await assert.rejects(
    readProcurementStagingRows(fixture(), { STAGING_PROJECT_REF: 'production' }, async () => {
      throw new Error('network reached');
    }),
    /fixed staging/,
  );
});
