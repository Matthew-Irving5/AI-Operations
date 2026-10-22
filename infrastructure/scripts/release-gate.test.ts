import { combineMobileActionResults } from './mobile-action-staging-result.js';
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
  Ai16PromptGovernanceProofSchema,
  acceptStagingCandidate,
  acquireStagingSlot,
  authorizeProductionPromotion,
  createStagingReadyEvidence,
  createCandidateReadinessEvidence,
  createStagingAcceptanceStatus,
  createHostedStagingSuiteEvidence,
  inspectStagingAcceptanceLease,
  recordProductionSmoke,
  releaseStagingSlot,
  selectHostedAcceptanceProfile,
  selectLatestRequiredWorkflowRuns,
  type StagingAcceptanceEvidence,
  type StagingDeploymentEvidence,
} from './release-gate.js';
import { ProcurementStagingAcceptanceChecksSchema } from './procurement-live-acceptance.js';

const candidateSha = 'a'.repeat(40);
const nextSha = 'b'.repeat(40);
const candidateTreeSha = 'c'.repeat(40);
const mergeCommitSha = 'd'.repeat(40);
const repositoryFullName = 'Matthew-Irving5/AI-Operations';
const origin = 'https://ai-operations-staging.ai-operations.workers.dev';
const ai15WorkflowRuns = [
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

const ai16PromptGovernanceProof = {
  templateId: '00000000-0000-4000-8000-000000000001',
  previousActiveVersion: 7,
  previousPromptVersionId: '00000000-0000-4000-8000-000000000002',
  previousModelRoute: 'gpt-5.6-terra',
  candidateId: '00000000-0000-4000-8000-000000000003',
  candidateVersion: 8,
  candidateModelRoute: 'gpt-5.6-luna',
  schemaVersion: 2,
  toolPolicyVersion: 3,
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
  promotion: { previousVersion: 7, activeVersion: 8, replayed: false },
  candidateRun: {
    runId: 'candidate-run-1',
    correlationId: 'candidate-trace-1',
    reportId: 'candidate-report-1',
    aiCallId: '00000000-0000-4000-8000-000000000005',
    promptVersionId: '00000000-0000-4000-8000-000000000003',
    model: 'gpt-5.6-luna',
    modelRoute: 'gpt-5.6-luna',
    schemaVersion: 2,
    toolPolicyVersion: 3,
    actualCostUsd: 0.02,
    hardCapUsd: 0.05,
    searchCalls: 0,
  },
  rollbackIdempotencyKey: '00000000-0000-4000-8000-000000000006',
  rollback: { previousVersion: 8, activeVersion: 7, replayed: false },
  postRollbackRun: {
    runId: 'rollback-run-1',
    correlationId: 'rollback-trace-1',
    reportId: 'rollback-report-1',
    aiCallId: '00000000-0000-4000-8000-000000000007',
    promptVersionId: '00000000-0000-4000-8000-000000000002',
    model: 'gpt-5.6-terra',
    modelRoute: 'gpt-5.6-terra',
    schemaVersion: 2,
    toolPolicyVersion: 3,
    actualCostUsd: 0.03,
    hardCapUsd: 0.15,
    searchCalls: 0,
  },
  previousRunHistoryUnchanged: true,
  totalActualCostUsd: 0.05,
} as const;

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
    acceptanceProfile: 'auth-browser',
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
    acceptanceProfile: 'auth-browser',
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
    freshMfaAction: {
      staleDenied: 'passed',
      staleAttemptUsedMfaGate: false,
      freshReauthAccepted: 'passed',
    },
    correlationIds: ['run-uuid-1', 'trace-uuid-1'],
    workflowRuns: ai15WorkflowRuns,
    acceptedAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

function costRuntimeSuiteEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    state: 'COST_RUNTIME_STAGING_ACCEPTED',
    acceptanceProfile: 'cost-runtime',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'not-required',
    checks: { localCostMatrix: 'passed', oneBoundedProviderCall: 'passed' },
    costRuntimeProof: {
      localProofSha: candidateSha,
      localMatrix: {
        estimateReservationReconciliation: 'passed',
        hardCapConcurrency: 'passed',
        cancellationFailureRelease: 'passed',
        staleUnknownPricing: 'passed',
        forecastInputsConfidence: 'passed',
        providerDiscrepancy: 'passed',
        nestedManagerAttribution: 'passed',
      },
      provider: 'openai-responses',
      providerCallCount: 1,
      searchCalls: 0,
      model: 'gpt-5.6-luna',
      runId: 'ai20-run-1',
      responseId: 'resp-ai20-1',
      correlationId: 'ai20-trace-1',
      reservationId: 'ai20-reservation-1',
      pricingRecordId: 'openai-luna-effective-1',
      estimatedUsd: '0.01000000',
      reservedUsd: '0.02000000',
      hardCapUsd: '0.05000000',
      calculatedActualUsd: '0.01200000',
      reservationState: 'settled',
      providerUsage: { inputTokens: 1000, cachedInputTokens: 100, outputTokens: 300 },
      usageReconciliation: 'passed',
      costReconciliation: 'passed',
      traceReconciliation: 'passed',
    },
    correlationIds: ['ai20-trace-1'],
    acceptedAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

function procurementSuiteEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    state: 'PROCUREMENT_STAGING_ACCEPTED',
    acceptanceProfile: 'procurement',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'user-completed',
    correlationIds: [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ],
    acceptedAt: '2026-09-29T10:00:00.000Z',
    checks: {
      releaseVersion: 'passed',
      requirementsPersistedBeforeRanking: 'passed',
      eligibilityAndUnknownHandling: 'passed',
      allInTotalsAndDatedConflictingSources: 'passed',
      revisionPreservesPriorProvenance: 'passed',
      persistedRationale: 'passed',
      purchasePaymentDenied: 'passed',
      chromium: 'passed',
    },
    runs: [
      {
        researchRunId: '00000000-0000-4000-8000-000000000101',
        workflowRunId: '00000000-0000-4000-8000-000000000201',
        correlationId: '00000000-0000-4000-8000-000000000001',
        status: 'complete',
        hardCapMicroUsd: 250_000,
        actualCostMicroUsd: 100_000,
        searchLimit: 3,
        searchesUsed: 2,
        aiCallCount: 3,
      },
      {
        researchRunId: '00000000-0000-4000-8000-000000000102',
        workflowRunId: '00000000-0000-4000-8000-000000000202',
        correlationId: '00000000-0000-4000-8000-000000000002',
        status: 'complete',
        hardCapMicroUsd: 250_000,
        actualCostMicroUsd: 150_000,
        searchLimit: 3,
        searchesUsed: 3,
        aiCallCount: 4,
      },
    ],
    revision: {
      originalResearchRunId: '00000000-0000-4000-8000-000000000101',
      revisedResearchRunId: '00000000-0000-4000-8000-000000000102',
      linkedToOriginal: true,
      priorDecisionPreserved: true,
      requirementsChanged: true,
      priorDecisionSha256: 'a'.repeat(64),
    },
    comparison: {
      requirements: [{ id: 'battery-life', kind: 'hard' }],
      ineligibleCandidateId: 'candidate-ineligible',
      exclusionReasonCount: 2,
      exclusionReasonsSha256: 'b'.repeat(64),
      unknownCandidateId: 'candidate-unknown',
      unknownRequirementId: 'delivery-date',
      sourceA: {
        candidateId: 'candidate-a',
        sourceHost: 'shop-a.example',
        observedAt: '2026-09-28T10:00:00.000Z',
        totalMinor: 12_499,
      },
      sourceB: {
        candidateId: 'candidate-b',
        sourceHost: 'shop-b.example',
        observedAt: '2026-09-29T10:00:00.000Z',
        totalMinor: 12_599,
      },
      currency: 'GBP',
      allIn: {
        itemMinor: 9_000,
        deliveryMinor: 1_000,
        accessoriesMinor: 500,
        mandatoryFeesMinor: 200,
        totalMinor: 10_700,
      },
      rationaleSha256: 'c'.repeat(64),
    },
    actionDenial: { status: 400, code: 'invalid_launch_request', noWorkflowCreated: true },
    ...overrides,
  };
}

