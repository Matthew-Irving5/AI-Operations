import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  resolveGitTreeSha,
  writeLiveStagingAcceptanceEvidence,
} from './live-acceptance-evidence.js';
import { execFileSync } from 'node:child_process';
import {
  acceptStagingCandidate,
  acquireStagingSlot,
  authorizeProductionPromotion,
  createStagingReadyEvidence,
  createCandidateReadinessEvidence,
  createStagingAcceptanceStatus,
  inspectStagingAcceptanceLease,
  recordProductionSmoke,
  releaseStagingSlot,
  selectLatestRequiredWorkflowRuns,
  type StagingAcceptanceEvidence,
  type StagingDeploymentEvidence,
} from './release-gate.js';

const candidateSha = 'a'.repeat(40);
const nextSha = 'b'.repeat(40);
const candidateTreeSha = 'c'.repeat(40);
const mergeCommitSha = 'd'.repeat(40);
const repositoryFullName = 'Matthew-Irving5/AI-Operations';
const origin = 'https://ai-operations-staging.ai-operations.workers.dev';

function deployment(overrides: Partial<StagingDeploymentEvidence> = {}): StagingDeploymentEvidence {
  return {
    candidateSha,
    runId: '36474707377',
    origin,
    workerVersion: 'worker-v1',
    migrations: 'passed',
    edgeFunctions: 'passed',
    sourceDrift: 'passed',
    readinessSmoke: 'passed',
    ...overrides,
  };
}

function candidateDeploymentEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    state: 'CANDIDATE_STAGING_DEPLOYED',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    runId: '36474707377',
    runAttempt: '2',
    origin,
    migrations: 'passed',
    edgeFunctions: 'passed',
    sourceDrift: 'passed',
    readinessSmoke: 'passed',
    ...overrides,
  };
}

function hostedSuiteEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    state: 'LIVE_STAGING_E2E_ACCEPTED',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'user-completed',
    checks: {
      authAal2: 'passed',
      safeRead: 'passed',
      safeWrite: 'passed',
      ui: 'passed',
      edgeFunctions: 'passed',
      releaseVersion: 'passed',
    },
    correlationIds: ['run-uuid-1', 'trace-uuid-1'],
    acceptedAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

function ready(overrides: Partial<Parameters<typeof createStagingReadyEvidence>[0]> = {}) {
  return createStagingReadyEvidence({
    candidateSha,
    pullRequestHeadSha: candidateSha,
    candidateTreeSha,
    pullRequestTreeSha: candidateTreeSha,
    prNumber: 152,
    localQa: 'passed',
    ci: 'passed',
    deployment: deployment(),
    ...overrides,
  });
}

type RawStagingAcceptance = {
  candidateSha: string;
  deploymentRunId: string;
  stagingOrigin: string;
  humanMfa: 'user-completed';
  checks: StagingAcceptanceEvidence['checks'];
  correlationIds: string[];
  acceptedAt: string;
};

