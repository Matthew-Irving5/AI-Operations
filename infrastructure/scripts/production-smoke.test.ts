import assert from 'node:assert/strict';
import test from 'node:test';
import { runProductionSmokeProbes } from './production-smoke.js';

const productionOrigin = 'https://ai-operations-production.ai-operations.workers.dev';
const expectedSha = 'a'.repeat(40);

function fetcherFor(responses: (url: string) => Response | Promise<Response>) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init: init ?? {} });
    return responses(url);
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

test('production smoke verifies the exact release and three non-mutating route contracts', async () => {
  const staleSha = 'b'.repeat(40);
  let releaseAttempts = 0;
  const { fetch, requests } = fetcherFor((url) => {
    if (url.endsWith('/api/release')) {
      releaseAttempts += 1;
      return Response.json({
        schemaVersion: 1,
        releaseSha: releaseAttempts === 1 ? staleSha : expectedSha,
      });
    }
    if (url.endsWith('/login'))
      return new Response('<html><h1>AI Operations</h1></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    if (url.includes('/api/connections/sources?'))
      return Response.json({ code: 'unauthorised' }, { status: 401 });
    if (url.endsWith('/api/auth/sign-in'))
      return new Response(null, {
        status: 307,
        headers: { location: `${productionOrigin}/login` },
      });
    return Response.json({ code: 'unexpected' }, { status: 500 });
  });
  const sleeps: number[] = [];

  const probes = await runProductionSmokeProbes(
    { productionOrigin, expectedSha },
    { fetch, sleep: async (milliseconds) => void sleeps.push(milliseconds), maxReleaseAttempts: 3 },
  );

  assert.deepEqual(probes, [
    { name: 'workerVersion', result: 'passed', observedReleaseSha: expectedSha },
    { name: 'loginShell', result: 'passed' },
    { name: 'authBoundary', result: 'passed' },
    { name: 'safeFunction', result: 'passed' },
  ]);
  assert.equal(releaseAttempts, 2);
  assert.deepEqual(sleeps, [2_000]);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(({ init }) => init.credentials === 'omit'));
  assert.ok(requests.every(({ init }) => init.method === 'GET' || init.method === undefined));
  assert.equal(
    requests.find(({ url }) => url.includes('/api/connections/sources?'))?.init.body,
    undefined,
  );
  assert.equal(
    requests.find(({ url }) => url.endsWith('/api/auth/sign-in'))?.init.redirect,
    'manual',
  );
});

test('stale release retries are bounded and a mismatch remains action-required', async () => {
  const staleSha = 'b'.repeat(40);
  const { fetch } = fetcherFor((url) => {
    if (url.endsWith('/api/release'))
      return Response.json({ schemaVersion: 1, releaseSha: staleSha });
    if (url.endsWith('/login'))
      return new Response('<h1>AI Operations</h1>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    if (url.includes('/api/connections/sources?'))
      return Response.json({ code: 'unauthorised' }, { status: 401 });
    return new Response(null, { status: 307, headers: { location: `${productionOrigin}/login` } });
  });
  const sleeps: number[] = [];
  const probes = await runProductionSmokeProbes(
    { productionOrigin, expectedSha },
    { fetch, sleep: async (milliseconds) => void sleeps.push(milliseconds), maxReleaseAttempts: 2 },
  );

  assert.equal(probes[0]?.result, 'failed');
  assert.equal(probes[0]?.diagnosticCode, 'release_sha_mismatch');
  assert.equal(probes[0]?.observedReleaseSha, staleSha);
  assert.deepEqual(sleeps, [2_000]);
  assert.equal(probes.length, 4);
});

test('production smoke refuses any origin except the fixed production Worker', async () => {
  let requested = false;
  await assert.rejects(
    runProductionSmokeProbes(
      { productionOrigin: 'https://ai-operations-staging.ai-operations.workers.dev', expectedSha },
      {
        fetch: (async () => {
          requested = true;
          return Response.json({});
        }) as typeof globalThis.fetch,
      },
    ),
  );
  assert.equal(requested, false);
});

test('metadata configuration failure is not retried as deployment propagation', async () => {
  let releaseAttempts = 0;
  const { fetch } = fetcherFor((url) => {
    if (url.endsWith('/api/release')) {
      releaseAttempts += 1;
      return Response.json(
        { schemaVersion: 1, code: 'release_metadata_unavailable' },
        { status: 503 },
      );
    }
    if (url.endsWith('/login'))
      return new Response('<h1>AI Operations</h1>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    if (url.includes('/api/connections/sources?'))
      return Response.json({ code: 'unauthorised' }, { status: 401 });
    return new Response(null, { status: 307, headers: { location: `${productionOrigin}/login` } });
  });
  const sleeps: number[] = [];

  const probes = await runProductionSmokeProbes(
    { productionOrigin, expectedSha },
    { fetch, sleep: async (milliseconds) => void sleeps.push(milliseconds), maxReleaseAttempts: 3 },
  );

  assert.equal(releaseAttempts, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(probes[0]?.result, 'failed');
  assert.equal(probes[0]?.diagnosticCode, 'release_metadata_http_error');
});