function careerSuiteEvidence(overrides: Record<string, unknown> = {}) {
  const correlationIds = [
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000013',
  ];
  const checks = {
    authenticatedCareerSync: 'passed',
    personalGithubScope: 'passed',
    demonstratedSkillCitation: 'passed',
    brightSgDenied: 'passed',
    otherOwnerDenied: 'passed',
    ownerDenialAuditNoProviderRequest: 'passed',
    chromium: 'passed',
  } as const;
  return {
    schemaVersion: 1,
    state: 'CAREER_STAGING_ACCEPTED',
    acceptanceProfile: 'career',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'user-completed',
    correlationIds,
    checks,
    proof: {
      githubOwner: 'Matthew-Irving5',
      sync: {
        httpStatus: 200,
        repositories: 2,
        evidenceRecords: 1,
        requestId: correlationIds[0],
        retrievedAt: '2026-10-22T10:00:00.000Z',
      },
      skillCitation: {
        skillCount: 1,
        evidenceStrength: 'authored-source-change',
        mergedDate: '2026-10-21',
        retrievedDate: '2026-10-22',
        mergedPullRequestUrlSha256: 'a'.repeat(64),
        sourceFileBlobUrlSha256: 'b'.repeat(64),
        sourceFileExtension: 'ts',
        addedLines: 14,
      },
      ownerDenials: [
        {
          ownerClass: 'brightsg',
          httpStatus: 403,
          code: 'github_owner_hard_denied',
          requestId: correlationIds[1],
          auditAction: 'github_career_sync_owner_denied',
          auditTargetType: 'github_owner',
          auditTargetId: 'hard_denied',
          auditResult: 'denied',
          providerRequestMade: false,
        },
        {
          ownerClass: 'other',
          httpStatus: 403,
          code: 'github_owner_not_allowlisted',
          requestId: correlationIds[2],
          auditAction: 'github_career_sync_owner_denied',
          auditTargetType: 'github_owner',
          auditTargetId: 'not_allowlisted',
          auditResult: 'denied',
          providerRequestMade: false,
        },
      ],
    },
    acceptedAt: '2026-10-22T10:00:00.000Z',
    ...overrides,
  };
}