function stagingAcceptanceInput(
  overrides: Partial<RawStagingAcceptance> = {},
): RawStagingAcceptance {
  return {
    candidateSha,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'user-completed',
    checks: {
      authAal2: 'passed',
      safeRead: 'passed',
      safeWrite: 'passed',
      ui: 'passed',
      migrations: 'passed',
      edgeFunctions: 'passed',
      releaseVersion: 'passed',
      releaseVersion: 'passed',
    },
    correlationIds: ['run-1', 'trace-1'],
    acceptedAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

function accepted(overrides: Partial<StagingAcceptanceEvidence> = {}) {
  return acceptStagingCandidate({
    ready: ready(),
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    acceptance: { ...stagingAcceptanceInput(), ...overrides } as RawStagingAcceptance,
  });
}

function promotionInput(
  overrides: Partial<Parameters<typeof authorizeProductionPromotion>[0]> = {},
) {
  return {
    requestedSha: mergeCommitSha,
    mergeCommitSha,
    mergeCommitTreeSha: candidateTreeSha,
    repositoryFullName,
    associatedPullRequests: [
      {
        number: 152,
        state: 'closed' as const,
        mergedAt: '2026-09-29T11:00:00.000Z',
        mergeCommitSha,
        headSha: candidateSha,
        baseBranch: 'main',
        headRepositoryFullName: repositoryFullName,
      },
    ],
    acceptance: accepted(),
    ...overrides,
  };
}

function promotion(overrides: Partial<Parameters<typeof authorizeProductionPromotion>[0]> = {}) {
  return authorizeProductionPromotion(promotionInput(overrides));
}

test('local or hosted CI failure cannot produce staging-ready evidence', () => {
  assert.throws(() => ready({ localQa: 'failed' }), /local_qa_not_passed/);
  assert.throws(() => ready({ ci: 'failed' }), /ci_not_passed/);
});

const candidateWorkflowNames = [
  'CI',
  'Database',
  'Edge functions',
  'E2E',
  'Security',
  'Performance',
  'Windows worker foundation',
  'CodeQL Advanced',
  'Dependency review',
] as const;
function candidateInput(overrides: Record<string, unknown> = {}) {
  return {
    candidateSha,
    pullRequestHeadSha: candidateSha,
    prNumber: 152,
    baseBranch: 'main',
    sameRepository: true,
    pullRequestOpen: true,
    checks: candidateWorkflowNames.map((name) => ({
      name,
      headSha: candidateSha,
      conclusion: 'success',
    })),
    ...overrides,
  };
}

test('candidate readiness requires an open same-repository main PR and every required check on the exact SHA', () => {
  const evidence = createCandidateReadinessEvidence(candidateInput());
  assert.equal(evidence.state, 'CANDIDATE_READY_FOR_STAGING');
  assert.equal(evidence.candidateSha, candidateSha);
  assert.equal(evidence.checks.length, candidateWorkflowNames.length);
  for (const overrides of [
    { pullRequestHeadSha: nextSha },
    { baseBranch: 'release' },
    { sameRepository: false },
    { pullRequestOpen: false },
    { checks: candidateInput().checks.filter((check) => check.name !== 'E2E') },
    {
      checks: candidateInput().checks.map((check) =>
        check.name === 'Security' ? { ...check, headSha: nextSha } : check,
      ),
    },
    {
      checks: candidateInput().checks.map((check) =>
        check.name === 'Security' ? { ...check, conclusion: 'pending' } : check,
      ),
    },
    { checks: [...candidateInput().checks, candidateInput().checks[0]] },
  ]) {
    assert.throws(() => createCandidateReadinessEvidence(candidateInput(overrides)));
  }
});

test('candidate must be the current pull request head and exact staging deployment SHA', () => {
  assert.throws(() => ready({ pullRequestHeadSha: nextSha }), /stale_candidate/);
  assert.throws(() => ready({ pullRequestTreeSha: nextSha }), /candidate_tree_mismatch/);
  assert.throws(
    () => ready({ deployment: deployment({ candidateSha: nextSha }) }),
    /deployment_sha_mismatch/,
  );
});

test('required workflow selection prefers the newest run number before its rerun attempt', () => {
  const latest = selectLatestRequiredWorkflowRuns({
    candidateSha,
    workflowRuns: [
      {
        id: 900,
        name: 'CI',
        event: 'pull_request',
        head_sha: candidateSha,
        status: 'completed',
        conclusion: 'success',
        run_number: 12,
        run_attempt: 1,
      },
      {
        id: 901,
        name: 'CI',
        event: 'pull_request',
        head_sha: candidateSha,
        status: 'in_progress',
        conclusion: null,
        run_number: 13,
        run_attempt: 1,
      },
      {
        id: 902,
        name: 'CI',
        event: 'pull_request',
        head_sha: candidateSha,
        status: 'completed',
        conclusion: 'success',
        run_number: 12,
        run_attempt: 4,
      },
      {
        id: 903,
        name: 'CI',
        event: 'push',
        head_sha: candidateSha,
        status: 'completed',
        conclusion: 'success',
        run_number: 14,
        run_attempt: 1,
      },
      {
        id: 904,
        name: 'CI',
        event: 'pull_request',
        head_sha: nextSha,
        status: 'completed',
        conclusion: 'success',
        run_number: 15,
        run_attempt: 1,
      },
    ],
  });
  assert.deepEqual(
    latest.map((run) => [run.id, run.run_number, run.run_attempt]),
    [[901, 13, 1]],
  );
});

test('staging lease blocks a competing current PR and clears for same, stale, closed, failed, or accepted heads', () => {
  const pendingStatus = {
    context: 'AI Operations / Staging capability acceptance',
    state: 'pending' as const,
    description: 'Staging is deployed; waiting for hosted acceptance.',
    created_at: '2026-09-29T10:00:00.000Z',
  };
  const currentPr = {
    number: 153,
    state: 'open' as const,
    baseBranch: 'main',
    headRepositoryFullName: repositoryFullName,
    headSha: nextSha,
    statuses: [pendingStatus],
  };
  const base = { candidateSha, repositoryFullName, pullRequests: [currentPr] };
  assert.deepEqual(inspectStagingAcceptanceLease(base), {
    available: false,
    owner: { pullRequestNumber: 153, candidateSha: nextSha },
  });
  assert.deepEqual(
    inspectStagingAcceptanceLease({
      ...base,
      pullRequests: [{ ...currentPr, headSha: candidateSha }],
    }),
    { available: true },
  );
  assert.deepEqual(
    inspectStagingAcceptanceLease({
      ...base,
      pullRequests: [{ ...currentPr, headSha: nextSha, statuses: [] }],
    }),
    { available: true },
    'the current PR head is authoritative; a lease on an older head is not carried forward',
  );
  assert.deepEqual(
    inspectStagingAcceptanceLease({ ...base, pullRequests: [{ ...currentPr, state: 'closed' }] }),
    { available: true },
  );
  for (const state of ['failure', 'success'] as const) {
    assert.deepEqual(
      inspectStagingAcceptanceLease({
        ...base,
        pullRequests: [
          {
            ...currentPr,
            statuses: [
              pendingStatus,
              {
                ...pendingStatus,
                state,
                description: `Acceptance ${state}`,
                created_at: '2026-09-29T10:01:00.000Z',
              },
            ],
          },
        ],
      }),
      { available: true },
    );
  }
});

test('migration, Edge Function, drift, and readiness evidence are mandatory', () => {
  for (const key of ['migrations', 'edgeFunctions', 'sourceDrift', 'readinessSmoke'] as const) {
    assert.throws(
      () =>
        ready({
          deployment: { ...deployment(), [key]: 'failed' } as unknown as StagingDeploymentEvidence,
        }),
      new RegExp(key),
    );
  }
});

test('staging acceptance binds manual MFA and capability proof to its exact deployment run and SHA', () => {
  const evidence = accepted();
  assert.equal(evidence.state, 'STAGING_ACCEPTED');
  assert.equal(evidence.candidateSha, candidateSha);
  assert.equal(evidence.candidateTreeSha, candidateTreeSha);
  assert.equal(evidence.pullRequestNumber, 152);
  assert.equal(evidence.humanMfa, 'user-completed');
  assert.throws(
    () =>
      acceptStagingCandidate({
        ready: ready(),
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        acceptance: { ...evidence, candidateSha: nextSha },
      }),
    /acceptance_sha_mismatch/,
  );
  assert.throws(
    () =>
      acceptStagingCandidate({
        ready: ready(),
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        acceptance: { ...evidence, deploymentRunId: '36474707378' },
      }),
    /deployment_run_mismatch/,
  );
  assert.throws(
    () =>
      acceptStagingCandidate({
        ready: ready(),
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: nextSha,
        currentPullRequestNumber: 152,
        acceptance: stagingAcceptanceInput(),
      }),
    /pr_tree_advanced/,
  );
  assert.throws(
    () =>
      acceptStagingCandidate({
        ready: ready(),
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 153,
        acceptance: stagingAcceptanceInput(),
      }),
    /pr_number_mismatch/,
  );
});

test('staging acceptance status is pending until complete current-head hosted evidence passes', () => {
  const pending = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    state: 'pending',
    phase: 'hosted_acceptance',
  });
  assert.equal(pending.status.state, 'pending');
  assert.equal(pending.status.context, 'AI Operations / Staging capability acceptance');
  const failure = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    state: 'failure',
    failureCode: 'capability_failed',
  });
  assert.equal(failure.status.state, 'failure');
  const slotBusy = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    state: 'failure',
    failureCode: 'staging_slot_busy',
  });
  assert.equal(slotBusy.status.description, 'Staging acceptance failed: staging_slot_busy.');
  const success = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence(),
    hostedSuite: hostedSuiteEvidence(),
  });
  assert.equal(success.status.state, 'success');
  assert.equal(success.candidateSha, candidateSha);
  assert.equal(success.acceptance?.candidateTreeSha, candidateTreeSha);
  assert.equal(success.acceptance?.pullRequestNumber, 152);
  assert.equal(success.acceptance?.checks.migrations, 'passed');
  for (const phase of ['required_checks', 'staging_deployment', 'hosted_acceptance'] as const) {
    assert.equal(
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        state: 'pending',
        phase,
      }).status.state,
      'pending',
    );
  }
});

