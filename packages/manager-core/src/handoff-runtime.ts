import {
  canTransitionConversationHandoff,
  conversationHandoffEventSchema,
  conversationHandoffSchema,
  type ConversationHandoff,
  type ConversationHandoffEvent,
  type ManagerCode,
} from '@ai-operations/contracts';

export interface ConversationHandoffAuthorizer {
  canTransferOwnership(fromManagerCode: ManagerCode, toManagerCode: ManagerCode): Promise<boolean>;
}

export interface ConversationHandoffPersistence {
  /** Writes the requested handoff and its initial event atomically. */
  createRequestedHandoff(
    input: Readonly<{
      handoff: ConversationHandoff;
      event: ConversationHandoffEvent;
    }>,
  ): Promise<Readonly<{ handoffId: string; duplicate: boolean }>>;
  /** Writes the transition/event and changes current ownership on acceptance atomically. */
  resolveHandoff(
    input: Readonly<{
      handoffId: string;
      userId: string;
      status: Extract<ConversationHandoff['status'], 'accepted' | 'rejected' | 'cancelled'>;
      actorManagerCode: ManagerCode;
      correlationId: string;
      transitionedAt: string;
    }>,
  ): Promise<Readonly<{ conversationId: string; currentManagerCode: ManagerCode }>>;
}

export async function requestConversationHandoff(
  input: Readonly<{
    handoff: ConversationHandoff;
    authorizer: ConversationHandoffAuthorizer;
    persistence: ConversationHandoffPersistence;
  }>,
): Promise<Readonly<{ handoffId: string; duplicate: boolean }>> {
  const handoff = conversationHandoffSchema.parse(input.handoff);
  if (handoff.status !== 'requested' || handoff.acceptedAt !== null) {
    throw new Error('conversation_handoff_must_start_requested');
  }
  if (
    !(await input.authorizer.canTransferOwnership(handoff.fromManagerCode, handoff.toManagerCode))
  ) {
    throw new Error('conversation_handoff_capability_missing');
  }
  const event = conversationHandoffEventSchema.parse({
    contractVersion: 1,
    id: crypto.randomUUID(),
    handoffId: handoff.id,
    userId: handoff.userId,
    status: 'requested',
    actorManagerCode: handoff.fromManagerCode,
    createdAt: handoff.initiatedAt,
    correlationId: handoff.correlationId,
  });
  return await input.persistence.createRequestedHandoff({ handoff, event });
}

export async function resolveConversationHandoff(
  input: Readonly<{
    handoff: ConversationHandoff;
    status: Extract<ConversationHandoff['status'], 'accepted' | 'rejected' | 'cancelled'>;
    actorManagerCode: ManagerCode;
    persistence: ConversationHandoffPersistence;
    now?: () => string;
  }>,
): Promise<Readonly<{ conversationId: string; currentManagerCode: ManagerCode }>> {
  const handoff = conversationHandoffSchema.parse(input.handoff);
  if (!canTransitionConversationHandoff(handoff.status, input.status)) {
    throw new Error('conversation_handoff_transition_invalid');
  }
  if (input.status === 'accepted' && input.actorManagerCode !== handoff.toManagerCode) {
    throw new Error('conversation_handoff_acceptor_mismatch');
  }
  if (input.status === 'cancelled' && input.actorManagerCode !== handoff.fromManagerCode) {
    throw new Error('conversation_handoff_canceller_mismatch');
  }
  if (input.status === 'rejected' && input.actorManagerCode !== handoff.toManagerCode) {
    throw new Error('conversation_handoff_rejector_mismatch');
  }
  return await input.persistence.resolveHandoff({
    handoffId: handoff.id,
    userId: handoff.userId,
    status: input.status,
    actorManagerCode: input.actorManagerCode,
    correlationId: handoff.correlationId,
    transitionedAt: (input.now ?? (() => new Date().toISOString()))(),
  });
}
