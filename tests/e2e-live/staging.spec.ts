import { writeFile } from 'node:fs/promises';
import { expect, test, webkit } from '@playwright/test';
import { parseLiveE2eEnvironment } from '../../apps/web/lib/live-e2e-safety';

const env = parseLiveE2eEnvironment(process.env, 'suite');
const stagingResponses = new WeakMap<import('@playwright/test').Page, string[]>();

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
          page.getByText(env.LIVE_E2E_EMAIL, { exact: true }),
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
    await webkitContext.close();
  } finally {
    await webkitBrowser.close();
  }
});
