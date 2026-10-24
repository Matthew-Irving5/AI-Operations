import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { liveAuthScheduleAction } from './live-auth-schedule-action.js';
import { writeLiveStagingAcceptanceEvidence } from './live-acceptance-evidence.js';
import { createStagingAcceptanceStatus } from './release-gate.js';

const runnerPath = resolve('infrastructure/scripts/run-live-e2e.ts');
const journeyPath = resolve('tests/e2e-live/auth-acceptance.spec.ts');
const combinedJourneyPath = resolve('tests/e2e-live/staging.spec.ts');

const promptGovernanceProof = {
  templateId: '00000000-0000-4000-8000-000000000001',
  previousActiveVersion: 1,
  previousPromptVersionId: '00000000-0000-4000-8000-000000000002',
  previousModelRoute: 'gpt-5.6-terra',
  candidateId: '00000000-0000-4000-8000-000000000003',
  candidateVersion: 2,
  candidateModelRoute: 'gpt-5.6-luna',
  schemaVersion: 1,
  toolPolicyVersion: 1,
  evaluation: {
    passed: true,
    caseCount: 24,
    managerCount: 8,
    safetyPassed: true,
    evidencePassed: true,
    toolAuthorityPassed: true,
    schemaPassed: true,
    costPassed: true,
    latencyPassed: true,
  },
  promotionIdempotencyKey: '00000000-0000-4000-8000-000000000004',
  promotion: { previousVersion: 1, activeVersion: 2, replayed: false },
  candidateRun: {
    runId: 'candidate-run-1',
    correlationId: 'candidate-trace-1',
    reportId: 'candidate-report-1',
    aiCallId: '00000000-0000-4000-8000-000000000005',
    promptVersionId: '00000000-0000-4000-8000-000000000003',
    model: 'gpt-5.6-luna',
    modelRoute: 'gpt-5.6-luna',
    schemaVersion: 1,
    toolPolicyVersion: 1,
    actualCostUsd: 0.01,
    hardCapUsd: 0.05,
    searchCalls: 0,
  },
  rollbackIdempotencyKey: '00000000-0000-4000-8000-000000000006',
  rollback: { previousVersion: 2, activeVersion: 1, replayed: false },
  postRollbackRun: {
    runId: 'rollback-run-1',
    correlationId: 'rollback-trace-1',
    reportId: 'rollback-report-1',
    aiCallId: '00000000-0000-4000-8000-000000000007',
    promptVersionId: '00000000-0000-4000-8000-000000000002',
    model: 'gpt-5.6-terra',
    modelRoute: 'gpt-5.6-terra',
    schemaVersion: 1,
    toolPolicyVersion: 1,
    actualCostUsd: 0.01,
    hardCapUsd: 0.05,
    searchCalls: 0,
  },
  previousRunHistoryUnchanged: true,
  totalActualCostUsd: 0.02,
} as const;

function assertOrdered(source: string, markers: string[]) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker, previousIndex + 1);
    assert.ok(index > previousIndex, `missing or out-of-order auth journey marker: ${marker}`);
    previousIndex = index;
  }
}

