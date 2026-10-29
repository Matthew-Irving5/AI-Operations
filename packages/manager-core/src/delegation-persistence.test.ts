import { expect, it, vi } from 'vitest';
import type { InterAgentReply, InterAgentRequest } from '@ai-operations/contracts';
import { createInterAgentDelegationPersistence } from './delegation-persistence';

const request: InterAgentRequest = {
  contractVersion: 1,
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sourceManagerCode: 'personal',
  destinationManagerCode: 'travel',
  destinationWorkflowCode: 'travel-on-demand-plan',
  objective: 'Compare two trip options.',
  requiredOutputContract: { type: 'object' },
  contextEvidenceIds: [],
  priority: 2,
  deadlineAt: null,
  idempotencyKey: 'a2a:v1:12345678',
  sourceRunId: '22222222-2222-4222-8222-222222222222',
  sourceMessageId: null,
  status: 'requested',
  resultReference: null,
  correlationId: '33333333-3333-4333-8333-333333333333',
  createdAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
};

const reply: InterAgentReply = {
  contractVersion: 1,
  id: '44444444-4444-4444-8444-444444444444',
  userId: request.userId,
  requestId: request.id,
  managerCode: 'travel',
  kind: 'completed',
  output: { summary: 'Option A is preferred.' },
  resultReference: '55555555-5555-4555-8555-555555555555',
  evidenceReferenceIds: [],
  createdAt: '2026-10-21T12:01:00.000Z',
  correlationId: request.correlationId,
};

it('maps request creation to the atomic request/run/queue RPC', async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: {
      requestId: request.id,
      destinationRunId: '66666666-6666-4666-8666-666666666666',
      duplicate: false,
    },
    error: null,
  });
  const persistence = createInterAgentDelegationPersistence({ rpc });
  const plan = {
    delegationDepth: 1,
    routingPath: ['personal', 'travel'] as const,
    idempotencyKey: request.idempotencyKey,
  };

  await expect(
    persistence.createAndQueueRequest({
      request,
      plan,
      costRootRunId: request.sourceRunId,
    }),
  ).resolves.toEqual({
    requestId: request.id,
    destinationRunId: '66666666-6666-4666-8666-666666666666',
    duplicate: false,
  });
  expect(rpc).toHaveBeenCalledWith('create_inter_agent_request_run', {
    p_request: request,
    p_delegation_depth: 1,
    p_routing_path: ['personal', 'travel'],
    p_cost_root_run_id: request.sourceRunId,
  });
});

it('maps completion to the atomic reply-and-resume RPC', async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: { sourceRunId: request.sourceRunId },
    error: null,
  });
  const persistence = createInterAgentDelegationPersistence({ rpc });

  await expect(
    persistence.completeAndResume({
      request: { ...request, status: 'running' },
      reply,
      status: 'completed',
      completedAt: reply.createdAt,
    }),
  ).resolves.toEqual({ sourceRunId: request.sourceRunId });
  expect(rpc).toHaveBeenCalledWith('complete_inter_agent_request', {
    p_request_id: request.id,
    p_reply: reply,
    p_status: 'completed',
    p_completed_at: reply.createdAt,
  });
});

it('does not expose database error details or accept malformed RPC results', async () => {
  const persistenceFailure = createInterAgentDelegationPersistence({
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'private payload' } }),
  });
  await expect(
    persistenceFailure.createAndQueueRequest({
      request,
      plan: {
        delegationDepth: 1,
        routingPath: ['personal', 'travel'],
        idempotencyKey: request.idempotencyKey,
      },
      costRootRunId: request.sourceRunId,
    }),
  ).rejects.toThrow('inter_agent_persistence_failed');
  const malformed = createInterAgentDelegationPersistence({
    rpc: vi.fn().mockResolvedValue({ data: { requestId: request.id }, error: null }),
  });
  await expect(
    malformed.createAndQueueRequest({
      request,
      plan: {
        delegationDepth: 1,
        routingPath: ['personal', 'travel'],
        idempotencyKey: request.idempotencyKey,
      },
      costRootRunId: request.sourceRunId,
    }),
  ).rejects.toThrow('inter_agent_persistence_response_invalid');
});