test('failed, missing, malformed, stale, or wrong-run acceptance cannot publish success', () => {
  const valid = hostedSuiteEvidence();
  const base = {
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success' as const,
    deployment: candidateDeploymentEvidence(),
    hostedSuite: valid,
  };
  assert.throws(
    () => createStagingAcceptanceStatus({ ...base, hostedSuite: undefined }),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        ...base,
        hostedSuite: { ...valid, checks: { ...valid.checks, safeWrite: 'failed' } },
      }),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({ ...base, hostedSuite: { ...valid, candidateSha: nextSha } }),
    /acceptance_sha_mismatch/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        ...base,
        hostedSuite: { ...valid, deploymentRunId: '36474707378' },
      }),
    /deployment_run_mismatch/,
  );
  assert.throws(
    () => createStagingAcceptanceStatus({ ...base, currentPullRequestHeadSha: nextSha }),
    /stale_candidate/,
  );
  assert.throws(
    () => createStagingAcceptanceStatus({ ...base, currentPullRequestTreeSha: nextSha }),
    /candidate_tree_mismatch/,
  );
  assert.throws(
    () => createStagingAcceptanceStatus({ ...base, currentPullRequestNumber: 153 }),
    /pr_number_mismatch/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        ...base,
        deployment: candidateDeploymentEvidence({ migrations: 'failed' }),
      }),
    /invalid_evidence/,
  );
});