function mobileShortcutEvidence(overrides: Record<string, unknown> = {}) {
  const correlationIds = [
    'mobile-pair-1',
    'mobile-valid-1',
    'mobile-replay-1',
    'mobile-update-1',
    'mobile-revoke-1',
    'mobile-schema-1',
    'mobile-malformed-1',
    'mobile-oversized-1',
    'mobile-wrong-token-1',
    'mobile-retry-1',
  ];
  return {
    schemaVersion: 1,
    state: 'MOBILE_SHORTCUTS_STAGING_ACCEPTED',
    acceptanceProfile: 'mobile-shortcuts',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'user-completed',
    checks: {
      supportedDevicePairing: 'passed',
      validSnapshotProvenance: 'passed',
      replayNoDuplicateCanonicalRows: 'passed',
      updatedSnapshotOnlyChanges: 'passed',
      revokedDeviceRejectedWithoutWrites: 'passed',
      invalidInputsRejected: 'passed',
      interruptedIngestRecovery: 'passed',
      freshnessTransitions: 'passed',
    },
    proof: {
      deviceId: 'mobile-device-1',
      shortcutRun: 'operator-confirmed',
      pairingMfa: 'user-completed',
      revocationMfa: 'user-completed',
      pairingRequestId: correlationIds[0],
      validRequestId: correlationIds[1],
      replayRequestId: correlationIds[2],
      updatedRequestId: correlationIds[3],
      revokedRequestId: correlationIds[4],
      wrongSchemaRequestId: correlationIds[5],
      malformedRequestId: correlationIds[6],
      oversizedRequestId: correlationIds[7],
      wrongTokenRequestId: correlationIds[8],
      retryRequestId: correlationIds[9],
      rawSnapshotId: 'mobile-raw-snapshot-1',
      canonicalRecordId: 'mobile-canonical-record-1',
      provenanceRecordId: 'mobile-provenance-1',
      replayCreatedCanonicalRows: 0,
      updatedChangedRecordCount: 1,
      updatedUnchangedRecordCount: 1,
      revokedSubmissionStatus: 401,
      revokedSubmissionCreatedRows: 0,
      invalidStatuses: { wrongSchema: 400, malformed: 400, oversized: 413, wrongToken: 401 },
      retryCreatedCanonicalRows: 1,
      freshnessStaleObserved: true,
      freshnessRecoveredAt: '2026-09-29T10:00:00.000Z',
    },
    correlationIds,
    acceptedAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

function mobileActionSuiteEvidence(overrides: Record<string, unknown> = {}) {
  const mobileEvidence = mobileShortcutEvidence();
  const actionCorrelationIds = ['ai44-action-correlation-1'];
  const actionEvidence = {
    schemaVersion: 1,
    state: 'AI44_ACTION_STAGING_ACCEPTED',
    acceptanceProfile: 'auth-browser',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'user-completed',
    checks: {
      staleSessionDenied: 'passed',
      freshMfaActionAccepted: 'passed',
      oneEffectCommitted: 'passed',
      oneTerminalReceiptPersisted: 'passed',
    },
    freshMfaAction: {
      staleDenied: 'passed',
      staleAttemptUsedMfaGate: false,
      freshReauthAccepted: 'passed',
    },
    actionId: 'ai44-action-1',
    executionId: 'ai44-execution-1',
    receiptId: 'ai44-receipt-1',
    effectCount: 1,
    terminalReceiptCount: 1,
    correlationIds: actionCorrelationIds,
    acceptedAt: '2026-09-29T10:00:00.000Z',
  };
  return {
    schemaVersion: 1,
    state: 'MOBILE_ACTION_STAGING_ACCEPTED',
    acceptanceProfile: 'mobile-shortcuts-action',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'user-completed',
    checks: { mobileShortcutJourney: 'passed', canonicalActionJourney: 'passed' },
    mobileEvidence,
    actionEvidence,
    correlationIds: [...mobileEvidence.correlationIds, ...actionCorrelationIds],
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
  acceptanceProfile: 'auth-browser';
  humanMfa: 'user-completed';
  checks: StagingAcceptanceEvidence['checks'];
  freshMfaAction: NonNullable<StagingAcceptanceEvidence['freshMfaAction']>;
  correlationIds: string[];
  workflowRuns: NonNullable<StagingAcceptanceEvidence['workflowRuns']>;
  acceptedAt: string;
};

function stagingAcceptanceInput(
  overrides: Partial<RawStagingAcceptance> = {},
): RawStagingAcceptance {
  return {
    candidateSha,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    acceptanceProfile: 'auth-browser',
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
    freshMfaAction: {
      staleDenied: 'passed',
      staleAttemptUsedMfaGate: false,
      freshReauthAccepted: 'passed',
    },
    correlationIds: ['run-1', 'trace-1'],
    workflowRuns: ai15WorkflowRuns,
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

const candidateWorkflowNames = ['CI', 'Security', 'CodeQL Advanced', 'Dependency review'] as const;
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
    { checks: candidateInput().checks.filter((check) => check.name !== 'CodeQL Advanced') },
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
  assert.equal(success.acceptance?.acceptanceProfile, 'auth-browser');
  const existingAuthBrowserSuite = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence(),
    hostedSuite: hostedSuiteEvidence({ workflowRuns: undefined }),
  });
  assert.equal(existingAuthBrowserSuite.status.state, 'success');
  assert.equal(existingAuthBrowserSuite.acceptance?.workflowRuns, undefined);
  assert.deepEqual(success.acceptance?.freshMfaAction, {
    staleDenied: 'passed',
    staleAttemptUsedMfaGate: false,
    freshReauthAccepted: 'passed',
  });
  assert.ok(success.acceptance && !Array.isArray(success.acceptance.checks));
  if (success.acceptance && !Array.isArray(success.acceptance.checks)) {
    assert.equal(success.acceptance.checks.migrations, 'passed');
  }
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

test('cost-runtime acceptance requires one reconciled Responses call and stays pending until submitted', () => {
  const success = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence({ acceptanceProfile: 'cost-runtime' }),
    hostedSuite: costRuntimeSuiteEvidence(),
  });
  assert.equal(success.status.state, 'success');
  assert.equal(success.acceptance?.acceptanceProfile, 'cost-runtime');
  assert.equal(success.acceptance?.humanMfa, 'not-required');
  assert.deepEqual(
    success.acceptance?.costRuntimeProof,
    costRuntimeSuiteEvidence().costRuntimeProof,
  );
  assert.deepEqual(success.acceptance?.checks, {
    localCostMatrix: 'passed',
    oneBoundedProviderCall: 'passed',
  });

  const pending = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    state: 'pending',
    phase: 'hosted_acceptance',
  });
  assert.equal(pending.status.state, 'pending');

  const proof = costRuntimeSuiteEvidence().costRuntimeProof;
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'cost-runtime' }),
        hostedSuite: {
          ...costRuntimeSuiteEvidence(),
          costRuntimeProof: { ...proof, providerCallCount: 2 },
        },
      }),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'cost-runtime' }),
        hostedSuite: {
          ...costRuntimeSuiteEvidence(),
          costRuntimeProof: { ...proof, calculatedActualUsd: '0.06000000' },
        },
      }),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'cost-runtime' }),
        hostedSuite: { ...costRuntimeSuiteEvidence(), costRuntimeProof: undefined },
      }),
    /invalid_evidence/,
  );
});

