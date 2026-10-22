import { managerCodeSchema } from '@ai-operations/contracts';
import type { DelegationRpcClient } from './delegation-persistence.ts';
import type { ConversationHandoffPersistence } from './handoff-runtime.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwPersistenceFailure(error: unknown): never {
  // Avoid returning database details that may include user content.
  void error;
  throw new Error('conversation_handoff_persistence_failed');
}

export function createConversationHandoffPersistence(
  client: DelegationRpcClient,
): ConversationHandoffPersistence {
  return {
    async createRequestedHandoff(input) {
      const result = await client.rpc('create_conversation_handoff', {
        p_handoff: input.handoff,
      }).catch(throwPersistenceFailure);
      if (result.error) throwPersistenceFailure(result.error);
      if (
        !isRecord(result.data) ||
        typeof result.data.handoffId !== 'string' ||
        typeof result.data.duplicate !== 'boolean'
      ) {
        throw new Error('conversation_handoff_persistence_response_invalid');
      }
      return { handoffId: result.data.handoffId, duplicate: result.data.duplicate };
    },
    async resolveHandoff(input) {
      const result = await client.rpc('resolve_conversation_handoff', {
        p_handoff_id: input.handoffId,
        p_user_id: input.userId,
        p_status: input.status,
        p_actor_manager_code: input.actorManagerCode,
        p_correlation_id: input.correlationId,
        p_transitioned_at: input.transitionedAt,
      }).catch(throwPersistenceFailure);
      if (result.error) throwPersistenceFailure(result.error);
      if (!isRecord(result.data)) {
        throw new Error('conversation_handoff_persistence_response_invalid');
      }
      const manager = managerCodeSchema.safeParse(result.data.currentManagerCode);
      if (
        typeof result.data.conversationId !== 'string' ||
        !manager.success
      ) {
        throw new Error('conversation_handoff_persistence_response_invalid');
      }
      return {
        conversationId: result.data.conversationId,
        currentManagerCode: manager.data,
      };
    },
  };
}