test('headed acceptance evidence is written only for the complete MFA and dual-browser suite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai8-live-acceptance-'));
  const validInput = {
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
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
    correlationIds: ['run-uuid-1', 'trace-uuid-1'],
    acceptedAt: '2026-09-29T10:00:00.000Z',
  };
  try {
    const outputPath = join(directory, 'accepted.json');
    await writeLiveStagingAcceptanceEvidence(outputPath, validInput);
    const evidence = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
    assert.equal(evidence.state, 'LIVE_STAGING_E2E_ACCEPTED');
    assert.equal(evidence.candidateSha, candidateSha);
    assert.equal(evidence.candidateTreeSha, candidateTreeSha);
    assert.equal(evidence.pullRequestNumber, 152);
    assert.equal(evidence.deploymentRunId, '36474707377');
    assert.equal(evidence.humanMfa, 'user-completed');
    assert.deepEqual(evidence.checks, {
      authAal2: 'passed',
      safeRead: 'passed',
      safeWrite: 'passed',
      ui: 'passed',
      edgeFunctions: 'passed',
      releaseVersion: 'passed',
    });
    assert.equal('releaseSha' in evidence, false);
    assert.equal('password' in evidence, false);

    const invalidInputs = [
      { ...validInput, completeSuite: 'failed' },
      { ...validInput, manualMfaChallengeObserved: false },
      { ...validInput, browserChecks: { chromium: 'passed', webkit: 'failed' } },
      { ...validInput, checks: { ...validInput.checks, safeWrite: 'failed' } },
      { ...validInput, checks: { ...validInput.checks, releaseVersion: 'failed' } },
      { ...validInput, candidateSha: 'invalid-sha' },
      { ...validInput, candidateTreeSha: 'invalid-tree' },
      { ...validInput, pullRequestNumber: 0 },
      { ...validInput, deploymentRunId: '' },
    ];
    for (const [index, invalidInput] of invalidInputs.entries()) {
      const rejectedPath = join(directory, `rejected-${index}.json`);
      await assert.rejects(writeLiveStagingAcceptanceEvidence(rejectedPath, invalidInput));
      await assert.rejects(stat(rejectedPath));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('candidate tree is resolved from git objects without shell interpolation', () => {
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const expectedTreeSha = execFileSync('git', ['rev-parse', '--verify', `${headSha}^{tree}`], {
    encoding: 'utf8',
  }).trim();
  assert.equal(resolveGitTreeSha(headSha), expectedTreeSha);
  assert.throws(() => resolveGitTreeSha('not-a-sha'), /Candidate SHA is invalid/);
});

test('JSON status CLI exposes pending, failure and validated success transitions only', () => {
  const pending = runCli('staging-status', {
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    state: 'pending',
    phase: 'required_checks',
  });
  assert.equal(pending.status, 0);
  assert.equal(JSON.parse(pending.stdout).status.state, 'pending');

  const failure = runCli('staging-status', {
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    state: 'failure',
    failureCode: 'capability_failed',
  });
  assert.equal(failure.status, 0);
  assert.equal(JSON.parse(failure.stdout).status.state, 'failure');

  const success = runCli('staging-status', {
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence(),
    hostedSuite: hostedSuiteEvidence(),
  });
  assert.equal(success.status, 0);
  const successEvidence = JSON.parse(success.stdout);
  assert.equal(successEvidence.status.state, 'success');
  assert.equal(successEvidence.acceptance.candidateSha, candidateSha);
  assert.equal(successEvidence.acceptance.candidateTreeSha, candidateTreeSha);
  assert.equal(successEvidence.acceptance.pullRequestNumber, 152);
  const rejected = runCli('staging-status', {
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence(),
    hostedSuite: hostedSuiteEvidence({
      checks: { ...hostedSuiteEvidence().checks, safeWrite: 'failed' },
    }),
  });
  assert.equal(rejected.status, 1);
  assert.doesNotMatch(rejected.stderr, /success/);
});

test('a PR head advance after hosted acceptance invalidates that acceptance', () => {
  assert.throws(
    () =>
      acceptStagingCandidate({
        ready: ready(),
        currentPullRequestHeadSha: nextSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        acceptance: {
          candidateSha,
          deploymentRunId: '36474707377',
          stagingOrigin: origin,
          humanMfa: 'user-completed',
          checks: {
            authAal2: 'passed',
            safeRead: 'passed',
            safeWrite: 'passed',
            ui: 'passed',
            migrations: 'passed',
            edgeFunctions: 'passed',
            releaseVersion: 'passed',
            releaseVersion: 'passed',
          },
          correlationIds: [],
          acceptedAt: '2026-09-29T10:00:00.000Z',
        },
      }),
    /pr_head_advanced/,
  );
});

test('squash promotion requires exact merged PR provenance and the accepted candidate tree', () => {
  const result = promotion();
  assert.equal(result.state, 'PRODUCTION_PROMOTION_READY');
  assert.equal(result.candidateSha, candidateSha);
  assert.equal(result.candidateTreeSha, candidateTreeSha);
  assert.equal(result.pullRequestNumber, 152);
  assert.equal(result.mergeCommitSha, mergeCommitSha);
  assert.notEqual(result.mergeCommitSha, result.candidateSha);

  assert.throws(() => promotion({ requestedSha: candidateSha }), /requested_sha_mismatch/);
  assert.throws(() => promotion({ associatedPullRequests: [] }), /merge_pr_missing/);
  assert.throws(
    () =>
      promotion({
        associatedPullRequests: [
          ...promotionInput().associatedPullRequests,
          ...promotionInput().associatedPullRequests,
        ],
      }),
    /merge_pr_ambiguous/,
  );
  assert.throws(
    () =>
      promotion({
        associatedPullRequests: [{ ...promotionInput().associatedPullRequests[0], mergedAt: null }],
      }),
    /merge_pr_not_merged/,
  );
  assert.throws(
    () =>
      promotion({
        associatedPullRequests: [{ ...promotionInput().associatedPullRequests[0], number: 153 }],
      }),
    /merge_pr_number_mismatch/,
  );
  assert.throws(
    () =>
      promotion({
        associatedPullRequests: [
          { ...promotionInput().associatedPullRequests[0], headSha: nextSha },
        ],
      }),
    /merge_pr_head_sha_mismatch/,
  );
  assert.throws(
    () =>
      promotion({
        associatedPullRequests: [
          { ...promotionInput().associatedPullRequests[0], mergeCommitSha: nextSha },
        ],
      }),
    /merge_commit_sha_mismatch/,
  );
  assert.throws(
    () =>
      promotion({
        associatedPullRequests: [
          { ...promotionInput().associatedPullRequests[0], baseBranch: 'release' },
        ],
      }),
    /merge_pr_base_mismatch/,
  );
  assert.throws(
    () =>
      promotion({
        associatedPullRequests: [
          { ...promotionInput().associatedPullRequests[0], headRepositoryFullName: 'someone/else' },
        ],
      }),
    /merge_pr_repository_mismatch/,
  );
  assert.throws(() => promotion({ mergeCommitTreeSha: nextSha }), /merge_tree_sha_mismatch/);
});

test('missing, malformed, or secret-bearing acceptance records fail closed', () => {
  assert.throws(() =>
    authorizeProductionPromotion(promotionInput({ acceptance: {} as StagingAcceptanceEvidence })),
  );
  assert.throws(() => accepted({ correlationIds: ['ghp_secret-token'] as unknown as string[] }));
  assert.throws(() =>
    accepted({ password: 'never-serialize' } as Partial<StagingAcceptanceEvidence>),
  );
});

test('deployment, acceptance, and promotion failures produce stable actionable diagnostics', () => {
  assert.throws(
    () =>
      createStagingReadyEvidence({
        candidateSha,
        pullRequestHeadSha: candidateSha,
        candidateTreeSha,
        pullRequestTreeSha: candidateTreeSha,
        prNumber: 152,
        localQa: 'passed',
        ci: 'passed',
        deployment: deployment({ edgeFunctions: 'failed' } as unknown as StagingDeploymentEvidence),
      }),
    /RELEASE_GATE_FAIL stage=staging\.ready candidate_sha=a{40} code=invalid_evidence expected=valid staging deployment evidence actual=edgeFunctions:invalid_value/,
  );
});

test('staging lock has one owner and releases after failed, cancelled, or successful runs', () => {
  const slot = acquireStagingSlot({ owner: 'run-1', candidateSha });
  assert.throws(
    () => acquireStagingSlot({ owner: 'run-2', candidateSha: nextSha, current: slot }),
    /staging_slot_busy/,
  );
  for (const outcome of ['failed', 'cancelled', 'passed'] as const) {
    assert.equal(releaseStagingSlot({ slot, owner: 'run-1', outcome }), null);
  }
  assert.throws(
    () => releaseStagingSlot({ slot, owner: 'run-2', outcome: 'cancelled' }),
    /staging_slot_owner_mismatch/,
  );
});

test('production smoke failure is action-required and cannot report acceptance', () => {
  const promotionEvidence = promotion();
  const evidence = recordProductionSmoke({
    deployedSha: mergeCommitSha,
    promotion: promotionEvidence,
    probes: [
      { name: 'workerVersion', result: 'passed', observedReleaseSha: mergeCommitSha },
      { name: 'loginShell', result: 'passed' },
      { name: 'authBoundary', result: 'failed', diagnosticCode: 'auth_boundary_unexpected' },
      { name: 'safeFunction', result: 'passed' },
    ],
  });
  assert.equal(evidence.state, 'ACTION_REQUIRED');
  assert.deepEqual(evidence.failures, ['auth_boundary_failed']);
  assert.throws(
    () =>
      recordProductionSmoke({
        deployedSha: mergeCommitSha,
        promotion: promotionEvidence,
        probes: [],
      }),
    /production_probe_missing/,
  );
  assert.throws(
    () =>
      recordProductionSmoke({
        deployedSha: mergeCommitSha,
        promotion: promotionEvidence,
        probes: [
          { name: 'workerVersion', result: 'passed', observedReleaseSha: mergeCommitSha },
          { name: 'loginShell', result: 'passed' },
          { name: 'authBoundary', result: 'passed' },
        ],
      }),
    /production_probe_missing/,
  );
  assert.throws(
    () =>
      recordProductionSmoke({
        deployedSha: mergeCommitSha,
        promotion: promotionEvidence,
        probes: [
          { name: 'workerVersion', result: 'passed', observedReleaseSha: mergeCommitSha },
          { name: 'workerVersion', result: 'passed', observedReleaseSha: mergeCommitSha },
          { name: 'loginShell', result: 'passed' },
          { name: 'authBoundary', result: 'passed' },
          { name: 'safeFunction', result: 'passed' },
        ],
      }),
    /production_probe_duplicate/,
  );
  assert.throws(
    () => recordProductionSmoke({ deployedSha: nextSha, promotion: promotionEvidence, probes: [] }),
    /deployed_sha_mismatch/,
  );
  assert.throws(
    () =>
      recordProductionSmoke({
        deployedSha: mergeCommitSha,
        promotion: promotionEvidence,
        probes: [
          { name: 'workerVersion', result: 'passed' },
          { name: 'loginShell', result: 'passed' },
          { name: 'authBoundary', result: 'passed' },
          { name: 'safeFunction', result: 'passed' },
        ],
      }),
    /production_release_version_mismatch/,
  );
  assert.throws(
    () =>
      recordProductionSmoke({
        deployedSha: mergeCommitSha,
        promotion: promotionEvidence,
        probes: [
          { name: 'workerVersion', result: 'passed', observedReleaseSha: candidateSha },
          { name: 'loginShell', result: 'passed' },
          { name: 'authBoundary', result: 'passed' },
          { name: 'safeFunction', result: 'passed' },
        ],
      }),
    /production_release_version_mismatch/,
  );
});

test('production smoke accepts only bounded, passing capability probes', () => {
  const promotionEvidence = promotion();
  const evidence = recordProductionSmoke({
    deployedSha: mergeCommitSha,
    promotion: promotionEvidence,
    probes: [
      { name: 'workerVersion', result: 'passed', observedReleaseSha: mergeCommitSha },
      { name: 'loginShell', result: 'passed' },
      { name: 'authBoundary', result: 'passed' },
      { name: 'safeFunction', result: 'passed' },
    ],
  });
  assert.equal(evidence.state, 'PRODUCTION_ACCEPTED');
  assert.deepEqual(evidence.failures, []);
});

function runCli(command: string, input: unknown) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'infrastructure/scripts/release-gate.ts', command],
    { encoding: 'utf8', input: JSON.stringify(input) },
  );
}

