import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  ProcurementStagingAcceptanceEvidenceSchema,
  writeProcurementStagingAcceptanceEvidence,
} from './procurement-live-acceptance.js';
import {
  acceptStagingCandidate,
  createHostedStagingSuiteEvidence,
  createStagingAcceptanceStatus,
  createStagingReadyEvidence,
} from './release-gate.js';

const evidence = {
  schemaVersion: 1,
  state: 'PROCUREMENT_STAGING_ACCEPTED',
  acceptanceProfile: 'procurement',
  candidateSha: '1'.repeat(40),
  candidateTreeSha: '2'.repeat(40),
  pullRequestNumber: 176,
  deploymentRunId: '12345678901',
  stagingOrigin: 'https://ai-operations-staging.ai-operations.workers.dev',
  humanMfa: 'user-completed',
  correlationIds: ['00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000008'],
  acceptedAt: '2026-10-22T12:00:00.000Z',
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
      researchRunId: '00000000-0000-4000-8000-000000000003',
      workflowRunId: '00000000-0000-4000-8000-000000000004',
      correlationId: '00000000-0000-4000-8000-000000000005',
      status: 'complete',
      hardCapMicroUsd: 250_000,
      actualCostMicroUsd: 120_000,
      searchLimit: 3,
      searchesUsed: 2,
      aiCallCount: 1,
    },
    {
      researchRunId: '00000000-0000-4000-8000-000000000006',
      workflowRunId: '00000000-0000-4000-8000-000000000007',
      correlationId: '00000000-0000-4000-8000-000000000008',
      status: 'complete',
      hardCapMicroUsd: 250_000,
      actualCostMicroUsd: 120_000,
      searchLimit: 3,
      searchesUsed: 2,
      aiCallCount: 1,
    },
  ],
  revision: {
    originalResearchRunId: '00000000-0000-4000-8000-000000000003',
    revisedResearchRunId: '00000000-0000-4000-8000-000000000006',
    linkedToOriginal: true,
    priorDecisionPreserved: true,
    requirementsChanged: true,
    priorDecisionSha256: 'a'.repeat(64),
  },
  comparison: {
    requirements: [{ id: 'hard-1', kind: 'hard' }],
    ineligibleCandidateId: 'candidate-a',
    exclusionReasonCount: 1,
    exclusionReasonsSha256: 'c'.repeat(64),
    unknownCandidateId: 'candidate-b',
    unknownRequirementId: 'hard-1',
    sourceA: {
      candidateId: 'candidate-c',
      sourceHost: 'merchant-a.example',
      observedAt: '2026-10-20T09:00:00.000Z',
      totalMinor: 6000,
    },
    sourceB: {
      candidateId: 'candidate-d',
      sourceHost: 'merchant-b.example',
      observedAt: '2026-10-21T09:00:00.000Z',
      totalMinor: 6500,
    },
    currency: 'GBP',
    allIn: {
      itemMinor: 5000,
      deliveryMinor: 500,
      accessoriesMinor: 200,
      mandatoryFeesMinor: 100,
      totalMinor: 5800,
    },
    rationaleSha256: 'b'.repeat(64),
  },
  actionDenial: { status: 400, code: 'invalid_launch_request', noWorkflowCreated: true },
} as const;

