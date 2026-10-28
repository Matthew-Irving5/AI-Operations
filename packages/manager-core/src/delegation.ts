import type { InterAgentRequest, ManagerCode } from '@ai-operations/contracts';

export const MAX_INTER_AGENT_REQUEST_DEPTH = 4;

export type InterAgentDelegationPlan = Readonly<{
  delegationDepth: number;
  routingPath: readonly ManagerCode[];
  idempotencyKey: string;
}>;

export type InterAgentSourceRunLineage = Readonly<{
  id: string;
  costRootRunId: string | null;
}>;

/** Preserve the initiating on-demand cap when a specialist delegates again. */
export function interAgentCostRootRunId(sourceRun: InterAgentSourceRunLineage): string {
  return sourceRun.costRootRunId ?? sourceRun.id;
}

export type InterAgentRequestIntent = Pick<
  InterAgentRequest,
  | 'userId'
  | 'sourceManagerCode'
  | 'destinationManagerCode'
  | 'destinationWorkflowCode'
  | 'objective'
  | 'requiredOutputContract'
  | 'contextEvidenceIds'
  | 'sourceRunId'
  | 'sourceMessageId'
>;

export class InterAgentRoutingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InterAgentRoutingError';
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new InterAgentRoutingError('inter_agent_request_contract_not_json');
}

function nextRoutingPath(
  path: readonly ManagerCode[],
  destinationManagerCode: ManagerCode,
): readonly ManagerCode[] {
  if (path.length === 0 || new Set(path).size !== path.length) {
    throw new InterAgentRoutingError('inter_agent_routing_path_invalid');
  }
  const sourceManagerCode = path[path.length - 1];
  if (!sourceManagerCode) throw new InterAgentRoutingError('inter_agent_routing_path_invalid');
  if (sourceManagerCode === destinationManagerCode) {
    throw new InterAgentRoutingError('inter_agent_request_self_route');
  }
  if (path.includes(destinationManagerCode)) {
    throw new InterAgentRoutingError('inter_agent_request_cycle_detected');
  }
  if (path.length - 1 >= MAX_INTER_AGENT_REQUEST_DEPTH) {
    throw new InterAgentRoutingError('inter_agent_request_depth_exceeded');
  }
  return [...path, destinationManagerCode];
}

export async function planInterAgentDelegation(
  input: Readonly<{
    request: InterAgentRequestIntent;
    routingPath: readonly ManagerCode[];
  }>,
): Promise<InterAgentDelegationPlan> {
  const request = input.request;
  if (!request.destinationWorkflowCode?.trim()) {
    throw new InterAgentRoutingError('inter_agent_destination_workflow_required');
  }
  if (input.routingPath[input.routingPath.length - 1] !== request.sourceManagerCode) {
    throw new InterAgentRoutingError('inter_agent_routing_owner_mismatch');
  }
  if (request.sourceRunId === null && request.sourceMessageId === null) {
    throw new InterAgentRoutingError('inter_agent_request_origin_missing');
  }
  const routingPath = nextRoutingPath(input.routingPath, request.destinationManagerCode);
  const requestFingerprint = canonicalJson({
    version: 1,
    userId: request.userId,
    sourceRunId: request.sourceRunId,
    sourceMessageId: request.sourceMessageId,
    sourceManagerCode: request.sourceManagerCode,
    destinationManagerCode: request.destinationManagerCode,
    destinationWorkflowCode: request.destinationWorkflowCode.trim(),
    objective: request.objective.trim().replace(/\s+/g, ' ').toLowerCase(),
    requiredOutputContract: request.requiredOutputContract,
    contextEvidenceIds: [...new Set(request.contextEvidenceIds)].sort(),
  });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(requestFingerprint),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return {
    delegationDepth: routingPath.length - 1,
    routingPath,
    idempotencyKey: `a2a:v1:${hash}`,
  };
}