test('JSON CLI emits machine-readable staging readiness and accepted evidence', () => {
  const readyInput = {
    candidateSha,
    pullRequestHeadSha: candidateSha,
    candidateTreeSha,
    pullRequestTreeSha: candidateTreeSha,
    prNumber: 152,
    localQa: 'passed',
    ci: 'passed',
    deployment: deployment(),
  };
  const readyResult = runCli('staging-ready', readyInput);
  assert.equal(readyResult.status, 0);
  const readyEvidence = JSON.parse(readyResult.stdout) as ReturnType<typeof ready>;
  assert.equal(readyEvidence.state, 'STAGING_READY_FOR_ACCEPTANCE');
  assert.equal(readyEvidence.candidateSha, candidateSha);

  const acceptance = accepted();
  const acceptanceResult = runCli('staging-accept', {
    ready: readyEvidence,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    acceptance: stagingAcceptanceInput(),
  });
  assert.equal(acceptanceResult.status, 0);
  const acceptanceEvidence = JSON.parse(acceptanceResult.stdout) as StagingAcceptanceEvidence;
  assert.equal(acceptanceEvidence.state, 'STAGING_ACCEPTED');
  assert.equal(acceptanceEvidence.candidateSha, candidateSha);
  assert.equal(acceptanceEvidence.candidateTreeSha, candidateTreeSha);
  assert.equal(acceptanceEvidence.pullRequestNumber, 152);
});

