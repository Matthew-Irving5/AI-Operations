import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { liveAuthScheduleAction } from './live-auth-schedule-action.js';
import { writeLiveStagingAcceptanceEvidence } from './live-acceptance-evidence.js';

const runnerPath = resolve('infrastructure/scripts/run-live-e2e.ts');
const journeyPath = resolve('tests/e2e-live/auth-acceptance.spec.ts');

function assertOrdered(source: string, markers: string[]) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker, previousIndex + 1);
    assert.ok(index > previousIndex, `missing or out-of-order auth journey marker: ${marker}`);
    previousIndex = index;
  }
}

describe('live auth acceptance harness', () => {
  it('never uses the service role to read user-owned schedules', async () => {
    const runner = await readFile(runnerPath, 'utf8');
    const journey = await readFile(journeyPath, 'utf8');

    assert.doesNotMatch(runner, /rest\/v1\/workflow_schedules/);
    assert.doesNotMatch(runner, /LIVE_E2E_SCHEDULE_ID/);
    assert.doesNotMatch(journey, /readRows<[^>]+>\(\s*['"]workflow_schedules['"]/);
    assert.match(journey, /const scheduleCards = page\.locator\('article\[data-schedule-id\]'\)/);
  });

  it('uses the opposite state action for either owner-visible schedule state', () => {
    assert.deepEqual(liveAuthScheduleAction('Disabled · Europe/London'), {
      initialLabel: 'Disabled',
      initialEnabled: false,
      nextEnabled: true,
      buttonName: 'Enable schedule (fresh MFA required)',
      confirmationMessage: 'Schedule enabled.',
    });
    assert.deepEqual(liveAuthScheduleAction('Enabled · Europe/London'), {
      initialLabel: 'Enabled',
      initialEnabled: true,
      nextEnabled: false,
      buttonName: 'Disable schedule (fresh MFA required)',
      confirmationMessage: 'Schedule disabled.',
    });
    assert.throws(() => liveAuthScheduleAction('Unknown'), /status is missing or invalid/);
  });

  it('does not mistake the authenticated Playwright request context for a cookie-free client', async () => {
    const journey = await readFile(journeyPath, 'utf8');

    assert.match(
      journey,
      /page\.request shares this browser context's cookies and is not an unauthenticated probe/,
    );
    assert.doesNotMatch(journey, /page\.request\.post\(/);
  });

  it('waits for MFA freshness to expire after authenticated protected content is visible', async () => {
    const journey = await readFile(journeyPath, 'utf8');
    const scheduleVisible = journey.indexOf('a schedule must be visible to its signed-in owner');
    const timerStarts = journey.indexOf('const protectedContentReachedAt = Date.now()');

    assert.doesNotMatch(journey, /readRows(?:<[^>]+>)?\(\s*['"]mfa_reauthentication_events['"]/);
    assert.ok(scheduleVisible >= 0, 'the protected schedule content assertion must exist');
    assert.ok(
      timerStarts > scheduleVisible,
      'the stale timer must start after protected content is visible',
    );
    assert.match(journey, /protectedContentReachedAt \+ 5 \* 60_000 \+ 2_000/);
    assert.match(
      journey,
      /expect\(Date\.now\(\) - protectedContentReachedAt\)\.toBeGreaterThan\(5 \* 60_000\)/,
    );
  });

  it('pins the full authenticated journey context, state, and response matrix', async () => {
    const [runner, journey, mfaPage, mfaApi] = await Promise.all([
      readFile(runnerPath, 'utf8'),
      readFile(journeyPath, 'utf8'),
      readFile(resolve('apps/web/app/mfa/page.tsx'), 'utf8'),
      readFile(resolve('apps/web/app/api/auth/mfa/verify/route.ts'), 'utf8'),
    ]);

    assert.match(runner, /mode === 'auth-acceptance'[\s\S]*?rest\/v1\/app_users/);
    assert.match(
      runner,
      /Staging auth profile check failed with HTTP \$\{profileResponse\.status\}/,
    );
    assert.match(runner, /profiles\.length !== 1 \|\| !profiles\[0\]\?\.is_allowed/);
    assert.doesNotMatch(runner, /rest\/v1\/(?:workflow_schedules|mfa_reauthentication_events)/);
    assert.doesNotMatch(
      journey,
      /rest\/v1\/(?:app_users|workflow_schedules|mfa_reauthentication_events)/,
    );
    assert.match(mfaPage, /parseMfaPageJob\(params\.job\)/);
    assert.match(mfaApi, /'schedule_update'/);

    assertOrdered(journey, [
      "page.request.get(new URL('/api/release'",
      'expect(release.status()).toBe(200)',
      "new URL(frame.url()).pathname === '/mfa'",
      "await page.goto('/login')",
      'await expect(page).toHaveURL(/\\/overview',
      'expect(manualMfaChallengeObserved).toBe(true)',
      "await page.goto('/automations')",
      "'a schedule must be visible to its signed-in owner'",
      'const protectedContentReachedAt = Date.now()',
      'await page.waitForTimeout(waitMs)',
      'expect(Date.now() - protectedContentReachedAt).toBeGreaterThan(5 * 60_000)',
      'const staleRequest = { scheduleId: targetSchedule, enabled: scheduleAction.initialEnabled }',
      "method: 'POST'",
      "body: { code: 'fresh_mfa_required' }",
      'expect(staleAttempt.usedMfaGate).toBe(false)',
      "await expect(card.locator('div.label')).toHaveText(initialStatusPattern)",
      "await expect(card.getByLabel('Six-digit code')).toHaveCount(0)",
      'expect(probe.status).toBe(200)',
      "expect(probe.body).toMatchObject({ status: 400, code: 'invalid_plan' })",
      "await page.goto('/mfa?job=schedule_update&returnTo=%2Foverview')",
      "await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible()",
      "await expect(page.getByLabel('Six-digit code')).toBeVisible()",
      'await expect(page).toHaveURL(/\\/overview(?:\\?|$)/, { timeout: 60_000 })',
      "expect(gate).toMatchObject({ job: 'schedule_update' })",
      "if (gate?.job !== 'schedule_update' || !gate.id)",
      "method: 'POST'",
      'body: JSON.stringify(body)',
      'expect(freshAttempt.status).toBe(200)',
      'schedule: { enabled: scheduleAction.initialEnabled }',
      "await page.goto('/automations')",
      'const webkitBrowser = await webkit.launch({ headless: false })',
      'storageState: await page.context().storageState()',
      'expect(webkitProbe.status).toBe(200)',
      "expect(webkitProbe.body).toMatchObject({ status: 400, code: 'invalid_plan' })",
      'await writeLiveStagingAcceptanceEvidence(outputPath, {',
    ]);

    assert.match(journey, /liveAuthScheduleAction\(initialStatusLabel\)/);
    assert.match(journey, /staleAttemptUsedMfaGate: false/);
    assert.match(journey, /browserChecks: \{ chromium: 'passed', webkit: 'passed' \}/);
  });

  it('writes auth-browser evidence without unrelated AI-15 workflow proofs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ai13-auth-evidence-'));
    const evidencePath = join(directory, 'acceptance.json');
    try {
      await writeLiveStagingAcceptanceEvidence(evidencePath, {
        candidateSha: '1'.repeat(40),
        candidateTreeSha: '2'.repeat(40),
        pullRequestNumber: 167,
        deploymentRunId: '38595680998',
        stagingOrigin: 'https://ai-operations-staging.ai-operations.workers.dev',
        completeSuite: 'passed',
        manualMfaChallengeObserved: true,
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
        correlationIds: ['probe-auth-evidence'],
        acceptedAt: new Date().toISOString(),
      });

      const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as Record<string, unknown>;
      assert.equal(evidence.acceptanceProfile, 'auth-browser');
      assert.equal(Object.hasOwn(evidence, 'workflowRuns'), false);
      assert.deepEqual(evidence.freshMfaAction, {
        staleDenied: 'passed',
        staleAttemptUsedMfaGate: false,
        freshReauthAccepted: 'passed',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('proves stale denial without a gate before a real TOTP gate authorizes a same-state action', async () => {
    const journey = await readFile(journeyPath, 'utf8');

    assert.match(
      journey,
      /const staleRequest = \{ scheduleId: targetSchedule, enabled: scheduleAction\.initialEnabled \}/,
    );
    assert.match(
      journey,
      /usedMfaGate: Object\.prototype\.hasOwnProperty\.call\(body, 'mfaGateId'\)/,
    );
    assert.match(journey, /status: 403, body: \{ code: 'fresh_mfa_required' \}/);
    assert.match(journey, /expect\(staleAttempt\.usedMfaGate\)\.toBe\(false\)/);
    assert.match(journey, /page\.goto\('\/mfa\?job=schedule_update&returnTo=%2Foverview'\)/);
    assert.match(journey, /mfaGateId: gate\.id/);
    assert.match(
      journey,
      /freshAttempt\.body\)\.toMatchObject\(\{\s*schedule: \{ enabled: scheduleAction\.initialEnabled \}/,
    );
  });
});
