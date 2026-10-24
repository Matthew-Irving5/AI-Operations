import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readWorkerStagingSnapshot,
  validateWorkerAcceptanceInputs,
} from './ai41-worker-staging.js';
const run = '41000000-0000-4000-8000-000000000030';
test('AI41 fixed staging snapshot uses read-only SQL and rejects invalid identities before requests', async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(
      url,
      'https://api.supabase.com/v1/projects/jqtssfrfocnibffdkqch/database/query/read-only',
    );
    const query = JSON.parse(String(init?.body)).query as string;
    assert.match(query, /^select /);
    assert.ok(query.includes(run));
    assert.doesNotMatch(query, /update|delete|insert|worker_secret|public_key|approved_roots/i);
    return Response.json([
      {
        run_id: run,
        correlation_id: run,
        scan_id: run,
        status: 'complete',
        result_verified: true,
        inventory_count: 1,
        workflow_status: 'succeeded',
        completed_at: '2026-10-24T20:00:00Z',
        result_verified_at: '2026-10-24T20:00:00Z',
        result_audit_count: 1,
      },
    ]);
  };
  assert.equal(
    (await readWorkerStagingSnapshot(run, 'sbp_synthetic', request))[0]?.inventory_count,
    1,
  );
  await assert.rejects(readWorkerStagingSnapshot("bad'uuid", 'sbp_synthetic', request));
  await assert.rejects(readWorkerStagingSnapshot(run, 'not-a-pat', request));
  assert.equal(calls, 1);
});
test('AI41 snapshot fails closed on provider denial and malformed or missing accounting fields', async () => {
  await assert.rejects(
    readWorkerStagingSnapshot(run, 'sbp_synthetic', async () => Response.json({}, { status: 403 })),
    /worker_snapshot_http_403/,
  );
  await assert.rejects(
    readWorkerStagingSnapshot(run, 'sbp_synthetic', async () => Response.json([{ run_id: run }])),
  );
});
test('AI41 runner requires exact immutable artifact and deployment inputs', () => {
  const input = {
    candidateSha: 'a'.repeat(40),
    candidateTreeSha: 'b'.repeat(40),
    pullRequestNumber: 173,
    deploymentRunId: '123',
    artifactPath: 'synthetic.exe',
    artifactSha256: 'c'.repeat(64),
    outputPath: 'synthetic.json',
  };
  assert.equal(validateWorkerAcceptanceInputs(input).pullRequestNumber, 173);
  for (const patch of [
    { candidateSha: 'main' },
    { pullRequestNumber: 175 },
    { artifactSha256: 'unknown' },
    { deploymentRunId: '0' },
    { unexpected: 'value' },
  ])
    assert.throws(() => validateWorkerAcceptanceInputs({ ...input, ...patch }));
});