test('JSON CLI rejects an unaccepted production SHA with a safe diagnostic', () => {
  const result = runCli('production-promote', promotionInput({ requestedSha: nextSha }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"code":"requested_sha_mismatch"/);
  assert.doesNotMatch(result.stderr, /password|token|secret/i);
});

test('JSON CLI marks a failed production capability probe as action-required', () => {
  const promotionEvidence = promotion();
  const result = runCli('production-smoke', {
    deployedSha: mergeCommitSha,
    promotion: promotionEvidence,
    probes: [
      { name: 'workerVersion', result: 'passed', observedReleaseSha: mergeCommitSha },
      { name: 'loginShell', result: 'failed', diagnosticCode: 'login_shell_failed' },
      { name: 'authBoundary', result: 'passed' },
      { name: 'safeFunction', result: 'passed' },
    ],
  });
  assert.equal(result.status, 1);
  const evidence = JSON.parse(result.stdout) as ReturnType<typeof recordProductionSmoke>;
  assert.equal(evidence.state, 'ACTION_REQUIRED');
  assert.deepEqual(evidence.failures, ['login_shell_failed']);
});

test('JSON CLI does not echo malformed input into diagnostics', () => {
  const secretMarker = 'do-not-echo-this-secret';
  const result = runCli('staging-ready', { candidateSha: secretMarker, password: secretMarker });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"code":"invalid_evidence"/);
  assert.doesNotMatch(result.stderr, new RegExp(secretMarker));
});

