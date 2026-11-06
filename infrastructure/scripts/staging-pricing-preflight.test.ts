import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStagingPricingReadiness,
  assertStagingPricingRows,
} from './staging-pricing-preflight.js';

const now = Date.parse('2026-11-06T13:43:00.000Z');
const environment = {
  STAGING_PROJECT_REF: 'jqtssfrfocnibffdkqch',
  STAGING_PROJECT_URL: 'https://jqtssfrfocnibffdkqch.supabase.co',
  STAGING_PERSONAL_ACCESS_TOKEN: 'sbp_test_only',
};
const rows = [
  {
    model_id: 'gpt-5.6-terra',
    supported_tools: ['web_search', 'function'],
    pricing_id: '00000000-0000-4000-8000-000000000001',
    effective_from: '2026-11-06T13:00:00.000Z',
    verified_at: '2026-11-06T13:00:00.000Z',
    input_per_million: '2.000000',
    cached_input_per_million: '0.200000',
    output_per_million: '12.000000',
    web_search_per_call: '0.010000',
    source_url: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
  },
];

test('staging pricing preflight accepts current official model and per-search rates', async () => {
  assertStagingPricingRows(rows, now);
  await assertStagingPricingReadiness(
    environment,
    async (url, init) => {
      assert.equal(
        url,
        'https://api.supabase.com/v1/projects/jqtssfrfocnibffdkqch/database/query/read-only',
      );
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer sbp_test_only');
      const query = JSON.parse(String(init?.body)).query as string;
      assert.match(query, /left join lateral[\s\S]*from public\.model_pricing/);
      assert.match(query, /price\.web_search_per_call::text/);
      assert.match(query, /price\.verified_at/);
      return new Response(JSON.stringify(rows), { status: 201 });
    },
    now,
  );
});

test('staging pricing preflight rejects stale, zero-search, non-OpenAI, and missing prices', () => {
  assert.throws(
    () => assertStagingPricingRows([{ ...rows[0], verified_at: '2026-08-03T00:00:00.000Z' }], now),
    /stale or not yet effective/,
  );
  assert.throws(
    () => assertStagingPricingRows([{ ...rows[0], web_search_per_call: '0.000000' }], now),
    /zero billable rate/,
  );
  assert.throws(
    () => assertStagingPricingRows([{ ...rows[0], source_url: 'https://example.com/price' }], now),
    /not OpenAI/,
  );
  assert.throws(
    () => assertStagingPricingRows([{ ...rows[0], pricing_id: null }], now),
    /missing for enabled model/,
  );
});

test('staging pricing preflight rejects unsafe targets and unreadable data without exposing response text', async () => {
  await assert.rejects(
    assertStagingPricingReadiness({ ...environment, STAGING_PROJECT_REF: 'wrong' }, async () => {
      throw new Error('must_not_fetch');
    }),
    /fixed staging project/,
  );
  await assert.rejects(
    assertStagingPricingReadiness(
      environment,
      async () => new Response('secret_body', { status: 403 }),
      now,
    ),
    /^Error: Staging pricing preflight failed HTTP 403\.$/,
  );
  await assert.rejects(
    assertStagingPricingReadiness(
      environment,
      async () => new Response('[]', { status: 201 }),
      now,
    ),
  );
});