describe('live auth acceptance harness', () => {
  it('refreshes the paired device inventory and observes its actual revoke response', async () => {
    const journey = await readFile(
      resolve('tests/e2e-live/mobile-shortcuts-acceptance.spec.ts'),
      'utf8',
    );
    const revoke = journey.slice(journey.indexOf('const revokeResponsePromise'));
    assertOrdered(journey.slice(journey.lastIndexOf("await page.goto('/data-sources')")), [
      "await page.goto('/data-sources')",
      'await expect(card).toBeVisible()',
      'const revokeResponsePromise',
    ]);
    assertOrdered(revoke, [
      "'/api/connections/revoke'",
      'connectionId === deviceId',
      'await revokeResponsePromise',
      'expect(revokeResponse.status()).toBe(204)',
      'Source revoked. Existing retained data is unchanged, and future syncs are blocked.',
    ]);
  });

  it('runs AI-16, AI-19, and auth-browser acceptance in one headed browser journey', async () => {
    const [runner, journey] = await Promise.all([
      readFile(runnerPath, 'utf8'),
      readFile(combinedJourneyPath, 'utf8'),
    ]);
    const authJourneyStart = journey.indexOf(
      "test('staging proves AI-16 prompt promotion/rollback and AI-19 correlated workflows",
    );
    const costJourneyStart = journey.indexOf(
      "test('staging proves one candidate-bound AI-20 Responses cost lifecycle",
    );
    assert.ok(authJourneyStart >= 0 && costJourneyStart > authJourneyStart);
    const authTestBody = journey.slice(authJourneyStart, costJourneyStart);
    const authSuite = journey.slice(0, costJourneyStart);

    assert.match(
      runner,
      /mode === 'suite'[\s\S]*?tests\/e2e-live\/staging\.spec\.ts'[\s\S]*?--grep=@ai16-ai19-acceptance/,
    );
    const suiteSelection = runner.slice(
      runner.indexOf('const acceptanceSpecs'),
      runner.indexOf('const liveArgs'),
    );
    const suiteBranch = suiteSelection.slice(suiteSelection.indexOf(": mode === 'suite'"));
    assert.doesNotMatch(suiteBranch, /auth-acceptance\.spec\.ts/);
    assert.match(authSuite, /staleDenied: 'passed'/);
    assert.match(authSuite, /freshReauthAccepted: 'passed'/);
    assert.equal([...authTestBody.matchAll(/await signInWithFreshMfa\(page\)/g)].length, 1);
    assert.match(authSuite, /acceptanceProfile: 'auth-browser'/);
    assert.match(authSuite, /promptGovernanceProof: governanceProof\.evidence/);
    assert.doesNotMatch(
      authSuite,
      /serviceRows(?:<[^>]+>)?\(\s*['"]prompt_version_transitions['"]/,
    );
    assert.match(authSuite, /promotionIdempotencyKey: promotionKey/);
    assert.match(authSuite, /rollbackIdempotencyKey: rollbackKey/);
  });

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
      'await expect(page).toHaveURL(/\\/overview(?:\\?|$)/, { timeout: 5 * 60_000 })',
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
        acceptanceProfile: 'auth-browser',
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

  it('preserves AI-16 prompt governance proof in combined auth-browser acceptance evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiops-combined-evidence-'));
    const evidencePath = join(directory, 'acceptance.json');
    const candidateSha = '1'.repeat(40);
    const candidateTreeSha = '2'.repeat(40);
    const deploymentRunId = '38595680998';
    const stagingOrigin = 'https://ai-operations-staging.ai-operations.workers.dev';
    try {
      await writeLiveStagingAcceptanceEvidence(evidencePath, {
        candidateSha,
        candidateTreeSha,
        pullRequestNumber: 167,
        deploymentRunId,
        stagingOrigin,
        acceptanceProfile: 'auth-browser',
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
        correlationIds: ['candidate-trace-1', 'rollback-trace-1'],
        promptGovernanceProof,
        acceptedAt: new Date().toISOString(),
      });

      const hostedSuite = JSON.parse(await readFile(evidencePath, 'utf8')) as Record<
        string,
        unknown
      >;
      const status = createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 167,
        state: 'success',
        deployment: {
          schemaVersion: 1,
          state: 'CANDIDATE_STAGING_DEPLOYED',
          candidateSha,
          candidateTreeSha,
          pullRequestNumber: 167,
          runId: deploymentRunId,
          runAttempt: '1',
          origin: stagingOrigin,
          acceptanceProfile: 'auth-browser',
          migrations: 'passed',
          edgeFunctions: 'passed',
          sourceDrift: 'passed',
          readinessSmoke: 'passed',
        },
        hostedSuite,
      });

      assert.equal(status.status.state, 'success');
      assert.equal(status.acceptance?.acceptanceProfile, 'auth-browser');
      assert.deepEqual(status.acceptance?.promptGovernanceProof, promptGovernanceProof);
      assert.deepEqual(status.acceptance?.freshMfaAction, {
        staleDenied: 'passed',
        staleAttemptUsedMfaGate: false,
        freshReauthAccepted: 'passed',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('writes targeted suite evidence through the acceptance status consumer without inventing fresh MFA proof', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiops-targeted-evidence-'));
    const evidencePath = join(directory, 'acceptance.json');
    const candidateSha = '1'.repeat(40);
    const candidateTreeSha = '2'.repeat(40);
    const deploymentRunId = '38595680998';
    const stagingOrigin = 'https://ai-operations-staging.ai-operations.workers.dev';
    const workflowRuns = [
      {
        workflowCode: 'systems-daily-cost-capacity',
        executionMode: 'deterministic',
        runId: 'run-deterministic-1',
        correlationId: 'trace-deterministic-1',
        reportId: 'report-deterministic-1',
        status: 'succeeded',
        model: 'none',
        aiCallCount: 0,
        actualCostUsd: 0,
        hardCapUsd: 0.01,
        inputTokens: 0,
        outputTokens: 0,
        searchCalls: 0,
        notificationDelivery: 'not_sent',
      },
      {
        workflowCode: 'systems-weekly-quality-platform',
        executionMode: 'ai',
        runId: 'run-ai-1',
        correlationId: 'trace-ai-1',
        reportId: 'report-ai-1',
        status: 'succeeded',
        model: 'gpt-5.6-luna',
        aiCallCount: 1,
        actualCostUsd: 0.02,
        hardCapUsd: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        searchCalls: 0,
        notificationDelivery: 'not_sent',
      },
    ] as const;
    try {
      await writeLiveStagingAcceptanceEvidence(evidencePath, {
        candidateSha,
        candidateTreeSha,
        pullRequestNumber: 167,
        deploymentRunId,
        stagingOrigin,
        acceptanceProfile: 'targeted',
        completeSuite: 'passed',
        manualMfaChallengeObserved: false,
        browserChecks: { chromium: 'passed', webkit: 'passed' },
        checks: {
          authAal2: 'passed',
          safeRead: 'passed',
          safeWrite: 'passed',
          ui: 'passed',
          edgeFunctions: 'passed',
          releaseVersion: 'passed',
        },
        correlationIds: ['run-deterministic-1', 'trace-deterministic-1', 'run-ai-1', 'trace-ai-1'],
        workflowRuns,
        acceptedAt: new Date().toISOString(),
      });

      const hostedSuite = JSON.parse(await readFile(evidencePath, 'utf8')) as Record<
        string,
        unknown
      >;
      const status = createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 167,
        state: 'success',
        deployment: {
          schemaVersion: 1,
          state: 'CANDIDATE_STAGING_DEPLOYED',
          candidateSha,
          candidateTreeSha,
          pullRequestNumber: 167,
          runId: deploymentRunId,
          runAttempt: '1',
          origin: stagingOrigin,
          acceptanceProfile: 'targeted',
          migrations: 'passed',
          edgeFunctions: 'passed',
          sourceDrift: 'passed',
          readinessSmoke: 'passed',
        },
        hostedSuite,
      });

      assert.equal(status.status.state, 'success');
      assert.equal(status.acceptance?.acceptanceProfile, 'targeted');
      assert.equal(status.acceptance?.humanMfa, 'not-required');
      assert.equal(Object.hasOwn(status.acceptance ?? {}, 'freshMfaAction'), false);
      assert.deepEqual(status.acceptance?.workflowRuns, workflowRuns);
      assert.deepEqual(status.acceptance?.correlationIds, [
        'run-deterministic-1',
        'trace-deterministic-1',
        'run-ai-1',
        'trace-ai-1',
      ]);
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
