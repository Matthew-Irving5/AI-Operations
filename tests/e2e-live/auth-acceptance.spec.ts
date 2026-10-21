import { expect, test, webkit } from '@playwright/test';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import {
  resolveGitTreeSha,
  writeLiveStagingAcceptanceEvidence,
} from '../../infrastructure/scripts/live-acceptance-evidence.js';
import { liveAuthScheduleAction } from '../../infrastructure/scripts/live-auth-schedule-action.js';

// Playwright page.request shares this browser context's cookies and is not an unauthenticated probe.
const env = parseLiveE2eEnvironment(process.env, 'auth-acceptance');
const userId = process.env.LIVE_E2E_USER_ID;
const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA;
const pullRequestNumber = Number(process.env.LIVE_E2E_PULL_REQUEST_NUMBER);
const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;

function requiredUuid(value: string | undefined, name: string): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))
    throw new Error(`${name} is missing or invalid.`);
  return value;
}

test('staging proves stale schedule action denial and fresh MFA recovery in Chromium and WebKit', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(15 * 60_000);
  const targetUser = requiredUuid(userId, 'LIVE_E2E_USER_ID');
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

  await page.goto('/automations');
  const scheduleCards = page.locator('article[data-schedule-id]');
  await expect(
    scheduleCards.first(),
    'a schedule must be visible to its signed-in owner',
  ).toBeVisible();
  const protectedContentReachedAt = Date.now();
  const card = scheduleCards.first();
  const targetSchedule = requiredUuid(
    await card.getAttribute('data-schedule-id'),
    'owned schedule id',
  );
  const initialStatusLabel = await card.locator('div.label').textContent();
  if (!initialStatusLabel) throw new Error('Owned schedule status is missing.');
  const scheduleAction = liveAuthScheduleAction(initialStatusLabel);
  const initialStatusPattern = new RegExp(`^${scheduleAction.initialLabel} ·`);
  await expect(card.getByRole('button', { name: scheduleAction.buttonName })).toBeVisible();
  await expect(card.locator('div.label')).toHaveText(initialStatusPattern);

  const staleAfter = protectedContentReachedAt + 5 * 60_000 + 2_000;
  const waitMs = staleAfter - Date.now();
  process.stdout.write(
    `Waiting ${Math.ceil(Math.max(0, waitMs) / 1000)}s after authenticated schedule content for the spec-defined five-minute MFA freshness window to expire.\n`,
  );
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  expect(Date.now() - protectedContentReachedAt).toBeGreaterThan(5 * 60_000);

  const staleRequest = { scheduleId: targetSchedule, enabled: scheduleAction.initialEnabled };
  const staleAttempt = await page.evaluate(async (body) => {
    const response = await fetch('/api/schedules/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      usedMfaGate: Object.prototype.hasOwnProperty.call(body, 'mfaGateId'),
      body: (await response.json()) as { code?: string },
    };
  }, staleRequest);
  expect(staleAttempt).toMatchObject({ status: 403, body: { code: 'fresh_mfa_required' } });
  expect(staleAttempt.usedMfaGate).toBe(false);
  await expect(card.locator('div.label')).toHaveText(initialStatusPattern);
  await expect(card.getByLabel('Six-digit code')).toHaveCount(0);
  await expect(card.getByText('Fresh MFA is required before changing this schedule.')).toHaveCount(
    0,
  );

  const probe = await page.evaluate(async () => {
    const response = await fetch('/api/auth/mfa/aal2-probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return {
      status: response.status,
      body: (await response.json()) as { probeId?: string; status?: number; code?: string },
    };
  });
  expect(probe.status).toBe(200);
  expect(probe.body).toMatchObject({ status: 400, code: 'invalid_plan' });
  expect(probe.body.probeId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/);

  await page.goto('/mfa?job=schedule_update&returnTo=%2Foverview');
  await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  process.stdout.write(
    '\nComplete Microsoft Authenticator in the visible browser to reauthenticate the schedule action.\n',
  );
  // The operator may need to switch to their authenticator and back. Keep the
  // headed browser alive for the same bounded window as the initial sign-in.
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  const gate = await page.evaluate(() => {
    const raw = localStorage.getItem('mfa_job_gate') ?? sessionStorage.getItem('mfa_job_gate');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { job?: string; id?: string };
    return { job: parsed.job, id: parsed.id };
  });
  expect(gate).toMatchObject({ job: 'schedule_update' });
  if (gate?.job !== 'schedule_update' || !gate.id) {
    throw new Error('Fresh TOTP did not store the schedule update gate.');
  }
  expect(gate.id).toMatch(/^[0-9a-f-]{36}$/i);
  const freshAttempt = await page.evaluate(
    async (body) => {
      const response = await fetch('/api/schedules/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json()) as { schedule?: { enabled?: boolean }; code?: string },
      };
    },
    { scheduleId: targetSchedule, enabled: scheduleAction.initialEnabled, mfaGateId: gate.id },
  );
  expect(freshAttempt.status).toBe(200);
  expect(freshAttempt.body).toMatchObject({
    schedule: { enabled: scheduleAction.initialEnabled },
  });
  await page.goto('/automations');
  await expect(
    page
      .locator(`[data-schedule-id="${targetSchedule}"]`)
      .locator('div.label')
      .getByText(new RegExp(`^${scheduleAction.initialLabel} ·`)),
  ).toBeVisible();

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
      return {
        status: response.status,
        body: (await response.json()) as { probeId?: string; status?: number; code?: string },
      };
    });
    expect(webkitProbe.status).toBe(200);
    expect(webkitProbe.body).toMatchObject({ status: 400, code: 'invalid_plan' });
    expect(webkitProbe.body.probeId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/);

    const outputPath = process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH;
    if (!outputPath) throw new Error('Hosted acceptance output path is missing.');
    await writeLiveStagingAcceptanceEvidence(outputPath, {
      candidateSha: candidateSha!.toLowerCase(),
      candidateTreeSha: candidateTreeSha!.toLowerCase(),
      pullRequestNumber,
      deploymentRunId,
      stagingOrigin: stagingTarget.origin,
      acceptanceProfile: 'auth-browser',
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
      freshMfaAction: {
        staleDenied: 'passed',
        staleAttemptUsedMfaGate: false,
        freshReauthAccepted: 'passed',
      },
      correlationIds: [probe.body.probeId!, webkitProbe.body.probeId!],
      acceptedAt: new Date().toISOString(),
    });
  } finally {
    await webkitBrowser.close();
  }
});