test('AI-39 Procurement evidence stays pending until its strict candidate-bound proof validates', () => {
  const hostedSuite = procurementSuiteEvidence();
  assert.deepEqual(
    ProcurementStagingAcceptanceChecksSchema.parse(hostedSuite.checks),
    hostedSuite.checks,
  );
  const success = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence({ acceptanceProfile: 'procurement' }),
    hostedSuite,
  });
  assert.equal(success.status.state, 'success');
  assert.equal(success.acceptance?.acceptanceProfile, 'procurement');
  assert.equal(success.acceptance?.humanMfa, 'user-completed');
  assert.deepEqual(success.acceptance?.checks, hostedSuite.checks);
  assert.deepEqual(success.acceptance?.procurementEvidence, hostedSuite);
  assert.equal(
    acceptStagingCandidate({
      ready: ready(),
      currentPullRequestHeadSha: candidateSha,
      currentPullRequestTreeSha: candidateTreeSha,
      currentPullRequestNumber: 152,
      acceptance: success.acceptance!,
    }).acceptanceProfile,
    'procurement',
  );

  assert.throws(
    () =>
      acceptStagingCandidate({
        ready: ready(),
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        acceptance: hostedSuite,
      }),
    /invalid_evidence/,
  );

  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'procurement' }),
        hostedSuite: { ...hostedSuite, candidateSha: nextSha },
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
        acceptance: {
          candidateSha,
          deploymentRunId: '36474707377',
          stagingOrigin: origin,
          acceptanceProfile: 'procurement',
          humanMfa: 'user-completed',
          checks: hostedSuite.checks,
          procurementEvidence: { ...hostedSuite, candidateTreeSha: nextSha },
          correlationIds: hostedSuite.correlationIds,
          acceptedAt: hostedSuite.acceptedAt,
        },
      }),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      acceptStagingCandidate({
        ready: ready(),
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        acceptance: {
          candidateSha,
          deploymentRunId: '36474707377',
          stagingOrigin: origin,
          acceptanceProfile: 'procurement',
          humanMfa: 'user-completed',
          checks: { ...hostedSuite.checks, chromium: 'failed' },
          procurementEvidence: hostedSuite,
          correlationIds: hostedSuite.correlationIds,
          acceptedAt: hostedSuite.acceptedAt,
        },
      }),
    /invalid_evidence/,
  );
});

test('AI-35 Career acceptance requires its strict candidate-bound provider evidence', () => {
  const hostedSuite = careerSuiteEvidence();
  const accepted = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence({ acceptanceProfile: 'career' }),
    hostedSuite,
  });
  assert.equal(accepted.status.state, 'success');
  assert.equal(accepted.acceptance?.acceptanceProfile, 'career');
  assert.equal(accepted.acceptance?.humanMfa, 'user-completed');
  assert.deepEqual(accepted.acceptance?.checks, hostedSuite.checks);
  assert.deepEqual(accepted.acceptance?.careerEvidence, hostedSuite);

  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'career' }),
        hostedSuite: {
          ...hostedSuite,
          proof: {
            ...hostedSuite.proof,
            sync: { ...hostedSuite.proof.sync, requestId: '00000000-0000-4000-8000-000000000099' },
          },
        },
      }),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'career' }),
        hostedSuite: { ...hostedSuite, candidateTreeSha: nextSha },
      }),
    /acceptance profile, proof, MFA evidence, and check shape must agree/,
  );
});