test('hosted acceptance status workflow binds success to current PR and validated deployment evidence', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/staging-acceptance-status.yml', import.meta.url),
    'utf8',
  );
  const candidateWorkflow = await readFile(
    new URL('../../.github/workflows/staging-candidate.yml', import.meta.url),
    'utf8',
  );
  const deployWorkflow = await readFile(
    new URL('../../.github/workflows/deploy-staging.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /candidate_sha:/);
  assert.match(workflow, /deployment_run_id:/);
  assert.match(workflow, /acceptance_evidence:/);
  assert.match(workflow, /outcome:[\s\S]*options: \[accepted, failed\]/);
  assert.match(workflow, /head\.sha == \$sha/);
  assert.match(workflow, /repos\/\$GH_REPOSITORY\/pulls\/\$pr_number/);
  assert.match(workflow, /repos\/\$GH_REPOSITORY\/git\/commits\/\$CANDIDATE_SHA/);
  assert.match(
    workflow,
    /\.head_branch == "main" and[\s\S]*\.event == "workflow_run" and \.status == "completed" and \.conclusion == "success"/,
  );
  assert.doesNotMatch(workflow, /\.head_sha == \$sha/);
  assert.match(workflow, /artifact_count/);
  assert.match(workflow, /expired == false/);
  assert.match(
    workflow,
    /actions\/download-artifact@v4[\s\S]*run-id: \$\{\{ inputs\.deployment_run_id \}\}/,
  );
  assert.match(workflow, /deployment\.candidateSha !== sha/);
  assert.match(workflow, /deployment\.candidateTreeSha !== candidateTreeSha/);
  assert.match(workflow, /deployment\.pullRequestNumber/);
  assert.match(workflow, /submitted\.candidateTreeSha !== candidateTreeSha/);
  assert.match(workflow, /submitted\.pullRequestNumber !== currentPr\.number/);
  assert.match(workflow, /currentPullRequestTreeSha: candidateTreeSha/);
  assert.match(workflow, /currentPullRequestNumber: currentPr\.number/);
  assert.match(workflow, /deployment\.runId !== runId/);
  assert.match(workflow, /deployment\.runAttempt/);
  assert.match(workflow, /release-gate\.ts staging-status/);
  assert.ok(
    workflow.indexOf('Upload validated hosted acceptance evidence') <
      workflow.indexOf('Publish accepted commit status'),
  );
  assert.match(workflow, /state:"failure"/);
  assert.doesNotMatch(workflow, /deploy-production|production-promote/);

  for (const requiredWorkflow of [
    'CI',
    'Database',
    'Edge functions',
    'E2E',
    'Security',
    'Performance',
    'Windows worker foundation',
    'CodeQL Advanced',
    'Dependency review',
  ])
    assert.ok(
      candidateWorkflow.includes(`- ${requiredWorkflow}`),
      `missing required check ${requiredWorkflow}`,
    );
  assert.match(candidateWorkflow, /event\.workflow_run\.event == 'pull_request'/);
  assert.match(candidateWorkflow, /head\.sha == \$sha/);
  assert.match(candidateWorkflow, /latest-required-workflow-runs/);
  assert.doesNotMatch(candidateWorkflow, /sort_by\(\.name, \.run_attempt\)/);
  assert.match(candidateWorkflow, /candidate_sha: \$\{\{ needs\.gate\.outputs\.candidate_sha \}\}/);
  assert.match(candidateWorkflow, /statuses\/\$CANDIDATE_SHA/);
  assert.ok(
    candidateWorkflow.includes(
      '$prior_description" != "Staging acceptance failed: staging_slot_busy."',
    ),
    'automatic candidate gate must retry lease-busy candidates after the slot clears',
  );
  assert.match(deployWorkflow, /group: staging-deployment[\s\S]*cancel-in-progress: false/);
  assert.match(
    deployWorkflow,
    /workflow_dispatch:[\s\S]*mode:[\s\S]*options: \[candidate, acceptance\]/,
  );
  assert.match(
    deployWorkflow,
    /candidate_sha:[\s\S]*deployment_run_id:[\s\S]*acceptance_outcome:[\s\S]*acceptance_evidence:/,
  );
  assert.match(deployWorkflow, /DISPATCH_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /DISPATCH_REF: \$\{\{ github\.ref \}\}/);
  const leaseCheck = deployWorkflow.indexOf('name: Check shared staging acceptance lease');
  const deployPending = deployWorkflow.indexOf('name: Set candidate status while staging deploys');
  const acceptancePending = deployWorkflow.indexOf(
    'Staging is deployed; waiting for hosted acceptance.',
  );
  const manualRequiredGate = deployWorkflow.indexOf(
    'name: Validate manual candidate required workflows',
  );
  const environmentValidation = deployWorkflow.indexOf(
    'name: Validate staging environment identity',
  );
  assert.ok(
    manualRequiredGate >= 0 && manualRequiredGate < environmentValidation,
    'manual candidate dispatch must validate CI before environment/deploy steps',
  );
  assert.match(
    deployWorkflow,
    /if: github\.event_name == 'workflow_dispatch' && inputs\.mode == 'candidate'[\s\S]*latest-required-workflow-runs[\s\S]*candidate-readiness/,
  );
  assert.ok(
    leaseCheck >= 0 && leaseCheck < deployPending,
    'lease guard must run before staging mutation',
  );
  assert.ok(
    deployWorkflow.indexOf('name: Revalidate exact candidate PR head') < leaseCheck,
    'lease guard must run after resolving the current candidate PR',
  );
  assert.ok(
    deployWorkflow.indexOf('name: Smoke test staging Worker') < acceptancePending,
    'acceptance lease begins only after staging deploy/smoke succeeds',
  );
  assert.match(deployWorkflow, /staging-slot-check < staging-slot-input\.json/);
  assert.match(deployWorkflow, /commits\/\$\{headSha\}\/status/);
  assert.match(deployWorkflow, /headSha === candidateSha\) continue/);
  assert.match(deployWorkflow, /staging_slot_busy/);
  assert.match(candidateWorkflow, /Staging acceptance failed: staging_slot_busy\./);
  assert.match(
    deployWorkflow,
    /Manual candidate deploy must use the current non-main PR branch ref/,
  );
  assert.match(deployWorkflow, /accept_candidate:[\s\S]*inputs\.mode == 'acceptance'/);
  assert.match(
    deployWorkflow,
    /name: Publish accepted commit status[\s\S]*statuses\/\$CANDIDATE_SHA/,
  );
  assert.match(deployWorkflow, /current-pr-on-failure\.json/);
  assert.match(deployWorkflow, /current-pr\.json[\s\S]*acceptance_malformed/);
  assert.match(deployWorkflow, /workflow_run|workflow_dispatch/);
  assert.doesNotMatch(deployWorkflow, /pull_request_target/);
  assert.match(deployWorkflow, /ref: \$\{\{ inputs\.candidate_sha \|\| github\.sha \}\}/);
  assert.match(deployWorkflow, /RELEASE_SHA: \$\{\{ inputs\.candidate_sha \|\| github\.sha \}\}/);
  assert.match(deployWorkflow, /--var "RELEASE_SHA:\$\{RELEASE_SHA\}"/);
  const hostedSuite = await readFile(
    new URL('../../tests/e2e-live/staging.spec.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    hostedSuite,
    /deployed Worker release matches the exact hosted acceptance candidate[\s\S]*page\.request\.get\(new URL\('\/api\/release',[\s\S]*releaseSha: candidateSha\?\.toLowerCase\(\)/,
  );
  assert.match(deployWorkflow, /checked_out_sha="\$\(git rev-parse HEAD\)"/);
  assert.match(deployWorkflow, /git rev-parse --verify 'HEAD\^\{tree\}'/);
  assert.match(deployWorkflow, /pull_request_number=\$pr_number/);
  assert.match(deployWorkflow, /candidateTreeSha:process\.env\.CANDIDATE_TREE_SHA/);
  assert.match(deployWorkflow, /pullRequestNumber:Number\(process\.env\.PULL_REQUEST_NUMBER\)/);
  assert.doesNotMatch(deployWorkflow, /candidateTreeSha:"[a-f0-9]{40}"/);
  assert.doesNotMatch(deployWorkflow, /pullRequestNumber:\d+/);
  assert.match(deployWorkflow, /candidate-staging-deployment-\$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(deployWorkflow, /state:"pending"[\s\S]*waiting for hosted acceptance/);
  assert.match(deployWorkflow, /failure_code="stage_deployment_failed"/);
  assert.match(deployWorkflow, /failure_code="staging_slot_busy"/);
});

test('production deploy requires status-bound staging acceptance and squash PR provenance before mutation', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/deploy-production.yml', import.meta.url),
    'utf8',
  );
  assert.match(
    workflow,
    /workflow_run:[\s\S]*workflows: \[Deploy staging\][\s\S]*types: \[completed\]/,
  );
  assert.match(
    workflow,
    /if: github\.ref == 'refs\/heads\/main'[\s\S]*workflow_run\.conclusion == 'success'[\s\S]*workflow_run\.head_branch == 'main'/,
  );
  assert.match(
    workflow,
    /\.event == "push" and \.status == "completed" and \.conclusion == "success"/,
  );
  assert.match(workflow, /commits\/\$sha\/pulls/);
  assert.match(workflow, /pr_count.*exactly one associated merged same-repository PR/);
  assert.match(workflow, /merge_commit_sha == \$sha/);
  assert.match(workflow, /commits\/\$candidate_sha\/statuses\?per_page=100/);
  assert.match(workflow, /status_url.*status target URL/);
  assert.match(workflow, /acceptance_run_id=.*status_url/);
  assert.match(
    workflow,
    /\.event == "workflow_dispatch"[\s\S]*\.head_branch == \$branch and \.head_sha == \$sha[\s\S]*\.conclusion == "success"/,
  );
  assert.match(workflow, /acceptance_artifact_count/);
  assert.match(workflow, /candidate-deployment-artifacts\.json/);
  assert.match(
    workflow,
    /String\(deployment\.runAttempt\) !== String\(candidateRun\.run_attempt\)/,
  );
  assert.match(workflow, /production-promote < production-promotion-input\.json/);
  const promotionGate = workflow.indexOf(
    'Validate merged PR provenance and accepted candidate tree',
  );
  assert.ok(promotionGate >= 0, 'missing the release provenance gate');
  for (const mutation of [
    'name: Deploy Worker',
    'name: Configure production finance archive gateway secret',
    'name: Apply production migrations',
    'name: Deploy production Edge Functions',
  ]) {
    assert.ok(
      promotionGate < workflow.indexOf(mutation),
      `${mutation} must follow the provenance gate`,
    );
  }
  assert.match(workflow, /--var "RELEASE_SHA:\$\{RELEASE_SHA\}"/);
  const smoke = workflow.indexOf('name: Run bounded production capability smoke');
  const smokeUpload = workflow.indexOf('name: Upload production capability smoke evidence');
  assert.ok(smoke >= 0, 'missing bounded production capability smoke');
  assert.ok(smokeUpload > smoke, 'smoke evidence must be uploaded after probes run');
  for (const completedStep of [
    'name: Deploy Worker',
    'name: Configure production finance archive gateway secret',
    'name: Apply production migrations',
    'name: Deploy production Edge Functions',
    'name: Check staging to production drift',
  ]) {
    assert.ok(
      workflow.indexOf(completedStep) < smoke,
      `${completedStep} must finish before production smoke`,
    );
  }
  assert.match(workflow.slice(smoke, smokeUpload), /PRODUCTION_ORIGIN:/);
  assert.match(
    workflow.slice(smoke, smokeUpload),
    /PRODUCTION_SMOKE_OUTPUT_PATH: production-smoke-evidence\.json/,
  );
  assert.match(workflow.slice(smoke, smokeUpload), /production-smoke\.ts/);
  assert.match(
    workflow.slice(smokeUpload),
    /if: always\(\) && hashFiles\('production-smoke-evidence\.json'\) != ''/,
  );
  assert.match(workflow.slice(smokeUpload), /path: production-smoke-evidence\.json/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'[\s\S]*inputs\.staging_run_id/);
});
