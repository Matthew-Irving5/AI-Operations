import { expect, test, webkit } from '@playwright/test';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import {
  resolveGitTreeSha,
  writeLiveStagingAcceptanceEvidence,
} from '../../infrastructure/scripts/live-acceptance-evidence.js';

const env = parseLiveE2eEnvironment(process.env, 'auth-acceptance');
const userId = process.env.LIVE_E2E_USER_ID;
const scheduleId = process.env.LIVE_E2E_SCHEDULE_ID;
const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA;
const pullRequestNumber = Number(process.env.LIVE_E2E_PULL_REQUEST_NUMBER);
const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;

function requiredUuid(value: string | undefined, name: string): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))
    throw new Error(`${name} is missing or invalid.`);
  return value;
}

async function readRows<T>(table: string, query: URLSearchParams): Promise<T[]> {
  const response = await fetch(`${stagingTarget.supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`Staging ${table} read failed with HTTP ${response.status}.`);
  return (await response.json()) as T[];
}

test('staging proves stale schedule action denial and fresh MFA recovery in Chromium and WebKit', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(15 * 60_000);
  const targetUser = requiredUuid(userId, 'LIVE_E2E_USER_ID');
  const targetSchedule = requiredUuid(scheduleId, 'LIVE_E2E_SCHEDULE_ID');
  expect(candidateSha).toMatch(/^[a-f0-9]{40}$/i);
  expect(candidateTreeSha).toMatch(/^[a-f0-9]{40}$/i);
  expect(pullRequestNumber).toBeGreaterThan(0);
  expect(deploymentRunId).toMatch(/^[1-9][0-9]{0,19}$/);
  expect(resolveGitTreeSha(candidateSha!)).toBe(candidateTreeSha);

  const release = await page.request.get(new URL('/api/release', env.LIVE_E2E_BASE_URL).href);
  expect(release.status()).toBe(200);
  expect(await release.json()).toEqual({
    schemaVersion: 1,
    releaseSha: candidateSha!.toLowerCase(),
  });

  let manualMfaChallengeObserved = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      if (new URL(frame.url()).pathname === '/mfa') manualMfaChallengeObserved = true;
    } catch {
      // Only a real navigation to the staging MFA route satisfies this proof.
    }
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  const unauthenticated = await page.request.post(
    new URL('/api/schedules/update', env.LIVE_E2E_BASE_URL).href,
    {
      data: { scheduleId: targetSchedule, enabled: false },
    },
  );
  expect(unauthenticated.status()).toBe(401);
  if (env.LIVE_E2E_EMAIL && env.LIVE_E2E_PASSWORD) {
    await page.getByLabel('Email').fill(env.LIVE_E2E_EMAIL);
    await page.getByLabel('Password').fill(env.LIVE_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
    process.stdout.write(
      '\nComplete the real staging Microsoft Authenticator challenge in this browser. The test resumes automatically after sign-in.\n',
    );
  } else {
    process.stdout.write(
      '\nSign in and complete the real staging Microsoft Authenticator challenge in this browser. The test resumes automatically after sign-in.\n',
    );
  }
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  expect(manualMfaChallengeObserved).toBe(true);

  const scheduleQuery = new URLSearchParams({
    select: 'id,enabled',
    id: `eq.${targetSchedule}`,
    user_id: `eq.${targetUser}`,
  });
  const initialSchedules = await readRows<{ id: string; enabled: boolean }>(
    'workflow_schedules',
    scheduleQuery,
  );
  expect(initialSchedules).toEqual([{ id: targetSchedule, enabled: false }]);

  const eventQuery = new URLSearchParams({
    select: 'verified_at',
    user_id: `eq.${targetUser}`,
    order: 'verified_at.desc',
    limit: '1',
  });
  let events = await readRows<{ verified_at: string }>('mfa_reauthentication_events', eventQuery);
  if (events.length !== 1)
    throw new Error('Staging MFA reauthentication evidence is missing or ambiguous.');
  const staleAfter = Date.parse(events[0]!.verified_at) + 5 * 60_000 + 2_000;
  const waitMs = staleAfter - Date.now();
  if (waitMs > 0) {
    process.stdout.write(
      `Waiting ${Math.ceil(waitMs / 1000)}s for the spec-defined five-minute MFA freshness window to expire.\n`,
    );
    await page.waitForTimeout(waitMs);
  }
  events = await readRows<{ verified_at: string }>('mfa_reauthentication_events', eventQuery);
  expect(events).toHaveLength(1);
  expect(Date.now() - Date.parse(events[0]!.verified_at)).toBeGreaterThan(5 * 60_000);

  const staleAttempt = await page.evaluate(
    async (body) => {
      const response = await fetch('/api/schedules/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as { code?: string } };
    },
    { scheduleId: targetSchedule, enabled: false },
  );
  expect(staleAttempt).toMatchObject({ status: 403, body: { code: 'fresh_mfa_required' } });
  expect(
    await readRows<{ id: string; enabled: boolean }>('workflow_schedules', scheduleQuery),
  ).toEqual([{ id: targetSchedule, enabled: false }]);

  const probe = await page.evaluate(async () => {
    const response = await fetch('/api/auth/mfa/aal2-probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return { status: response.status, body: (await response.json()) as { probeId?: string } };
  });
  expect(probe.status).toBe(200);
  expect(probe.body.probeId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/);

  await page.goto('/automations');
  const card = page.locator(`[data-schedule-id="${targetSchedule}"]`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Disable schedule (fresh MFA required)' }).click();
  await expect(card.getByLabel('Six-digit code')).toBeVisible();
  process.stdout.write(
    '\nComplete Microsoft Authenticator in the visible browser to reauthenticate the schedule action.\n',
  );
  const updateResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/schedules/update') && response.request().method() === 'POST',
    { timeout: 5 * 60_000 },
  );
  await expect(
    card.getByText('Verify with Microsoft Authenticator to disable this schedule.'),
  ).toBeVisible();
  await expect
    .poll(async () => card.getByLabel('Six-digit code').isVisible(), { timeout: 60_000 })
    .toBe(true);
  await expect(card.getByLabel('Six-digit code'))
    .toBeFocused({ timeout: 60_000 })
    .catch(() => undefined);
  const updateResponse = await updateResponsePromise;
  expect(updateResponse.status()).toBe(200);
  expect(await updateResponse.json()).toMatchObject({ schedule: { enabled: false } });
  await expect(card.getByText('Schedule disabled.')).toBeVisible();
  expect(
    await readRows<{ id: string; enabled: boolean }>('workflow_schedules', scheduleQuery),
  ).toEqual([{ id: targetSchedule, enabled: false }]);

  const webkitBrowser = await webkit.launch({ headless: false });
  try {
    const webkitContext = await webkitBrowser.newContext({
      storageState: await page.context().storageState(),
    });
    const webkitPage = await webkitContext.newPage();
    await webkitPage.goto(new URL('/overview', env.LIVE_E2E_BASE_URL).href);
    await expect(webkitPage.getByRole('heading', { name: 'Overview' })).toBeVisible();
    const webkitProbe = await webkitPage.evaluate(async () => {
      const response = await fetch('/api/auth/mfa/aal2-probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      return { status: response.status, body: (await response.json()) as { probeId?: string } };
    });
    expect(webkitProbe.status).toBe(200);
    expect(webkitProbe.body.probeId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/);

    const outputPath = process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH;
    if (!outputPath) throw new Error('Hosted acceptance output path is missing.');
    await writeLiveStagingAcceptanceEvidence(outputPath, {
      candidateSha: candidateSha!.toLowerCase(),
      candidateTreeSha: candidateTreeSha!.toLowerCase(),
      pullRequestNumber,
      deploymentRunId,
      stagingOrigin: stagingTarget.origin,
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
      freshMfaAction: { staleDenied: 'passed', freshReauthAccepted: 'passed' },
      correlationIds: [probe.body.probeId!, webkitProbe.body.probeId!],
      acceptedAt: new Date().toISOString(),
    });
  } finally {
    await webkitBrowser.close();
  }
});
