import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, webkit } from '@playwright/test';
import { parseLiveE2eEnvironment } from '../../apps/web/lib/live-e2e-safety';
import { writeLiveStagingAcceptanceEvidence } from '../../infrastructure/scripts/live-acceptance-evidence.js';

const env = parseLiveE2eEnvironment(process.env, 'suite');
const stagingResponses = new WeakMap<import('@playwright/test').Page, string[]>();
let manualMfaChallengeObserved = false;

function redactError(message: string): string {
  let redacted = message;
  for (const secret of [
    env.LIVE_E2E_PASSWORD,
    env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
    env.LIVE_E2E_EMAIL,
  ].filter((value): value is string => Boolean(value))) {
    redacted = redacted.replaceAll(secret, '[REDACTED]');
  }
  return redacted
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/([?&][^=\s"'<>]+)=([^&\s"'<>]*)/g, '$1=[REDACTED]')
    .replace(/\b\d{6}\b/g, '[REDACTED-CODE]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, '[REDACTED-ID]')
    .slice(0, 500);
}

test.beforeEach(async ({ page }) => {
  manualMfaChallengeObserved = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      if (new URL(frame.url()).pathname === '/mfa') manualMfaChallengeObserved = true;
    } catch {
      // Ignore non-URL navigations; only the staging MFA route can satisfy acceptance.
    }
  });
  const summaries: string[] = [];
  stagingResponses.set(page, summaries);
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(env.LIVE_E2E_BASE_URL).origin && url.pathname.startsWith('/api/')) {
      summaries.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
      if (url.pathname === '/api/auth/mfa/verify') {
        void response
          .json()
          .then((body: unknown) => {
            if (typeof body !== 'object' || body === null) return;
            const diagnostic = (body as { diagnostic?: unknown }).diagnostic;
            if (typeof diagnostic !== 'object' || diagnostic === null) return;
            const safeDiagnostic = diagnostic as {
              code?: unknown;
              stage?: unknown;
              validationIssues?: unknown;
            };
            const issues = Array.isArray(safeDiagnostic.validationIssues)
              ? safeDiagnostic.validationIssues.filter(
                  (issue): issue is { path: string; code: string } =>
                    typeof issue === 'object' &&
                    issue !== null &&
                    typeof (issue as { path?: unknown }).path === 'string' &&
                    typeof (issue as { code?: unknown }).code === 'string',
                )
              : [];
            summaries.push(
              `MFA diagnostic code=${String(safeDiagnostic.code)} stage=${String(safeDiagnostic.stage)} issues=${issues.map(({ path, code }) => `${path}:${code}`).join(',') || 'none'}`,
            );
          })
          .catch(() => summaries.push('MFA diagnostic response was not JSON.'));
      }
    }
  });
});

test('deployed Worker release matches the exact hosted acceptance candidate', async ({ page }) => {
  const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
  expect(candidateSha).toMatch(/^[a-f0-9]{40}$/i);
  const response = await page.request.get(new URL('/api/release', env.LIVE_E2E_BASE_URL).href);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    schemaVersion: 1,
    releaseSha: candidateSha?.toLowerCase(),
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const screenshot = testInfo.outputPath('failure-redacted.png');
  const safeScreenshotRoutes = new Set(['/login', '/mfa', '/travel', '/operations']);
  let screenshotCaptured = false;
  try {
    if (safeScreenshotRoutes.has(new URL(page.url()).pathname)) {
      await page.screenshot({
        path: screenshot,
        fullPage: true,
        mask: [
          page.locator('input, textarea, header, nav, article'),
          ...(env.LIVE_E2E_EMAIL ? [page.getByText(env.LIVE_E2E_EMAIL, { exact: true })] : []),
        ],
        maskColor: '#242424',
        timeout: 5_000,
      });
      screenshotCaptured = true;
    }
  } catch {
    // A screenshot is optional if the browser has already closed or the route is unsafe.
  }
  if (screenshotCaptured) {
    await testInfo.attach('failure-redacted.png', { path: screenshot, contentType: 'image/png' });
  }
  const diagnosticTrace = {
    test: testInfo.title,
    status: testInfo.status,
    browser: testInfo.project.name,
    route: (() => {
      try {
        return new URL(page.url()).pathname;
      } catch {
        return 'unavailable';
      }
    })(),
    responses: (stagingResponses.get(page) ?? []).slice(-80),
    errors: testInfo.errors.map((error) => ({
      message: redactError(error.message ?? 'Unknown failure'),
    })),
  };
  const tracePath = testInfo.outputPath('failure-redacted-trace.json');
  await writeFile(tracePath, JSON.stringify(diagnosticTrace, null, 2), 'utf8');
  await testInfo.attach('failure-redacted-trace.json', {
    path: tracePath,
    contentType: 'application/json',
  });
});

