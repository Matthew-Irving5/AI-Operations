import assert from 'node:assert/strict';
import test from 'node:test';
import { readAi17StagingReports } from './ai17-staging-reader.js';
const run = '00000000-0000-4000-8000-000000000001',
  report = '00000000-0000-4000-8000-000000000002';
const env = { STAGING_PERSONAL_ACCESS_TOKEN: 'sbp_test_only' };
test('AI17 protected read uses fixed staging read-only endpoint and bounded report identities', async () => {
  const rows = await readAi17StagingReports(run, env, async (url, init) => {
    assert.equal(
      url,
      'https://api.supabase.com/v1/projects/jqtssfrfocnibffdkqch/database/query/read-only',
    );
    assert.equal(init?.method, 'POST');
    assert.equal(
      JSON.parse(String(init?.body)).query,
      `select id, run_id from public.reports where run_id = '${run}'::uuid order by id limit 2`,
    );
    return new Response(JSON.stringify([{ id: report, run_id: run }]), { status: 201 });
  });
  assert.deepEqual(rows, [{ id: report, run_id: run }]);
});
test('AI17 preflight permits an empty report result before provider/browser work', async () => {
  assert.deepEqual(
    await readAi17StagingReports(run, env, async () => new Response('[]', { status: 201 })),
    [],
  );
});
test('AI17 rejects injection or missing credential before any request', async () => {
  const noFetch = async () => {
    throw new Error('must_not_fetch');
  };
  await assert.rejects(readAi17StagingReports("';drop table reports;--", env, noFetch));
  await assert.rejects(readAi17StagingReports(run, {}, noFetch), /staging Management credential/);
});
test('AI17 rejects denied or malformed readback without exposing provider content', async () => {
  await assert.rejects(
    readAi17StagingReports(run, env, async () => new Response('secret_body', { status: 403 })),
    /^Error: AI-17 protected report readback failed HTTP 403\.$/,
  );
  await assert.rejects(
    readAi17StagingReports(
      run,
      env,
      async () => new Response(JSON.stringify([{ id: report, run_id: report }]), { status: 201 }),
    ),
    /different run/,
  );
  await assert.rejects(
    readAi17StagingReports(
      run,
      env,
      async () =>
        new Response(JSON.stringify([{ id: report, run_id: run, content: 'must_not_select' }]), {
          status: 201,
        }),
    ),
  );
});