describe('AI-39 procurement staging evidence', () => {
  it('accepts the exact candidate-bound Procurement evidence envelope and writes it atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ai39-procurement-evidence-'));
    const path = join(directory, 'acceptance.json');
    try {
      const parsed = ProcurementStagingAcceptanceEvidenceSchema.parse(evidence);
      await writeProcurementStagingAcceptanceEvidence(path, parsed);
      const serialized = await readFile(path, 'utf8');
      assert.deepEqual(JSON.parse(serialized), parsed);
      assert.doesNotMatch(serialized, /UK plug included|Missing UK plug|sourceUrl|\/item/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('passes the flat producer artifact through staging-status and staging-accept', () => {
    const producerEvidence = ProcurementStagingAcceptanceEvidenceSchema.parse(evidence);
    const hostedSuite = createHostedStagingSuiteEvidence(producerEvidence);
    const deployment = {
      schemaVersion: 1,
      state: 'CANDIDATE_STAGING_DEPLOYED',
      candidateSha: producerEvidence.candidateSha,
      candidateTreeSha: producerEvidence.candidateTreeSha,
      pullRequestNumber: producerEvidence.pullRequestNumber,
      runId: producerEvidence.deploymentRunId,
      runAttempt: '1',
      origin: producerEvidence.stagingOrigin,
      acceptanceProfile: 'procurement',
      migrations: 'passed',
      edgeFunctions: 'passed',
      sourceDrift: 'passed',
      readinessSmoke: 'passed',
    } as const;

    const staged = createStagingAcceptanceStatus({
      candidateSha: producerEvidence.candidateSha,
      currentPullRequestHeadSha: producerEvidence.candidateSha,
      currentPullRequestTreeSha: producerEvidence.candidateTreeSha,
      currentPullRequestNumber: producerEvidence.pullRequestNumber,
      state: 'success',
      deployment,
      hostedSuite,
    });

    assert.equal(staged.status.state, 'success');
    assert.deepEqual(staged.acceptance?.procurementEvidence, producerEvidence);
    assert.equal(staged.acceptance?.candidateTreeSha, producerEvidence.candidateTreeSha);
    assert.equal(staged.acceptance?.pullRequestNumber, producerEvidence.pullRequestNumber);

    const ready = createStagingReadyEvidence({
      candidateSha: producerEvidence.candidateSha,
      pullRequestHeadSha: producerEvidence.candidateSha,
      candidateTreeSha: producerEvidence.candidateTreeSha,
      pullRequestTreeSha: producerEvidence.candidateTreeSha,
      prNumber: producerEvidence.pullRequestNumber,
      localQa: 'passed',
      ci: 'passed',
      deployment: {
        candidateSha: producerEvidence.candidateSha,
        runId: producerEvidence.deploymentRunId,
        origin: producerEvidence.stagingOrigin,
        workerVersion: 'worker-build-1',
        migrations: 'passed',
        edgeFunctions: 'passed',
        sourceDrift: 'passed',
        readinessSmoke: 'passed',
      },
    });
    const accepted = acceptStagingCandidate({
      ready,
      currentPullRequestHeadSha: producerEvidence.candidateSha,
      currentPullRequestTreeSha: producerEvidence.candidateTreeSha,
      currentPullRequestNumber: producerEvidence.pullRequestNumber,
      acceptance: staged.acceptance!,
    });
    assert.deepEqual(accepted.procurementEvidence, producerEvidence);
    assert.throws(() =>
      acceptStagingCandidate({
        ready,
        currentPullRequestHeadSha: producerEvidence.candidateSha,
        currentPullRequestTreeSha: producerEvidence.candidateTreeSha,
        currentPullRequestNumber: producerEvidence.pullRequestNumber,
        acceptance: producerEvidence as unknown as typeof accepted,
      }),
    );

    const prematurelyWrapped = {
      candidateSha: producerEvidence.candidateSha,
      deploymentRunId: producerEvidence.deploymentRunId,
      stagingOrigin: producerEvidence.stagingOrigin,
      acceptanceProfile: producerEvidence.acceptanceProfile,
      humanMfa: producerEvidence.humanMfa,
      checks: producerEvidence.checks,
      procurementEvidence: producerEvidence,
      correlationIds: producerEvidence.correlationIds,
      acceptedAt: producerEvidence.acceptedAt,
    };
    assert.throws(() => createHostedStagingSuiteEvidence(prematurelyWrapped));
  });

  it('rejects incomplete checks, a budget overrun, mismatched revision lineage, invalid totals, and purchase success', () => {
    assert.throws(() =>
      ProcurementStagingAcceptanceEvidenceSchema.parse({ ...evidence, checks: {} }),
    );
    assert.throws(() =>
      ProcurementStagingAcceptanceEvidenceSchema.parse({
        ...evidence,
        runs: [{ ...evidence.runs[0], actualCostMicroUsd: 250_001 }, evidence.runs[1]],
      }),
    );
    assert.throws(() =>
      ProcurementStagingAcceptanceEvidenceSchema.parse({
        ...evidence,
        revision: { ...evidence.revision, revisedResearchRunId: evidence.runs[0].researchRunId },
      }),
    );
    assert.throws(() =>
      ProcurementStagingAcceptanceEvidenceSchema.parse({
        ...evidence,
        correlationIds: [evidence.correlationIds[1], evidence.correlationIds[0]],
      }),
    );
    assert.throws(() =>
      ProcurementStagingAcceptanceEvidenceSchema.parse({
        ...evidence,
        comparison: {
          ...evidence.comparison,
          allIn: { ...evidence.comparison.allIn, totalMinor: 1 },
        },
      }),
    );
    assert.throws(() =>
      ProcurementStagingAcceptanceEvidenceSchema.parse({
        ...evidence,
        actionDenial: { status: 200, code: 'purchase_created', noWorkflowCreated: false },
      }),
    );
  });
});