test('AI-28 mobile and AI-44 action acceptance require separate candidate-bound proofs', () => {
  const hostedSuite = mobileActionSuiteEvidence();
  const combined = combineMobileActionResults(
    hostedSuite.mobileEvidence,
    hostedSuite.actionEvidence,
  );
  assert.equal(combined.acceptanceProfile, 'mobile-shortcuts-action');
  assert.deepEqual(combined.correlationIds, hostedSuite.correlationIds);
  assert.throws(
    () =>
      combineMobileActionResults(hostedSuite.mobileEvidence, {
        ...hostedSuite.actionEvidence,
        candidateSha: nextSha,
      }),
    /invalid_evidence/,
  );
  const accepted = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence({ acceptanceProfile: 'mobile-shortcuts-action' }),
    hostedSuite,
  });
  assert.equal(accepted.status.state, 'success');
  assert.equal(accepted.acceptance?.acceptanceProfile, 'mobile-shortcuts-action');
  assert.equal(accepted.acceptance?.humanMfa, 'user-completed');
  assert.deepEqual(accepted.acceptance?.mobileActionEvidence, hostedSuite);

  for (const falseMobileProof of [
    {
      ...hostedSuite.mobileEvidence,
      proof: { ...hostedSuite.mobileEvidence.proof, shortcutRun: undefined },
    },
    { ...hostedSuite.mobileEvidence, humanMfa: 'not-required' },
    {
      ...hostedSuite.mobileEvidence,
      proof: { ...hostedSuite.mobileEvidence.proof, pairingMfa: undefined },
    },
    {
      ...hostedSuite.mobileEvidence,
      proof: { ...hostedSuite.mobileEvidence.proof, revocationMfa: undefined },
    },
  ]) {
    assert.throws(
      () => createHostedStagingSuiteEvidence({ ...hostedSuite, mobileEvidence: falseMobileProof }),
      /invalid_evidence/,
    );
  }

  const action = hostedSuite.actionEvidence;
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'mobile-shortcuts-action' }),
        hostedSuite: { ...hostedSuite, actionEvidence: { ...action, effectCount: 2 } },
      }),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'mobile-shortcuts-action' }),
        hostedSuite: {
          ...hostedSuite,
          mobileEvidence: { ...hostedSuite.mobileEvidence, candidateSha: nextSha },
        },
      }),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'mobile-shortcuts-action' }),
        hostedSuite: {
          ...hostedSuite,
          correlationIds: [...hostedSuite.correlationIds].reverse(),
        },
      }),
    /invalid_evidence/,
  );
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
    correlationIds: ['run-uuid-1', 'trace-uuid-1'],
    workflowRuns: ai15WorkflowRuns,
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
    assert.deepEqual(evidence.freshMfaAction, {
      staleDenied: 'passed',
      staleAttemptUsedMfaGate: false,
      freshReauthAccepted: 'passed',
    });
    assert.equal('releaseSha' in evidence, false);
    assert.equal('password' in evidence, false);

    const invalidInputs = [
      { ...validInput, completeSuite: 'failed' },
      { ...validInput, manualMfaChallengeObserved: false },
      { ...validInput, browserChecks: { chromium: 'passed', webkit: 'failed' } },
      { ...validInput, checks: { ...validInput.checks, safeWrite: 'failed' } },
      { ...validInput, checks: { ...validInput.checks, releaseVersion: 'failed' } },
      { ...validInput, freshMfaAction: { ...validInput.freshMfaAction, staleDenied: 'failed' } },
      {
        ...validInput,
        freshMfaAction: { ...validInput.freshMfaAction, staleAttemptUsedMfaGate: true },
      },
      {
        ...validInput,
        freshMfaAction: { ...validInput.freshMfaAction, freshReauthAccepted: 'failed' },
      },
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
          freshMfaAction: {
            staleDenied: 'passed',
            staleAttemptUsedMfaGate: false,
            freshReauthAccepted: 'passed',
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

test('manual staging dispatch is the only privileged candidate path and binds hosted acceptance', async () => {
  const deployWorkflow = await readFile(
    new URL('../../.github/workflows/deploy-staging.yml', import.meta.url),
    'utf8',
  );

  assert.match(
    deployWorkflow,
    /workflow_dispatch:[\s\S]*mode:[\s\S]*options: \[candidate, acceptance\]/,
  );
  assert.doesNotMatch(deployWorkflow, /workflow_call:|workflow_run:/);
  for (const removedWorkflow of ['staging-candidate.yml', 'staging-acceptance-status.yml'])
    await assert.rejects(
      readFile(new URL(`../../.github/workflows/${removedWorkflow}`, import.meta.url), 'utf8'),
      { code: 'ENOENT' },
      `${removedWorkflow} must not restore the privileged workflow_run candidate path`,
    );
  assert.match(deployWorkflow, /candidate_sha:/);
  assert.match(deployWorkflow, /deployment_run_id:/);
  assert.match(deployWorkflow, /acceptance_evidence:/);
  assert.match(deployWorkflow, /outcome:[\s\S]*options: \[accepted, failed\]/);
  assert.match(deployWorkflow, /head\.sha == \$sha/);
  assert.match(deployWorkflow, /repos\/\$GH_REPOSITORY\/pulls\/\$pr_number/);
  assert.match(deployWorkflow, /repos\/\$GH_REPOSITORY\/git\/commits\/\$CANDIDATE_SHA/);
  assert.match(
    deployWorkflow,
    /actions\/download-artifact@v4[\s\S]*run-id: \$\{\{ inputs\.deployment_run_id \}\}/,
  );
  assert.match(deployWorkflow, /deployment\.candidateSha !== sha/);
  assert.match(deployWorkflow, /deployment\.candidateTreeSha !== candidateTreeSha/);
  assert.match(deployWorkflow, /deployment\.pullRequestNumber/);
  assert.match(deployWorkflow, /submitted\.candidateTreeSha !== candidateTreeSha/);
  assert.match(deployWorkflow, /submitted\.pullRequestNumber !== currentPr\.number/);
  assert.match(deployWorkflow, /currentPullRequestTreeSha: candidateTreeSha/);
  assert.match(deployWorkflow, /currentPullRequestNumber: currentPr\.number/);
  assert.match(deployWorkflow, /deployment\.runId !== runId/);
  assert.match(deployWorkflow, /deployment\.runAttempt/);
  assert.match(deployWorkflow, /release-gate\.ts staging-status/);
  assert.ok(
    deployWorkflow.indexOf('Upload validated hosted acceptance evidence') <
      deployWorkflow.indexOf('Publish accepted commit status'),
  );
  assert.match(deployWorkflow, /state:"failure"/);
  assert.doesNotMatch(deployWorkflow, /deploy-production|production-promote/);
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
  assert.match(
    deployWorkflow,
    /acceptance_profile:[\s\S]*options:[\s\S]*\bauto\b[\s\S]*\bauth-browser\b[\s\S]*\bcost-runtime\b[\s\S]*\bprocurement\b[\s\S]*\bcareer\b[\s\S]*\bmobile-shortcuts\b[\s\S]*\bmobile-shortcuts-action\b/,
  );
  assert.match(
    deployWorkflow,
    /Ticket-specific mobile, cost, Procurement, and Career proof stays pending until candidate-bound evidence validates/,
  );
  assert.match(
    deployWorkflow,
    /Set candidate status while hosted acceptance is pending[\s\S]*ACCEPTANCE_PROFILE: \$\{\{ steps\.acceptance-profile\.outputs\.acceptance_profile \}\}[\s\S]*waiting for one-call cost-runtime evidence/,
  );
  assert.match(
    deployWorkflow,
    /ACCEPTANCE_PROFILE" == "procurement"[\s\S]*waiting for ticket-specific Procurement acceptance evidence/,
  );
  assert.match(
    deployWorkflow,
    /ACCEPTANCE_PROFILE" == "mobile-shortcuts-action"[\s\S]*waiting for separate AI-28 mobile and AI-44 action acceptance evidence/,
  );
  assert.doesNotMatch(deployWorkflow, /run-live-e2e|live:e2e -- suite/);
  assert.match(
    deployWorkflow,
    /HOSTED_PROFILE_OVERRIDE: \$\{\{ inputs\.acceptance_profile \|\| 'auto' \}\}/,
  );
  assert.match(
    deployWorkflow,
    /acceptance-profile\.ts candidate-files\.txt "\$HOSTED_PROFILE_OVERRIDE"/,
  );
  const leaseCheck = deployWorkflow.indexOf('name: Check shared staging acceptance lease');
  const deployPending = deployWorkflow.indexOf('name: Set candidate status while staging deploys');
  const targetedAutoAccept = deployWorkflow.indexOf('name: Auto-accept targeted staging candidate');
  const authBrowserPending = deployWorkflow.indexOf(
    'Staging is deployed; waiting for auth-browser acceptance.',
  );
  const manualRequiredGate = deployWorkflow.indexOf(
    'name: Validate manual candidate required workflows',
  );
  const environmentValidation = deployWorkflow.indexOf(
    'name: Validate staging environment identity',
  );
  const migrationPreflight = deployWorkflow.indexOf(
    'name: Preflight persistent staging migration history',
  );
  assert.ok(
    migrationPreflight > environmentValidation,
    'persistent staging migration history must be checked after staging identity validation',
  );
  assert.match(deployWorkflow, /environment:drift -- preflight-staging-migrations/);
  assert.match(deployWorkflow, /supabase db push --linked --include-all/);
  for (const mutation of [
    'name: Deploy Worker',
    'name: Configure staging finance archive gateway secret',
    'name: Apply staging migrations',
  ]) {
    assert.ok(
      migrationPreflight < deployWorkflow.indexOf(mutation),
      `${mutation} must follow the persistent staging migration preflight`,
    );
  }
  assert.ok(
    manualRequiredGate >= 0 && manualRequiredGate < environmentValidation,
    'manual candidate dispatch must validate CI before environment/deploy steps',
  );
  assert.match(
    deployWorkflow,
    /if: github\.event_name == 'workflow_dispatch' && inputs\.mode == 'candidate'[\s\S]*latest-required-workflow-runs[\s\S]*candidate-readiness/,
  );
  assert.ok(
    leaseCheck >= manualRequiredGate && leaseCheck < environmentValidation,
    'lease guard must run after required-check validation and before staging environment access',
  );
  assert.ok(
    deployWorkflow.indexOf('name: Revalidate exact candidate PR head') < leaseCheck,
    'lease guard must run after resolving the current candidate PR',
  );
  assert.ok(
    deployWorkflow.indexOf('pnpm install --frozen-lockfile') < leaseCheck,
    'release-gate tooling must be installed before lease validation',
  );
  assert.match(
    deployWorkflow,
    /ref: \$\{\{ inputs\.candidate_sha \|\| github\.sha \}\}[\s\S]*persist-credentials: false/,
  );
  assert.ok(
    leaseCheck < deployPending,
    'lease guard must run before the candidate staging status/deployment begins',
  );
  const stagingSmoke = deployWorkflow.indexOf('name: Smoke test staging Worker');
  assert.ok(
    stagingSmoke < targetedAutoAccept,
    'targeted acceptance can auto-publish only after staging deploy/smoke succeeds',
  );
  assert.ok(
    stagingSmoke < authBrowserPending,
    'auth-browser acceptance can become pending only after staging deploy/smoke succeeds',
  );
  assert.match(deployWorkflow, /current_sha=.*pulls\/\$PULL_REQUEST_NUMBER/);
  assert.match(deployWorkflow, /staging-slot-check < staging-slot-input\.json/);
  assert.match(deployWorkflow, /commits\/\$\{headSha\}\/status/);
  assert.match(deployWorkflow, /headSha === candidateSha\) continue/);
  assert.match(deployWorkflow, /staging_slot_busy/);
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
    /staging proves AI-16 prompt promotion\/rollback and AI-19 correlated workflows in one AAL2 journey/,
  );
  assert.match(hostedSuite, /async function proveAi16PromptGovernance\(/);
  assert.match(hostedSuite, /operation: 'create_candidate'/);
  assert.match(hostedSuite, /operation: 'evaluate'/);
  assert.match(hostedSuite, /await proveAi16PromptGovernance\(page\)/);
  assert.match(
    hostedSuite,
    /const rollback = await transitionSystemsPrompt\(\s*page,\s*'rollback'/,
  );
  assert.match(hostedSuite, /rollbackIdempotencyKey: rollbackKey/);
  assert.match(
    hostedSuite,
    /systemsLaunchRequest\(\{ workflowCode, hardCapUsd, modelCeiling, idempotencyKey \}\)/,
  );
  const systemsLaunchRequest = await readFile(
    new URL('../../tests/support/systems-launch-request.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    systemsLaunchRequest,
    /managerCode: 'systems' as const,[\s\S]*hardCapUsd,[\s\S]*modelCeiling,[\s\S]*searchCeiling: 0 as const,[\s\S]*idempotencyKey,[\s\S]*request: \{\}/,
  );
  assert.match(hostedSuite, /workflowRuns: \[deterministicProof, responsesProof\]/);
  assert.match(hostedSuite, /promptGovernanceProof: governanceProof\.evidence/);
  assert.match(hostedSuite, /let webkitProbeId: string \| null = null/);
  assert.match(hostedSuite, /webkitProbeId = webkitProbe\.body\.probeId/);
  assert.match(hostedSuite, /Hosted acceptance evidence requires the passing WebKit probe result/);
  assert.match(hostedSuite, /webkitProbeId,/);
  assert.doesNotMatch(hostedSuite, /webkitProbe\.body\.probeId!/);
  assert.match(deployWorkflow, /checked_out_sha="\$\(git rev-parse HEAD\)"/);
  assert.match(deployWorkflow, /git rev-parse --verify 'HEAD\^\{tree\}'/);
  assert.match(deployWorkflow, /pull_request_number=\$pr_number/);
  assert.match(deployWorkflow, /candidateTreeSha:process\.env\.CANDIDATE_TREE_SHA/);
  assert.match(deployWorkflow, /pullRequestNumber:Number\(process\.env\.PULL_REQUEST_NUMBER\)/);
  assert.doesNotMatch(deployWorkflow, /candidateTreeSha:"[a-f0-9]{40}"/);
  assert.doesNotMatch(deployWorkflow, /pullRequestNumber:\d+/);
  assert.match(deployWorkflow, /candidate-staging-deployment-\$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(
    deployWorkflow,
    /Auto-accept targeted staging candidate[\s\S]*TARGETED_STAGING_ACCEPTED/,
  );
  const targetedAutoAcceptStep = deployWorkflow.slice(
    deployWorkflow.indexOf('name: Auto-accept targeted staging candidate'),
    deployWorkflow.indexOf('name: Upload targeted staging acceptance evidence'),
  );
  assert.match(targetedAutoAcceptStep, /WORKFLOW_RUN_URL:/);
  assert.match(targetedAutoAcceptStep, /target_url:\$url/);
  assert.match(deployWorkflow, /state:"pending"[\s\S]*waiting for auth-browser acceptance/);
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
  const releaseResolution = workflow.slice(
    workflow.indexOf('name: Resolve successful staging release'),
    workflow.indexOf('- uses: actions/checkout@v5'),
  );
  assert.match(
    releaseResolution,
    /PROMOTION_EVIDENCE_DIR: \$\{\{ runner\.temp \}\}\/ai-operations-production-release-evidence/,
  );
  assert.match(
    releaseResolution,
    /mkdir -p "\$PROMOTION_EVIDENCE_DIR"[\s\S]*cd "\$PROMOTION_EVIDENCE_DIR"/,
  );
  assert.match(
    workflow,
    /const stagingRun = readPromotionEvidence\('staging-run\.json'\);[\s\S]*const mergeCommit = readPromotionEvidence\('merge-commit\.json'\);[\s\S]*const pullRequests = readPromotionEvidence\('merged-pulls\.json'\);/,
  );
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

test('hosted acceptance profile requires real MFA only for auth-browser changes', () => {
  assert.equal(
    selectHostedAcceptanceProfile(['apps/web/app/api/auth/mfa/verify/route.ts']),
    'auth-browser',
  );
  assert.equal(
    selectHostedAcceptanceProfile(['apps/web/app/mfa/mfa-challenge.tsx']),
    'auth-browser',
  );
  assert.equal(
    selectHostedAcceptanceProfile(['supabase/functions/feedback-submit/index.ts']),
    'targeted',
  );
  assert.equal(
    selectHostedAcceptanceProfile(['apps/web/app/api/workflows/launch/route.ts']),
    'auth-browser',
  );
  assert.equal(
    selectHostedAcceptanceProfile([
      'apps/web/app/(app)/app-shell.tsx',
      'apps/web/app/(app)/layout.tsx',
      'apps/web/app/(app)/navigation.ts',
      'tests/e2e/platform-authenticated.spec.ts',
    ]),
    'auth-browser',
  );
  assert.equal(selectHostedAcceptanceProfile(['docs/testing/local-autonomous-qa.md']), 'targeted');
});

test('issue-required action and worker pairing use auth-browser while Career uses its dedicated proof profile', () => {
  assert.equal(
    selectHostedAcceptanceProfile([
      'packages/contracts/src/action-policy.ts',
      'packages/manager-core/src/action-execution.ts',
      'supabase/functions/ai-execute/canonical-action-dispatcher.ts',
    ]),
    'auth-browser',
  );
  assert.equal(
    selectHostedAcceptanceProfile([
      'apps/web/app/(app)/devices/device-manager.tsx',
      'supabase/functions/_shared/worker-protocol.ts',
      'apps/windows-worker/src/ai_operations_worker/protocol.py',
    ]),
    'auth-browser',
  );
  assert.equal(
    selectHostedAcceptanceProfile([
      'apps/web/app/(app)/career/page.tsx',
      'supabase/functions/github-career-sync/index.ts',
      'docs/build/ticket-readbacks/AI-35.md',
      'tests/e2e-live/career-acceptance.spec.ts',
    ]),
    'career',
  );
});

test('explicit issue proof override upgrades a targeted candidate to auth-browser only', () => {
  const ai28CandidateFiles = [
    'supabase/migrations/20261021155521_ai28_scoped_reminder_v2.sql',
    'docs/build/ticket-readbacks/AI-28.md',
  ];
  assert.equal(selectHostedAcceptanceProfile(ai28CandidateFiles), 'mobile-shortcuts');
  assert.throws(
    () => selectHostedAcceptanceProfile(ai28CandidateFiles, 'auth-browser'),
    /A ticket-specific hosted proof cannot be replaced by the generic auth-browser suite/,
  );
  const combinedCandidate = [
    ...ai28CandidateFiles,
    'packages/contracts/src/action-policy.ts',
    'packages/manager-core/src/action-execution.ts',
  ];
  assert.equal(selectHostedAcceptanceProfile(combinedCandidate), 'mobile-shortcuts-action');
  assert.equal(
    selectHostedAcceptanceProfile(combinedCandidate, 'mobile-shortcuts-action'),
    'mobile-shortcuts-action',
  );
  assert.throws(
    () =>
      selectHostedAcceptanceProfile(
        ['packages/contracts/src/action-policy.ts'],
        'mobile-shortcuts',
      ),
    /mobile-shortcuts override requires the AI-28 readback/,
  );
  assert.throws(
    () => selectHostedAcceptanceProfile(['apps/web/app/api/auth/mfa/verify/route.ts'], 'targeted'),
    /Hosted acceptance profile override must be 'auto', 'auth-browser', 'cost-runtime', 'procurement', 'career', 'mobile-shortcuts', or 'mobile-shortcuts-action'\./,
  );
});

test('AI-20 cost-runtime selection stays separate from auth-browser and targeted auto-accept', () => {
  const ai20CandidateFiles = [
    'packages/ai-runtime/src/index.ts',
    'supabase/functions/ai-execute/index.ts',
    'supabase/migrations/20261021155522_ai20_cost_reconciliation_authority.sql',
    'docs/build/ticket-readbacks/AI-20.md',
  ];
  assert.equal(selectHostedAcceptanceProfile(ai20CandidateFiles), 'cost-runtime');
  assert.equal(
    selectHostedAcceptanceProfile([
      'supabase/migrations/20261021155522_ai20_cost_reconciliation_authority.sql',
    ]),
    'targeted',
  );
  assert.equal(
    selectHostedAcceptanceProfile(['docs/build/ticket-readbacks/AI-20.md'], 'cost-runtime'),
    'cost-runtime',
  );
  assert.throws(
    () => selectHostedAcceptanceProfile(['packages/ai-runtime/src/index.ts'], 'cost-runtime'),
    /cost-runtime override requires the AI-20 readback marker/,
  );
  assert.throws(
    () => selectHostedAcceptanceProfile(ai20CandidateFiles, 'auth-browser'),
    /A ticket-specific hosted proof cannot be replaced by the generic auth-browser suite/,
  );
  assert.throws(
    () =>
      selectHostedAcceptanceProfile(
        [...ai20CandidateFiles, 'apps/web/app/(app)/devices/device-manager.tsx'],
        'auto',
      ),
    /Candidate requires both ticket-specific and generic auth-browser proof/,
  );
  assert.throws(
    () =>
      selectHostedAcceptanceProfile(
        [...ai20CandidateFiles, 'apps/web/app/(app)/devices/device-manager.tsx'],
        'cost-runtime',
      ),
    /Candidate requires both ticket-specific and generic auth-browser proof/,
  );
});

test('AI-39 procurement selection binds a dedicated profile to its ticket marker', () => {
  const ai39CandidateFiles = [
    'docs/build/ticket-readbacks/AI-39.md',
    'supabase/migrations/20261021131410_ai39_procurement_lifecycle.sql',
  ];
  assert.equal(selectHostedAcceptanceProfile(ai39CandidateFiles), 'procurement');
  assert.equal(selectHostedAcceptanceProfile(ai39CandidateFiles, 'procurement'), 'procurement');
  assert.equal(
    selectHostedAcceptanceProfile(['tests/e2e-live/procurement-acceptance.spec.ts']),
    'procurement',
  );
  assert.throws(
    () => selectHostedAcceptanceProfile(['apps/web/app/(app)/procurement/page.tsx'], 'procurement'),
    /procurement override requires the AI-39 readback or dedicated acceptance spec marker/,
  );
  assert.throws(
    () => selectHostedAcceptanceProfile(ai39CandidateFiles, 'auth-browser'),
    /A ticket-specific hosted proof cannot be replaced by the generic auth-browser suite/,
  );
  assert.throws(
    () =>
      selectHostedAcceptanceProfile(
        [...ai39CandidateFiles, 'apps/web/app/api/auth/mfa/verify/route.ts'],
        'auto',
      ),
    /Candidate requires both ticket-specific and generic auth-browser proof/,
  );
});

test('targeted hosted acceptance is valid without MFA and cannot satisfy an auth-browser deployment', () => {
  assert.deepEqual(
    Ai16PromptGovernanceProofSchema.parse(ai16PromptGovernanceProof),
    ai16PromptGovernanceProof,
  );
  assert.throws(() =>
    Ai16PromptGovernanceProofSchema.parse({
      ...ai16PromptGovernanceProof,
      rollback: { previousVersion: 8, activeVersion: 8, replayed: false },
    }),
  );
  assert.throws(() =>
    Ai16PromptGovernanceProofSchema.parse({
      ...ai16PromptGovernanceProof,
      candidateRun: { ...ai16PromptGovernanceProof.candidateRun, searchCalls: 1 },
    }),
  );
  assert.throws(() =>
    Ai16PromptGovernanceProofSchema.parse({
      ...ai16PromptGovernanceProof,
      totalActualCostUsd: 0.06,
    }),
  );

  const targetedSuite = {
    schemaVersion: 1,
    state: 'TARGETED_STAGING_ACCEPTED',
    acceptanceProfile: 'targeted',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: 152,
    deploymentRunId: '36474707377',
    stagingOrigin: origin,
    humanMfa: 'not-required',
    checks: [
      { name: 'source-drift', result: 'passed' },
      { name: 'readiness-smoke', result: 'passed' },
    ],
    correlationIds: ['trace-1'],
    promptGovernanceProof: ai16PromptGovernanceProof,
    acceptedAt: '2026-09-29T10:00:00.000Z',
  };
  const success = createStagingAcceptanceStatus({
    candidateSha,
    currentPullRequestHeadSha: candidateSha,
    currentPullRequestTreeSha: candidateTreeSha,
    currentPullRequestNumber: 152,
    state: 'success',
    deployment: candidateDeploymentEvidence({ acceptanceProfile: 'targeted' }),
    hostedSuite: targetedSuite,
  });
  assert.equal(success.status.state, 'success');
  assert.equal(success.acceptance?.acceptanceProfile, 'targeted');
  assert.equal(success.acceptance?.humanMfa, 'not-required');
  assert.ok(Array.isArray(success.acceptance?.checks));
  assert.deepEqual(success.acceptance?.promptGovernanceProof, ai16PromptGovernanceProof);
  assert.throws(
    () =>
      createStagingAcceptanceStatus({
        candidateSha,
        currentPullRequestHeadSha: candidateSha,
        currentPullRequestTreeSha: candidateTreeSha,
        currentPullRequestNumber: 152,
        state: 'success',
        deployment: candidateDeploymentEvidence({ acceptanceProfile: 'auth-browser' }),
        hostedSuite: targetedSuite,
      }),
    /acceptance_profile_mismatch/,
  );
});