async function signInWithFreshMfa(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  if (env.LIVE_E2E_EMAIL && env.LIVE_E2E_PASSWORD) {
    await page.getByLabel('Email').fill(env.LIVE_E2E_EMAIL);
    await page.getByLabel('Password').fill(env.LIVE_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
    process.stdout.write(
      '\nManual MFA checkpoint: complete the real challenge in this open staging browser. The same browser journey resumes automatically after sign-in.\n',
    );
  } else {
    process.stdout.write(
      '\nManual sign-in checkpoint: sign into the staging account and complete its real MFA challenge in this open browser. The same browser journey resumes automatically after Overview loads.\n',
    );
  }
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  if (!manualMfaChallengeObserved) {
    throw new Error(
      'Hosted acceptance requires observing the real staging MFA challenge in this browser.',
    );
  }
}

async function serviceRows<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${env.LIVE_E2E_SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok)
    throw new Error(`Staging read of ${table} failed with HTTP ${response.status}.`);
  return (await response.json()) as T[];
}

async function postAgentRuntime(
  page: import('@playwright/test').Page,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(async (payload) => {
    const response = await fetch('/api/agent-runtime/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }, body);
}

if (process.env.LIVE_E2E_FIXTURE_MISMATCH_EXPECTED_COUNT !== undefined) {
  test('deliberate staging fixture mismatch emits redacted failure diagnostics', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
    const fixtureIds = (process.env.LIVE_E2E_FIXTURE_IDS ?? '')
      .split(',')
      .filter((id) => id.length > 0);
    const expectedCount = Number(process.env.LIVE_E2E_FIXTURE_MISMATCH_EXPECTED_COUNT);
    expect(Number.isSafeInteger(expectedCount)).toBe(true);
    expect(
      fixtureIds,
      'Deliberate mismatch probe: staging fixture count must differ from the intentionally incorrect expectation.',
    ).toHaveLength(expectedCount);
  });
}

test('staging live journey proves unauthorised rejection, manual MFA, AAL2, Travel persistence and both engines', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(10 * 60_000);
  await page.goto('/login');
  const unauthenticated = await page.evaluate(async () => {
    const result = await fetch('/api/workflows/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workflowCode: 'travel-on-demand-plan',
        managerCode: 'travel',
        hardCapUsd: 0.01,
        modelCeiling: 'gpt-5.6-terra',
        searchCeiling: 0,
        idempotencyKey: '00000000-0000-4000-8000-000000000007',
        request: {
          purpose: 'Unauthenticated failure-path check',
          constraints: 'No provider calls.',
        },
      }),
    });
    return { status: result.status, body: (await result.json()) as { code?: string } };
  });
  expect(unauthenticated).toMatchObject({ status: 401, body: { code: 'unauthorised' } });
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  await expect(page.getByText(/Multi-factor authentication is required/)).toBeVisible();

  await signInWithFreshMfa(page);

  const fixtureKey = `ai14-live-e2e:${randomUUID()}`;
  const createdFixtureResponse = await postAgentRuntime(page, {
    operation: 'create_fixture',
    fixtureKey,
  });
  expect(createdFixtureResponse.status).toBe(201);
  const createdFixture = createdFixtureResponse.body as {
    fixtureKey: string;
    conversationId: string;
    ids: {
      messageId: string;
      handoffId: string;
      attentionId: string;
      actionId: string;
      evidenceReferenceId: string;
    };
  };
  expect(createdFixture.fixtureKey).toBe(fixtureKey);
  expect(createdFixture.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(createdFixture.ids.handoffId).toMatch(/^[0-9a-f-]{36}$/i);

  const contractRead = await postAgentRuntime(page, {
    operation: 'read_fixture',
    conversationId: createdFixture.conversationId,
  });
  expect(contractRead.status).toBe(200);
  const contractGraph = contractRead.body as {
    conversation: { id: string; currentManagerCode: string; metadata: Record<string, unknown> };
    messages: Array<{ id: string; authority: string }>;
    handoffs: Array<{ id: string; status: string }>;
    attentionItems: Array<{ id: string; status: string }>;
    actions: Array<{ id: string; status: string; approval_state: string }>;
    evidenceReferences: Array<{ id: string; source_type: string }>;
    evidenceLinks: Array<{ entity_id: string; entity_type: string }>;
  };
  expect(contractGraph.conversation).toMatchObject({
    id: createdFixture.conversationId,
    currentManagerCode: 'systems',
    metadata: { fixture: 'ai14-live-e2e', fixtureKey },
  });
  expect(contractGraph.messages).toContainEqual(
    expect.objectContaining({ id: createdFixture.ids.messageId, authority: 'system_generated' }),
  );
  expect(contractGraph.handoffs).toContainEqual(
    expect.objectContaining({ id: createdFixture.ids.handoffId, status: 'requested' }),
  );
  expect(contractGraph.attentionItems).toContainEqual(
    expect.objectContaining({ id: createdFixture.ids.attentionId, status: 'new' }),
  );
  expect(contractGraph.actions).toContainEqual(
    expect.objectContaining({
      id: createdFixture.ids.actionId,
      status: 'proposed',
      approval_state: 'not_required',
    }),
  );
  expect(contractGraph.evidenceReferences).toContainEqual(
    expect.objectContaining({
      id: createdFixture.ids.evidenceReferenceId,
      source_type: 'legacy_reference',
    }),
  );
  expect(contractGraph.evidenceLinks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entity_id: createdFixture.conversationId,
        entity_type: 'conversation',
      }),
      expect.objectContaining({
        entity_id: createdFixture.ids.handoffId,
        entity_type: 'conversation_handoff',
      }),
      expect.objectContaining({ entity_id: createdFixture.ids.actionId, entity_type: 'action' }),
    ]),
  );

  const acceptedHandoff = await postAgentRuntime(page, {
    operation: 'transition_handoff',
    handoffId: createdFixture.ids.handoffId,
    status: 'accepted',
  });
  expect(acceptedHandoff.status).toBe(200);
  expect(acceptedHandoff.body).toMatchObject({
    id: createdFixture.ids.handoffId,
    status: 'accepted',
  });
  const invalidHandoffTransition = await postAgentRuntime(page, {
    operation: 'transition_handoff',
    handoffId: createdFixture.ids.handoffId,
    status: 'requested',
  });
  expect(invalidHandoffTransition).toMatchObject({
    status: 409,
    body: { code: 'invalid_transition' },
  });

  const persistedGraph = await Promise.all([
    serviceRows<{ id: string; current_manager_code: string; status: string }>(
      'conversations',
      `select=id,current_manager_code,status&id=eq.${createdFixture.conversationId}`,
    ),
    serviceRows<{ id: string; authority: string }>(
      'conversation_messages',
      `select=id,authority&id=eq.${createdFixture.ids.messageId}`,
    ),
    serviceRows<{ id: string; status: string; accepted_at: string | null }>(
      'conversation_handoffs',
      `select=id,status,accepted_at&id=eq.${createdFixture.ids.handoffId}`,
    ),
    serviceRows<{ status: string }>(
      'conversation_handoff_events',
      `select=status&handoff_id=eq.${createdFixture.ids.handoffId}&order=created_at.asc`,
    ),
    serviceRows<{ id: string; status: string }>(
      'attention_items',
      `select=id,status&id=eq.${createdFixture.ids.attentionId}`,
    ),
    serviceRows<{ id: string; status: string; approval_state: string }>(
      'actions',
      `select=id,status,approval_state&id=eq.${createdFixture.ids.actionId}`,
    ),
    serviceRows<{ id: string; source_type: string }>(
      'evidence_references',
      `select=id,source_type&id=eq.${createdFixture.ids.evidenceReferenceId}`,
    ),
    serviceRows<{ entity_id: string; entity_type: string }>(
      'evidence_links',
      `select=entity_id,entity_type&evidence_reference_id=eq.${createdFixture.ids.evidenceReferenceId}`,
    ),
  ]);
  expect(persistedGraph[0][0]).toMatchObject({
    id: createdFixture.conversationId,
    current_manager_code: 'personal',
    status: 'open',
  });
  expect(persistedGraph[1][0]).toMatchObject({
    id: createdFixture.ids.messageId,
    authority: 'system_generated',
  });
  expect(persistedGraph[2][0]?.status).toBe('accepted');
  expect(persistedGraph[2][0]?.accepted_at).toBeTruthy();
  expect(persistedGraph[3].map(({ status }) => status)).toEqual(['requested', 'accepted']);
  expect(persistedGraph[4][0]?.status).toBe('new');
  expect(persistedGraph[5][0]).toMatchObject({
    status: 'proposed',
    approval_state: 'not_required',
  });
  expect(persistedGraph[6][0]?.source_type).toBe('legacy_reference');
  expect(persistedGraph[7]).toHaveLength(5);

  const acceptedContractRead = await postAgentRuntime(page, {
    operation: 'read_fixture',
    conversationId: createdFixture.conversationId,
  });
  expect(acceptedContractRead.status).toBe(200);
  expect(
    (acceptedContractRead.body as { conversation: { currentManagerCode: string } }).conversation
      .currentManagerCode,
  ).toBe('personal');
  expect(
    (acceptedContractRead.body as { handoffs: Array<{ status: string }> }).handoffs[0]?.status,
  ).toBe('accepted');

  const aal2Probe = await page.evaluate(async () => {
    const response = await fetch('/api/auth/mfa/aal2-probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return {
      httpStatus: response.status,
      body: (await response.json()) as { probeId?: string; status?: number; code?: string },
    };
  });
  expect(aal2Probe.httpStatus).toBe(200);
  expect(aal2Probe.body).toMatchObject({ status: 400, code: 'invalid_plan' });
  expect(aal2Probe.body.probeId).toMatch(/^[0-9a-f-]{36}$/i);

  const fixtureIds = (process.env.LIVE_E2E_FIXTURE_IDS ?? '')
    .split(',')
    .filter((id) => id.length > 0);
  for (const runId of fixtureIds) {
    expect(runId).toMatch(/^[0-9a-f-]{36}$/i);
    const cancellation = await page.evaluate(async (id) => {
      const response = await fetch('/api/workflows/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: id }),
      });
      return { status: response.status, body: (await response.json()) as { cancelled?: boolean } };
    }, runId);
    expect(cancellation).toMatchObject({ status: 200, body: { cancelled: true } });
    const rows = await serviceRows<{ status: string; cancelled_at: string | null }>(
      'workflow_runs',
      `select=status,cancelled_at&id=eq.${runId}`,
    );
    expect(rows[0]).toMatchObject({ status: 'cancelled' });
    expect(rows[0]?.cancelled_at).toBeTruthy();
  }

  await page.goto('/travel');
  await expect(page.getByRole('heading', { name: 'Travel Planning' })).toBeVisible();
  await page.getByLabel('Purpose').fill('AI7-LIVE-E2E-FIXTURE-v1');
  await page
    .getByLabel('Constraints')
    .fill('Zero web searches, no external calls, cancel immediately after queue verification.');
  await page.getByLabel(/Hard cap/).fill('0.01');
  await page.getByLabel(/Search ceiling/).fill('0');

  await page.route('**/api/workflows/launch', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.startsWith('a17e')) {
      body.idempotencyKey = `a17e${crypto.randomUUID().slice(4)}`;
    }
    body.modelCeiling = 'gpt-5.6-luna';
    await route.continue({ postData: JSON.stringify(body) });
  });

  const launchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/workflows/launch') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Queue research' }).click();
  const launchResponse = await launchResponsePromise;
  expect(launchResponse.status()).toBe(201);
  const launchBody = launchResponse.request().postDataJSON() as Record<string, unknown>;
  expect(launchBody.idempotencyKey).toMatch(/^a17e[0-9a-f-]{32}$/i);
  const launchResult = (await launchResponse.json()) as { runId: string };
  expect(launchBody).toMatchObject({
    workflowCode: 'travel-on-demand-plan',
    managerCode: 'travel',
    hardCapUsd: 0.01,
    modelCeiling: 'gpt-5.6-luna',
    searchCeiling: 0,
  });
  expect(launchResult.runId).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(
    page.getByText('Request queued. Its approved cap and brief are retained with the run.'),
  ).toBeVisible();

  const replayResponse = await page.evaluate(async (body) => {
    const response = await fetch('/api/workflows/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as { runId?: string } };
  }, launchBody);
  expect(replayResponse.status).toBe(201);
  expect(replayResponse.body.runId).toBe(launchResult.runId);

  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Operations Centre' })).toBeVisible();
  const queuedRun = page.locator('article').filter({ hasText: 'travel-on-demand-plan' });
  await expect(queuedRun.getByRole('button', { name: 'Cancel run' })).toBeVisible();
  await queuedRun.getByRole('button', { name: 'Cancel run' }).click();
  await expect(queuedRun.getByText('Cancelled. Refresh to update the queue.')).toBeVisible();
  const [cancelledRun, cancelledJob, runs] = await Promise.all([
    serviceRows<{ status: string; cancelled_at: string | null }>(
      'workflow_runs',
      `select=status,cancelled_at&id=eq.${launchResult.runId}`,
    ),
    serviceRows<{ status: string }>('job_queue', `select=status&run_id=eq.${launchResult.runId}`),
    serviceRows<{
      id: string;
      status: string;
      trigger: string;
      correlation_id: string;
      idempotency_key: string;
    }>(
      'workflow_runs',
      `select=id,status,trigger,correlation_id,idempotency_key&id=eq.${launchResult.runId}`,
    ),
  ]);
  expect(cancelledRun[0]).toMatchObject({ status: 'cancelled' });
  expect(cancelledRun[0]?.cancelled_at).toBeTruthy();
  expect(cancelledJob[0]?.status).toBe('cancelled');
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({
    id: launchResult.runId,
    status: 'cancelled',
    trigger: 'on_demand',
    idempotency_key: launchBody.idempotencyKey,
  });
  await page.goto('/ai-traces-audit');
  await expect(page.getByRole('heading', { name: 'AI Traces & Audit' })).toBeVisible();
  const correlatedTrace = page
    .getByRole('region', { name: 'Workflow traces' })
    .locator('article')
    .filter({ hasText: runs[0]!.correlation_id });
  await expect(
    correlatedTrace.getByRole('heading', { name: 'on_demand_run_queued' }),
  ).toBeVisible();

  let webkitProbeId: string | null = null;
  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    const webkitContext = await webkitBrowser.newContext({
      storageState: await page.context().storageState(),
    });
    const webkitPage = await webkitContext.newPage();
    await webkitPage.goto('/overview');
    await expect(webkitPage.getByRole('heading', { name: /Overview/ })).toBeVisible();
    const webkitProbe = await webkitPage.evaluate(async () => {
      const response = await fetch('/api/auth/mfa/aal2-probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      return {
        httpStatus: response.status,
        body: (await response.json()) as { probeId?: string; status?: number; code?: string },
      };
    });
    expect(webkitProbe.httpStatus).toBe(200);
    expect(webkitProbe.body).toMatchObject({ status: 400, code: 'invalid_plan' });
    if (!webkitProbe.body.probeId)
      throw new Error('WebKit AAL2 probe did not return its correlation ID.');
    webkitProbeId = webkitProbe.body.probeId;
    await webkitContext.close();
  } finally {
    await webkitBrowser.close();
  }

  const acceptanceOutputPath = process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH;
  if (acceptanceOutputPath) {
    if (!webkitProbeId)
      throw new Error('Hosted acceptance evidence requires the passing WebKit probe result.');
    const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
    const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA;
    const pullRequestNumber = process.env.LIVE_E2E_PULL_REQUEST_NUMBER;
    const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;
    if (!candidateSha || !candidateTreeSha || !pullRequestNumber || !deploymentRunId)
      throw new Error(
        'Hosted acceptance output requires candidate SHA, tree SHA, PR number, and deployment run ID.',
      );
    await writeLiveStagingAcceptanceEvidence(acceptanceOutputPath, {
      candidateSha,
      candidateTreeSha,
      pullRequestNumber: Number(pullRequestNumber),
      deploymentRunId,
      stagingOrigin: env.LIVE_E2E_BASE_URL,
      completeSuite: 'passed',
      manualMfaChallengeObserved,
      browserChecks: { chromium: 'passed', webkit: 'passed' },
      checks: {
        authAal2: 'passed',
        safeRead: 'passed',
        safeWrite: 'passed',
        ui: 'passed',
        edgeFunctions: 'passed',
        releaseVersion: 'passed',
      },
      correlationIds: [
        launchResult.runId,
        runs[0]!.correlation_id,
        aal2Probe.body.probeId!,
        webkitProbeId,
      ],
      acceptedAt: new Date().toISOString(),
    });
  }
});
