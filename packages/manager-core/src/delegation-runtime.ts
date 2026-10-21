import {
  canTransitionInterAgentRequest,
  interAgentReplySchema,
  interAgentRequestSchema,
  type InterAgentReply,
  type InterAgentRequest,
  type InterAgentRequestStatus,
  type ManagerCode,
} from '@ai-operations/contracts';
import {
  interAgentCostRootRunId,
  planInterAgentDelegation,
  type InterAgentDelegationPlan,
  type InterAgentRequestIntent,
  type InterAgentSourceRunLineage,
} from './delegation';

type InterAgentRequestDraft = InterAgentRequestIntent &
  Pick<InterAgentRequest, 'priority' | 'deadlineAt' | 'correlationId'>;

export interface InterAgentDelegationPersistence {
  /** Atomically persists the request, specialist run, and queue job; retries use the request key. */
  createAndQueueRequest(
    input: Readonly<{
      request: InterAgentRequest;
      plan: InterAgentDelegationPlan;
      costRootRunId: string | null;
    }>,
  ): Promise<Readonly<{ requestId: string; destinationRunId: string; duplicate: boolean }>>;
  /** Atomically appends the reply, completes the request, and resumes the initiating run. */
  completeAndResume(
    input: Readonly<{
      request: InterAgentRequest;
      reply: InterAgentReply;
      status: Extract<InterAgentRequestStatus, 'completed' | 'rejected' | 'failed'>;
      completedAt: string;
    }>,
  ): Promise<Readonly<{ sourceRunId: string | null }>>;
}

export async function createAndQueueInterAgentRequest(
  input: Readonly<{
    request: InterAgentRequestDraft;
    routingPath: readonly ManagerCode[];
    sourceRunLineage?: InterAgentSourceRunLineage;
    persistence: InterAgentDelegationPersistence;
    newId?: () => string;
    now?: () => string;
  }>,
): Promise<
  Readonly<{
    request: InterAgentRequest;
    destinationRunId: string;
    duplicate: boolean;
  }>
> {
  const plan = await planInterAgentDelegation({
    request: input.request,
    routingPath: input.routingPath,
  });
  const timestamp = (input.now ?? (() => new Date().toISOString()))();
  const request = interAgentRequestSchema.parse({
    ...input.request,
    contractVersion: 1,
    id: (input.newId ?? (() => crypto.randomUUID()))(),
    idempotencyKey: plan.idempotencyKey,
    status: 'requested',
    resultReference: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  let costRootRunId: string | null = null;
  if (request.sourceRunId !== null) {
    if (input.sourceRunLineage === undefined) {
      throw new Error('inter_agent_source_run_lineage_missing');
    }
    if (input.sourceRunLineage.id !== request.sourceRunId) {
      throw new Error('inter_agent_source_run_lineage_mismatch');
    }
    costRootRunId = interAgentCostRootRunId(input.sourceRunLineage);
  }
  const persisted = await input.persistence.createAndQueueRequest({ request, plan, costRootRunId });
  return {
    request,
    destinationRunId: persisted.destinationRunId,
    duplicate: persisted.duplicate,
  };
}

export async function completeInterAgentRequest(
  input: Readonly<{
    request: InterAgentRequest;
    reply: InterAgentReply;
    persistence: InterAgentDelegationPersistence;
    now?: () => string;
  }>,
): Promise<Readonly<{ sourceRunId: string | null }>> {
  const request = interAgentRequestSchema.parse(input.request);
  const reply = interAgentReplySchema.parse(input.reply);
  if (request.status !== 'running') throw new Error('inter_agent_request_not_running');
  if (reply.requestId !== request.id || reply.userId !== request.userId) {
    throw new Error('inter_agent_reply_request_mismatch');
  }
  if (reply.managerCode !== request.destinationManagerCode) {
    throw new Error('inter_agent_reply_owner_mismatch');
  }
  const status = reply.kind === 'completed' ? 'completed' : reply.kind;
  if (!canTransitionInterAgentRequest(request.status, status)) {
    throw new Error('inter_agent_request_transition_invalid');
  }
  return await input.persistence.completeAndResume({
    request,
    reply,
    status,
    completedAt: (input.now ?? (() => new Date().toISOString()))(),
  });
}
