import { expect, it, vi } from 'vitest';
import type { ConversationHandoff } from '@ai-operations/contracts';
import {
  requestConversationHandoff,
  resolveConversationHandoff,
  type ConversationHandoffPersistence,
} from './handoff-runtime';

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

function persistence() {
  const createRequestedHandoff = vi.fn<ConversationHandoffPersistence['createRequestedHandoff']>(
    ({ handoff: request }) => Promise.resolve({ handoffId: request.id, duplicate: false }),
  );
  const resolveHandoff = vi.fn<ConversationHandoffPersistence['resolveHandoff']>(
    ({ status }) => Promise.resolve({
      conversationId: handoff.conversationId,
      currentManagerCode: status === 'accepted' ? 'travel' : 'personal',
    }),
  );
  return { createRequestedHandoff, resolveHandoff } satisfies ConversationHandoffPersistence;
}

it('persists an explicit handoff request with its initial event only after route authorization', async () => {
  const store = persistence();
  const authorizer = { canTransferOwnership: vi.fn(() => Promise.resolve(true)) };

  await expect(requestConversationHandoff({
    handoff,
    authorizer,
    persistence: store,
  })).resolves.toEqual({ handoffId: handoff.id, duplicate: false });
  expect(authorizer.canTransferOwnership).toHaveBeenCalledWith('personal', 'travel');
  expect(store.createRequestedHandoff).toHaveBeenCalledWith(expect.objectContaining({
    handoff,
    event: expect.objectContaining({
      handoffId: handoff.id,
      status: 'requested',
      actorManagerCode: 'personal',
      correlationId: handoff.correlationId,
    }),
  }));

  const denied = persistence();
  await expect(requestConversationHandoff({
    handoff,
    authorizer: { canTransferOwnership: () => Promise.resolve(false) },
    persistence: denied,
  })).rejects.toThrow('conversation_handoff_capability_missing');
  expect(denied.createRequestedHandoff).not.toHaveBeenCalled();
});

it('changes conversation ownership only when the destination manager accepts', async () => {
  const store = persistence();

  await expect(resolveConversationHandoff({
    handoff,
    status: 'accepted',
    actorManagerCode: 'travel',
    persistence: store,
    now: () => '2026-10-21T12:01:00.000Z',
  })).resolves.toEqual({ conversationId: handoff.conversationId, currentManagerCode: 'travel' });
  expect(store.resolveHandoff).toHaveBeenCalledWith({
    handoffId: handoff.id,
    userId: handoff.userId,
    status: 'accepted',
    actorManagerCode: 'travel',
    correlationId: handoff.correlationId,
    transitionedAt: '2026-10-21T12:01:00.000Z',
  });
  await expect(resolveConversationHandoff({
    handoff,
    status: 'accepted',
    actorManagerCode: 'personal',
    persistence: store,
  })).rejects.toThrow('conversation_handoff_acceptor_mismatch');
  await expect(resolveConversationHandoff({
    handoff: { ...handoff, status: 'accepted', acceptedAt: '2026-10-21T12:01:00.000Z' },
    status: 'accepted',
    actorManagerCode: 'travel',
    persistence: store,
  })).rejects.toThrow('conversation_handoff_transition_invalid');
  expect(store.resolveHandoff).toHaveBeenCalledTimes(1);
});
