import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  calculateActualCostUsd,
  createAi20CostRuntimeProof,
  writeAi20CostRuntimeProof,
} from './ai20-cost-runtime-proof.js';

const candidateSha = 'a'.repeat(40);
const correlationId = '11111111-1111-4111-8111-111111111111';
const evidence = {
  schemaVersion: 1,
  state: 'COST_RUNTIME_STAGING_ACCEPTED',
  acceptanceProfile: 'cost-runtime',
  candidateSha,
  candidateTreeSha: 'b'.repeat(40),
  pullRequestNumber: 178,
  deploymentRunId: '1234567890',
  stagingOrigin: 'https://ai-operations-staging.ai-operations.workers.dev',
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
    workflowCode: 'systems-weekly-quality-platform',
    requestScope: 'empty',
    provider: 'openai-responses',
    providerCallCount: 1,
    searchCalls: 0,
    toolCalls: 0,
    actionsExecuted: 0,
    model: 'gpt-5.6-luna',
    runId: '22222222-2222-4222-8222-222222222222',
    responseId: 'resp_123456789',
    correlationId,
    aiCallId: '33333333-3333-4333-8333-333333333333',
    reservationId: '44444444-4444-4444-8444-444444444444',
    pricingRecordId: '55555555-5555-4555-8555-555555555555',
    estimatedUsd: '0.00002',
    reservedUsd: '0.00002',
    hardCapUsd: '0.05',
    calculatedActualUsd: '0.000006',
    reservationConsumedUsd: '0.000006',
    reservationReleasedUsd: '0.000014',
    onDemandReservedAfterUsd: '0',
    onDemandActualUsd: '0.000006',
    reservationState: 'consumed',
    providerUsage: {
      inputTokens: 20,
      cachedInputTokens: 4,
      cacheWriteTokens: 1,
      outputTokens: 5,
      reasoningTokens: 2,
    },
    pricingInputs: {
      inputPerMillion: '0.15',
      cachedInputPerMillion: '0.075',
      outputPerMillion: '0.6',
      cacheWriteMultiplier: '1.25',
      webSearchPerCall: '0.01',
    },
    usageReconciliation: 'passed',
    costReconciliation: 'passed',
    traceReconciliation: 'passed',
  },
  correlationIds: [correlationId],
  acceptedAt: '2026-10-22T12:00:00.000Z',
  accepted: true,
} as const;

test('AI-20 cost runtime evidence accepts one candidate-bound bounded proof', () => {
  const parsed = createAi20CostRuntimeProof(evidence);

  assert.equal(parsed.acceptanceProfile, 'cost-runtime');
  assert.equal(parsed.costRuntimeProof.workflowCode, 'systems-weekly-quality-platform');
  assert.equal(parsed.costRuntimeProof.reservationState, 'consumed');
  assert.equal(parsed.humanMfa, undefined);
});

test('AI-20 actual cost uses immutable pricing and all provider token classes', () => {
  assert.equal(
    calculateActualCostUsd(
      evidence.costRuntimeProof.providerUsage,
      evidence.costRuntimeProof.pricingInputs,
    ),
    '0.000006',
  );
});

test('AI-20 actual cost includes provider search charges at the configured per-call price', () => {
  assert.equal(
    calculateActualCostUsd(
      evidence.costRuntimeProof.providerUsage,
      evidence.costRuntimeProof.pricingInputs,
      1,
    ),
    '0.010006',
  );
});

test('AI-20 cost runtime evidence records MFA only after an observed challenge', () => {
  assert.equal(
    createAi20CostRuntimeProof({ ...evidence, humanMfa: 'user-completed' }).humanMfa,
    'user-completed',
  );
  assert.throws(() => createAi20CostRuntimeProof({ ...evidence, humanMfa: 'not-required' }));
});

test('AI-20 cost runtime evidence rejects cost, usage, and candidate contradictions', () => {
  assert.throws(() =>
    createAi20CostRuntimeProof({
      ...evidence,
      costRuntimeProof: { ...evidence.costRuntimeProof, reservedUsd: '0.00011' },
    }),
  );
  assert.throws(() =>
    createAi20CostRuntimeProof({
      ...evidence,
      costRuntimeProof: {
        ...evidence.costRuntimeProof,
        calculatedActualUsd: '0.05000001',
        reservationConsumedUsd: '0.05000001',
        reservationReleasedUsd: '0',
        onDemandActualUsd: '0.05000001',
      },
    }),
  );
  assert.throws(() =>
    createAi20CostRuntimeProof({
      ...evidence,
      costRuntimeProof: {
        ...evidence.costRuntimeProof,
        providerUsage: { ...evidence.costRuntimeProof.providerUsage, cachedInputTokens: 21 },
      },
    }),
  );
  assert.throws(() =>
    createAi20CostRuntimeProof({
      ...evidence,
      costRuntimeProof: { ...evidence.costRuntimeProof, localProofSha: 'c'.repeat(40) },
    }),
  );
});

test('AI-20 cost runtime evidence rejects a second provider call or side effect', () => {
  assert.throws(() =>
    createAi20CostRuntimeProof({
      ...evidence,
      costRuntimeProof: { ...evidence.costRuntimeProof, providerCallCount: 2 },
    }),
  );
  assert.throws(() =>
    createAi20CostRuntimeProof({
      ...evidence,
      costRuntimeProof: { ...evidence.costRuntimeProof, searchCalls: 1 },
    }),
  );
  assert.throws(() =>
    createAi20CostRuntimeProof({
      ...evidence,
      costRuntimeProof: { ...evidence.costRuntimeProof, actionsExecuted: 1 },
    }),
  );
});

test('AI-20 cost runtime evidence writer writes only a parsed proof atomically', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai20-cost-proof-'));
  const path = join(directory, 'acceptance.json');
  try {
    await writeAi20CostRuntimeProof(path, evidence);
    const written = JSON.parse(await readFile(path, 'utf8')) as { candidateSha: string };
    assert.equal(written.candidateSha, candidateSha);
    await assert.rejects(writeAi20CostRuntimeProof(path, { ...evidence, accepted: false }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
