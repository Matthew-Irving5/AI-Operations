import { expect, it, vi } from 'vitest';
import type { InterAgentReply, InterAgentRequest } from '@ai-operations/contracts';
import {
  completeInterAgentRequest,
  createAndQueueInterAgentRequest,
  type InterAgentDelegationPersistence,
} from './delegation-runtime';

const timestamp = '2026-10-21T12:00:00.000Z';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const requestId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const rootRunId = '77777777-7777-4777-8777-777777777777';
const correlationId = '33333333-3333-4333-8333-333333333333';
const requestBase = {
  userId,
  sourceRunId: runId,
  sourceMessageId: null,
  sourceManagerCode: 'personal' as const,
  destinationManagerCode: 'travel' as const,
  objective: 'Compare two trip options against this budget.',
  requiredOutputContract: { type: 'object', additionalProperties: false },
  contextEvidenceIds: [],
  priority: 2,
  deadlineAt: null,
  correlationId,
};

function persistence(overrides: Partial<InterAgentDelegationPersistence> = {}) {
  const createAndQueueRequest = vi.fn<InterAgentDelegationPersistence['createAndQueueRequest']>(
    ({ request }) =>
      Promise.resolve({
        requestId: request.id,
        destinationRunId: '44444444-4444-4444-8444-444444444444',
        duplicate: false,
      }),
  );
  const completeAndResume = vi.fn<InterAgentDelegationPersistence['completeAndResume']>(() =>
    Promise.resolve({ sourceRunId: runId }),
  );
  return {
    createAndQueueRequest,
    completeAndResume,
    ...overrides,
  } satisfies InterAgentDelegationPersistence;
}

it('produces one canonical AI-14 request for atomic request/run/queue persistence', async () => {
  let capturedPlan:
    | Parameters<InterAgentDelegationPersistence['createAndQueueRequest']>[0]['plan']
    | undefined;
  let capturedCostRootRunId: string | null | undefined;
  const store = persistence({
    createAndQueueRequest: vi.fn<InterAgentDelegationPersistence['createAndQueueRequest']>(
      ({ request, plan, costRootRunId }) => {
        capturedPlan = plan;
        capturedCostRootRunId = costRootRunId;
        return Promise.resolve({
          requestId: request.id,
          destinationRunId: '44444444-4444-4444-8444-444444444444',
          duplicate: false,
        });
      },
    ),
  });
  const created = await createAndQueueInterAgentRequest({
    request: requestBase,
    routingPath: ['personal'],
    sourceRunLineage: { id: runId, costRootRunId: null },
    persistence: store,
    newId: () => requestId,
    now: () => timestamp,
  });

  expect(created.request).toMatchObject({
    contractVersion: 1,
    id: requestId,
    sourceManagerCode: 'personal',
    destinationManagerCode: 'travel',
    status: 'requested',
    idempotencyKey: expect.stringMatching(/^a2a:v1:[a-f0-9]{64}$/),
    sourceRunId: runId,
  });
  expect(created.destinationRunId).toBe('44444444-4444-4444-8444-444444444444');
  expect(store.createAndQueueRequest).toHaveBeenCalledTimes(1);
  expect(capturedPlan).toMatchObject({
    delegationDepth: 1,
    routingPath: ['personal', 'travel'],
  });
  expect(capturedCostRootRunId).toBe(runId);
});

it('keeps nested specialist runs under the original on-demand cost root', async () => {
  const store = persistence();
  const nestedSourceRunId = '88888888-8888-4888-8888-888888888888';
  await createAndQueueInterAgentRequest({
    request: {
      ...requestBase,
      sourceManagerCode: 'travel',
      destinationManagerCode: 'finance',
      sourceRunId: nestedSourceRunId,
    },
    routingPath: ['personal', 'travel'],
    sourceRunLineage: { id: nestedSourceRunId, costRootRunId: rootRunId },
    persistence: store,
    newId: () => requestId,
    now: () => timestamp,
  });

  expect(store.createAndQueueRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      costRootRunId: rootRunId,
    }),
  );
});

it('rejects lineage that does not match the request source run', async () => {
  const store = persistence();
  await expect(
    createAndQueueInterAgentRequest({
      request: requestBase,
      routingPath: ['personal'],
      sourceRunLineage: { id: rootRunId, costRootRunId: null },
      persistence: store,
    }),
  ).rejects.toThrow('inter_agent_source_run_lineage_mismatch');
  expect(store.createAndQueueRequest).not.toHaveBeenCalled();
});

it('rejects a run-backed delegation when source cost lineage is missing', async () => {
  const store = persistence();
  await expect(
    createAndQueueInterAgentRequest({
      request: requestBase,
      routingPath: ['personal'],
      persistence: store,
    }),
  ).rejects.toThrow('inter_agent_source_run_lineage_missing');
  expect(store.createAndQueueRequest).not.toHaveBeenCalled();
});

it('consumes an AI-14 reply only from the destination owner and resumes the source run', async () => {
  const store = persistence();
  const request: InterAgentRequest = {
    ...requestBase,
    contractVersion: 1,
    id: requestId,
    idempotencyKey: 'a2a:runtime:request:one',
    status: 'running',
    resultReference: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const reply: InterAgentReply = {
    contractVersion: 1,
    id: '55555555-5555-4555-8555-555555555555',
    userId,
    requestId,
    managerCode: 'travel',
    kind: 'completed',
    output: { recommendation: 'Option A' },
    resultReference: '66666666-6666-4666-8666-666666666666',
    evidenceReferenceIds: [],
    createdAt: timestamp,
    correlationId,
  };

  await expect(
    completeInterAgentRequest({ request, reply, persistence: store, now: () => timestamp }),
  ).resolves.toEqual({
    sourceRunId: runId,
  });
  expect(store.completeAndResume).toHaveBeenCalledWith({
    request,
    reply,
    status: 'completed',
    completedAt: timestamp,
  });
  await expect(
    completeInterAgentRequest({
      request,
      reply: { ...reply, managerCode: 'finance' },
      persistence: store,
    }),
  ).rejects.toThrow('inter_agent_reply_owner_mismatch');
  expect(store.completeAndResume).toHaveBeenCalledTimes(1);
});
