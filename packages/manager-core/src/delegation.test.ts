import { expect, it } from 'vitest';
import { MAX_INTER_AGENT_REQUEST_DEPTH, planInterAgentDelegation } from './delegation';

const base = {
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sourceRunId: '11111111-1111-4111-8111-111111111111',
  sourceMessageId: '22222222-2222-4222-8222-222222222222',
  sourceManagerCode: 'personal' as const,
  destinationManagerCode: 'travel' as const,
  destinationWorkflowCode: 'travel-on-demand-plan',
  objective: 'Plan a bounded trip comparison',
  requiredOutputContract: {
    type: 'object',
    required: ['totalMinor'],
    properties: { totalMinor: { type: 'integer' } },
  },
  contextEvidenceIds: ['33333333-3333-4333-8333-333333333333'],
  routingPath: ['personal'] as const,
};

it('plans a deterministic first hop without forcing a Planner origin', async () => {
  const directSpecialist = await planInterAgentDelegation({
    request: {
      ...base,
      sourceManagerCode: 'travel',
      destinationManagerCode: 'finance',
      destinationWorkflowCode: 'finance-on-demand-plan',
    },
    routingPath: ['travel'],
  });

  expect(directSpecialist).toMatchObject({
    delegationDepth: 1,
    routingPath: ['travel', 'finance'],
    idempotencyKey: expect.stringMatching(/^a2a:v1:[a-f0-9]{64}$/),
  });
});

it('rejects self-routing, a repeated owner, invalid ownership and excessive depth', async () => {
  await expect(
    planInterAgentDelegation({
      request: { ...base, destinationManagerCode: 'personal' },
      routingPath: base.routingPath,
    }),
  ).rejects.toMatchObject({ code: 'inter_agent_request_self_route' });
  await expect(
    planInterAgentDelegation({
      request: { ...base, sourceManagerCode: 'travel', destinationManagerCode: 'personal' },
      routingPath: ['personal', 'travel'],
    }),
  ).rejects.toMatchObject({ code: 'inter_agent_request_cycle_detected' });
  await expect(
    planInterAgentDelegation({
      request: { ...base, sourceManagerCode: 'travel' },
      routingPath: base.routingPath,
    }),
  ).rejects.toMatchObject({ code: 'inter_agent_routing_owner_mismatch' });
  await expect(
    planInterAgentDelegation({
      request: { ...base, destinationManagerCode: 'career', sourceManagerCode: 'procurement' },
      routingPath: ['personal', 'travel', 'finance', 'systems', 'procurement'],
    }),
  ).rejects.toMatchObject({ code: 'inter_agent_request_depth_exceeded' });
  await expect(
    planInterAgentDelegation({
      request: { ...base, sourceRunId: null, sourceMessageId: null },
      routingPath: base.routingPath,
    }),
  ).rejects.toMatchObject({ code: 'inter_agent_request_origin_missing' });
  expect(MAX_INTER_AGENT_REQUEST_DEPTH).toBe(4);
});

it('deduplicates equivalent requests and changes the key for a new source run', async () => {
  const first = await planInterAgentDelegation({ request: base, routingPath: base.routingPath });
  const sameRequest = await planInterAgentDelegation({
    request: {
      ...base,
      objective: '  PLAN   a bounded trip comparison ',
      requiredOutputContract: {
        properties: { totalMinor: { type: 'integer' } },
        required: ['totalMinor'],
        type: 'object',
      },
      contextEvidenceIds: [...base.contextEvidenceIds, ...base.contextEvidenceIds],
    },
    routingPath: base.routingPath,
  });
  const newRun = await planInterAgentDelegation({
    request: { ...base, sourceRunId: '44444444-4444-4444-8444-444444444444' },
    routingPath: base.routingPath,
  });

  expect(sameRequest.idempotencyKey).toBe(first.idempotencyKey);
  expect(newRun.idempotencyKey).not.toBe(first.idempotencyKey);
});

it('requires an explicit destination workflow code', async () => {
  await expect(
    planInterAgentDelegation({
      request: { ...base, destinationWorkflowCode: '  ' },
      routingPath: base.routingPath,
    }),
  ).rejects.toMatchObject({ code: 'inter_agent_destination_workflow_required' });
});
