import { expect, it, vi } from 'vitest';
import { createConversationHandoffPersistence } from './handoff-persistence';
import type { ConversationHandoff } from '@ai-operations/contracts';

const handoff: ConversationHandoff = {
  contractVersion: 1,
  id: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  fromManagerCode: 'personal',
  toManagerCode: 'travel',
  reason: 'Travel owns the domain judgement for this request.',
  sourceMessageId: '33333333-3333-4333-8333-333333333333',
  status: 'requested',
  initiatedAt: '2026-10-21T12:00:00.000Z',
  acceptedAt: null,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'handoff:conversation:owner:travel',
};

it('persists requests and transitions through the canonical handoff RPCs', async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: { handoffId: handoff.id, duplicate: false }, error: null })
    .mockResolvedValueOnce({
      data: { conversationId: handoff.conversationId, currentManagerCode: 'travel' },
      error: null,
    });
  const persistence = createConversationHandoffPersistence({ rpc });

  await expect(
    persistence.createRequestedHandoff({
      handoff,
      event: {
        contractVersion: 1,
        id: '55555555-5555-4555-8555-555555555555',
        handoffId: handoff.id,
        userId: handoff.userId,
        status: 'requested',
        actorManagerCode: handoff.fromManagerCode,
        createdAt: handoff.initiatedAt,
        correlationId: handoff.correlationId,
      },
    }),
  ).resolves.toEqual({ handoffId: handoff.id, duplicate: false });
  await expect(
    persistence.resolveHandoff({
      handoffId: handoff.id,
      userId: handoff.userId,
      status: 'accepted',
      actorManagerCode: 'travel',
      correlationId: handoff.correlationId,
      transitionedAt: '2026-10-21T12:01:00.000Z',
    }),
  ).resolves.toEqual({
    conversationId: handoff.conversationId,
    currentManagerCode: 'travel',
  });

  expect(rpc).toHaveBeenNthCalledWith(1, 'create_conversation_handoff', {
    p_handoff: handoff,
  });
  expect(rpc).toHaveBeenNthCalledWith(2, 'resolve_conversation_handoff', {
    p_handoff_id: handoff.id,
    p_user_id: handoff.userId,
    p_status: 'accepted',
    p_actor_manager_code: 'travel',
    p_correlation_id: handoff.correlationId,
    p_transitioned_at: '2026-10-21T12:01:00.000Z',
  });
});

it('rejects malformed RPC results and sanitizes persistence failures', async () => {
  const invalid = createConversationHandoffPersistence({
    rpc: vi
      .fn()
      .mockResolvedValue({ data: { conversationId: handoff.conversationId }, error: null }),
  });
  await expect(
    invalid.resolveHandoff({
      handoffId: handoff.id,
      userId: handoff.userId,
      status: 'accepted',
      actorManagerCode: 'travel',
      correlationId: handoff.correlationId,
      transitionedAt: handoff.initiatedAt,
    }),
  ).rejects.toThrow('conversation_handoff_persistence_response_invalid');

  const failed = createConversationHandoffPersistence({
    rpc: vi.fn().mockRejectedValue(new Error('sensitive request content')),
  });
  await expect(
    failed.createRequestedHandoff({
      handoff,
      event: {
        contractVersion: 1,
        id: '55555555-5555-4555-8555-555555555555',
        handoffId: handoff.id,
        userId: handoff.userId,
        status: 'requested',
        actorManagerCode: handoff.fromManagerCode,
        createdAt: handoff.initiatedAt,
        correlationId: handoff.correlationId,
      },
    }),
  ).rejects.toThrow('conversation_handoff_persistence_failed');
});
