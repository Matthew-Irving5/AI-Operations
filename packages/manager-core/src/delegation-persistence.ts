import type { InterAgentDelegationPersistence } from './delegation-runtime.ts';

export type DelegationRpcClient = Readonly<{
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<Readonly<{ data: unknown; error: unknown | null }>>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwPersistenceFailure(error: unknown): never {
  // Database errors may contain constraint values or request data. Keep the
  // runtime boundary actionable without returning those details to callers.
  void error;
  throw new Error('inter_agent_persistence_failed');
}

export function createInterAgentDelegationPersistence(
  client: DelegationRpcClient,
): InterAgentDelegationPersistence {
  return {
    async createAndQueueRequest(input) {
      const result = await client.rpc('create_inter_agent_request_run', {
        p_request: input.request,
        p_delegation_depth: input.plan.delegationDepth,
        p_routing_path: input.plan.routingPath,
        p_cost_root_run_id: input.costRootRunId,
      }).catch(throwPersistenceFailure);
      if (result.error) throwPersistenceFailure(result.error);
      if (
        !isRecord(result.data) ||
        typeof result.data.requestId !== 'string' ||
        typeof result.data.destinationRunId !== 'string' ||
        typeof result.data.duplicate !== 'boolean'
      ) {
        throw new Error('inter_agent_persistence_response_invalid');
      }
      return {
        requestId: result.data.requestId,
        destinationRunId: result.data.destinationRunId,
        duplicate: result.data.duplicate,
      };
    },
    async completeAndResume(input) {
      const result = await client.rpc('complete_inter_agent_request', {
        p_request_id: input.request.id,
        p_reply: input.reply,
        p_status: input.status,
        p_completed_at: input.completedAt,
      }).catch(throwPersistenceFailure);
      if (result.error) throwPersistenceFailure(result.error);
      if (!isRecord(result.data)) {
        throw new Error('inter_agent_persistence_response_invalid');
      }
      const sourceRunId = result.data.sourceRunId;
      if (sourceRunId !== null && typeof sourceRunId !== 'string') {
        throw new Error('inter_agent_persistence_response_invalid');
      }
      return { sourceRunId };
    },
  };
}
