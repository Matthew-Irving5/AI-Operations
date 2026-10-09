import { z } from 'zod';
import {
  managerCapabilityCodeSchema,
  managerCodeSchema,
  managerPermissionSchema,
  managerRiskClassSchema,
} from './agents.ts';

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const idempotencyKeySchema = z.string().trim().min(8).max(255);
const objectSchema = z.record(z.string(), z.unknown());

export const approvalStateSchema = z.enum([
  'not_required',
  'pending',
  'approved',
  'rejected',
  'expired',
  'invalidated',
]);

export const actionProposalStatusSchema = z.enum([
  'proposed',
  'awaiting_approval',
  'approved',
  'rejected',
  'queued',
  'running',
  'waiting_for_dependency',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
]);

export const executionRequestStatusSchema = z.enum([
  'received',
  'routed',
  'queued',
  'running',
  'waiting_for_dependency',
  'succeeded',
  'failed',
  'cancelled',
]);

export const executionAuthoritySchema = z.enum([
  'verified_user',
  'agent_proposal',
  'standing_policy',
]);

export const executionMechanismSchema = z.enum([
  'edge_function',
  'worker',
  'provider_api',
  'internal',
]);

export const executionReceiptKindSchema = z.enum([
  'accepted',
  'waiting_for_dependency',
  'succeeded',
  'failed',
  'cancelled',
  'too_late_to_cancel',
]);

export const attentionStatusSchema = z.enum([
  'new',
  'queued_for_planner',
  'incorporated',
  'sent_immediately',
  'dismissed',
  'expired',
  'resolved',
]);

export const attentionUrgencySchema = z.enum(['routine', 'time_sensitive', 'urgent']);

export const interAgentRequestStatusSchema = z.enum([
  'requested',
  'accepted',
  'running',
  'waiting_for_dependency',
  'completed',
  'rejected',
  'failed',
  'cancelled',
]);

export const interAgentReplyKindSchema = z.enum(['completed', 'rejected', 'failed']);

export const workflowRunStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_for_dependency',
  'succeeded',
  'failed',
  'cancelled',
]);

export const workflowStepStatusSchema = workflowRunStatusSchema;

export const actionProposalSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    runId: uuidSchema.nullable(),
    conversationId: uuidSchema.nullable(),
    sourceMessageId: uuidSchema.nullable(),
    managerCode: managerCodeSchema,
    authority: executionAuthoritySchema,
    actionType: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(4000),
    riskClass: managerRiskClassSchema,
    requiredCapability: managerCapabilityCodeSchema.nullable(),
    requiredPermissions: z.array(managerPermissionSchema),
    status: actionProposalStatusSchema,
    approvalState: approvalStateSchema,
    proposedPayload: objectSchema,
    idempotencyKey: idempotencyKeySchema,
    correlationId: uuidSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((action, context) => {
    if (
      action.authority === 'agent_proposal' &&
      ['approved', 'queued', 'running', 'waiting_for_dependency', 'succeeded'].includes(
        action.status,
      ) &&
      action.approvalState !== 'approved'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'agent_proposal_requires_approval_before_execution',
        path: ['approvalState'],
      });
    }
    if (action.authority !== 'agent_proposal' && action.approvalState === 'pending') {
      context.addIssue({
        code: 'custom',
        message: 'non_agent_authority_cannot_wait_for_proposal_approval',
        path: ['approvalState'],
      });
    }
  });

export const executionRequestSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    conversationId: uuidSchema,
    sourceMessageId: uuidSchema,
    actionId: uuidSchema.nullable(),
    workflowRunId: uuidSchema.nullable(),
    approvalId: uuidSchema.nullable(),
    interpretingManagerCode: managerCodeSchema,
    authority: executionAuthoritySchema,
    commandType: z.string().trim().min(1).max(100),
    commandVersion: z.number().int().positive(),
    intent: z.string().trim().min(1).max(4000),
    typedParameters: objectSchema,
    targetType: z.string().trim().min(1).max(100),
    targetReference: z.string().trim().min(1).max(512).nullable(),
    scope: z.string().trim().min(1).max(1000),
    mechanism: executionMechanismSchema,
    requiredCapability: managerCapabilityCodeSchema,
    idempotencyKey: idempotencyKeySchema,
    status: executionRequestStatusSchema,
    attemptCount: z.number().int().nonnegative(),
    dependency: z.string().trim().min(1).max(1000).nullable(),
    resultReference: uuidSchema.nullable(),
    errorCode: z.string().trim().min(1).max(100).nullable(),
    redactedError: z.string().trim().min(1).max(2000).nullable(),
    correlationId: uuidSchema,
    createdAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    cancelledAt: timestampSchema.nullable(),
  })
  .strict();

export const executionReceiptSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    executionRequestId: uuidSchema,
    actionId: uuidSchema.nullable(),
    kind: executionReceiptKindSchema,
    summary: z.string().trim().min(1).max(2000),
    resultReference: uuidSchema.nullable(),
    errorCode: z.string().trim().min(1).max(100).nullable(),
    redactedError: z.string().trim().min(1).max(2000).nullable(),
    idempotencyKey: idempotencyKeySchema,
    correlationId: uuidSchema,
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.kind === 'failed' && receipt.errorCode === null) {
      context.addIssue({
        code: 'custom',
        message: 'failed_execution_receipt_requires_error_code',
        path: ['errorCode'],
      });
    }
  });

export const attentionItemSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    sourceManagerCode: managerCodeSchema,
    itemType: z.string().trim().min(1).max(100),
    finding: z.string().trim().min(1).max(4000),
    recommendedCommunication: z.string().trim().min(1).max(4000),
    recommendedAction: z.string().trim().min(1).max(2000).nullable(),
    priority: z.number().int().min(0).max(4),
    urgency: attentionUrgencySchema,
    deadlineAt: timestampSchema.nullable(),
    expiresAt: timestampSchema.nullable(),
    evidenceReferenceIds: z.array(uuidSchema),
    deduplicationKey: idempotencyKeySchema,
    acknowledgementRequired: z.boolean(),
    status: attentionStatusSchema,
    sourceRunId: uuidSchema.nullable(),
    sourceConversationId: uuidSchema.nullable(),
    createdAt: timestampSchema,
    acknowledgedAt: timestampSchema.nullable(),
    resolvedAt: timestampSchema.nullable(),
    correlationId: uuidSchema,
  })
  .strict()
  .superRefine((attention, context) => {
    if (
      attention.status === 'incorporated' &&
      attention.acknowledgementRequired &&
      !attention.acknowledgedAt
    ) {
      context.addIssue({
        code: 'custom',
        message: 'acknowledgement_required_before_incorporation',
        path: ['acknowledgedAt'],
      });
    }
    if (attention.status === 'resolved' && !attention.resolvedAt) {
      context.addIssue({
        code: 'custom',
        message: 'resolved_attention_requires_timestamp',
        path: ['resolvedAt'],
      });
    }
  });

export const interAgentRequestSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    sourceManagerCode: managerCodeSchema,
    destinationManagerCode: managerCodeSchema,
    objective: z.string().trim().min(1).max(4000),
    requiredOutputContract: objectSchema,
    contextEvidenceIds: z.array(uuidSchema),
    priority: z.number().int().min(0).max(4),
    deadlineAt: timestampSchema.nullable(),
    idempotencyKey: idempotencyKeySchema,
    sourceRunId: uuidSchema.nullable(),
    sourceMessageId: uuidSchema.nullable(),
    status: interAgentRequestStatusSchema,
    resultReference: uuidSchema.nullable(),
    correlationId: uuidSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (request.sourceManagerCode === request.destinationManagerCode) {
      context.addIssue({
        code: 'custom',
        message: 'inter_agent_request_requires_distinct_managers',
        path: ['destinationManagerCode'],
      });
    }
    if (request.status === 'completed' && request.resultReference === null) {
      context.addIssue({
        code: 'custom',
        message: 'completed_inter_agent_request_requires_result',
        path: ['resultReference'],
      });
    }
  });

export const interAgentReplySchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    requestId: uuidSchema,
    managerCode: managerCodeSchema,
    kind: interAgentReplyKindSchema,
    output: objectSchema,
    resultReference: uuidSchema.nullable(),
    evidenceReferenceIds: z.array(uuidSchema),
    createdAt: timestampSchema,
    correlationId: uuidSchema,
  })
  .strict()
  .superRefine((reply, context) => {
    if (reply.kind === 'completed' && reply.resultReference === null) {
      context.addIssue({
        code: 'custom',
        message: 'completed_inter_agent_reply_requires_result',
        path: ['resultReference'],
      });
    }
  });

export const workflowDefinitionReferenceSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    managerCode: managerCodeSchema,
    code: z.string().trim().min(1).max(120),
    version: z.number().int().positive(),
    triggerType: z.string().trim().min(1).max(100),
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    active: z.boolean(),
  })
  .strict();

export const workflowRunStateSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    workflowDefinitionId: uuidSchema,
    managerCode: managerCodeSchema,
    status: workflowRunStatusSchema,
    trigger: z.string().trim().min(1).max(100),
    correlationId: uuidSchema,
    idempotencyKey: idempotencyKeySchema,
    priority: z.number().int().min(0).max(4),
    requestedAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    cancelledAt: timestampSchema.nullable(),
    errorCode: z.string().trim().min(1).max(100).nullable(),
    redactedError: z.string().trim().min(1).max(2000).nullable(),
    reportId: uuidSchema.nullable(),
    budgetReservationId: uuidSchema.nullable(),
  })
  .strict();

export const reportReferenceSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    runId: uuidSchema.nullable(),
    reportType: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(200),
    status: z.enum(['draft', 'validated', 'approved', 'superseded']),
    createdAt: timestampSchema,
  })
  .strict();

export type ApprovalState = z.infer<typeof approvalStateSchema>;
export type ActionProposalStatus = z.infer<typeof actionProposalStatusSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type ExecutionRequestStatus = z.infer<typeof executionRequestStatusSchema>;
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
export type ExecutionReceipt = z.infer<typeof executionReceiptSchema>;
export type AttentionStatus = z.infer<typeof attentionStatusSchema>;
export type AttentionUrgency = z.infer<typeof attentionUrgencySchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type InterAgentRequestStatus = z.infer<typeof interAgentRequestStatusSchema>;
export type InterAgentRequest = z.infer<typeof interAgentRequestSchema>;
export type InterAgentReply = z.infer<typeof interAgentReplySchema>;
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;
export type WorkflowDefinitionReference = z.infer<typeof workflowDefinitionReferenceSchema>;
export type WorkflowRunState = z.infer<typeof workflowRunStateSchema>;
export type ReportReference = z.infer<typeof reportReferenceSchema>;

const actionTransitions: Readonly<Record<ActionProposalStatus, readonly ActionProposalStatus[]>> = {
  proposed: ['awaiting_approval', 'approved', 'rejected', 'queued', 'cancelled', 'expired'],
  awaiting_approval: ['approved', 'rejected', 'cancelled', 'expired'],
  approved: ['queued', 'cancelled', 'expired'],
  rejected: [],
  queued: ['running', 'waiting_for_dependency', 'cancelled', 'failed'],
  running: ['waiting_for_dependency', 'succeeded', 'failed', 'cancelled'],
  waiting_for_dependency: ['queued', 'running', 'cancelled', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

const executionTransitions: Readonly<
  Record<ExecutionRequestStatus, readonly ExecutionRequestStatus[]>
> = {
  received: ['routed', 'cancelled', 'failed'],
  routed: ['queued', 'waiting_for_dependency', 'cancelled', 'failed'],
  queued: ['running', 'waiting_for_dependency', 'cancelled', 'failed'],
  running: ['waiting_for_dependency', 'succeeded', 'failed', 'cancelled'],
  waiting_for_dependency: ['queued', 'running', 'cancelled', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const attentionTransitions: Readonly<Record<AttentionStatus, readonly AttentionStatus[]>> = {
  new: ['queued_for_planner', 'sent_immediately', 'dismissed', 'expired'],
  queued_for_planner: ['incorporated', 'sent_immediately', 'dismissed', 'expired'],
  incorporated: ['resolved', 'dismissed'],
  sent_immediately: ['resolved', 'dismissed'],
  dismissed: [],
  expired: [],
  resolved: [],
};

const interAgentTransitions: Readonly<
  Record<InterAgentRequestStatus, readonly InterAgentRequestStatus[]>
> = {
  requested: ['accepted', 'rejected', 'cancelled', 'failed'],
  accepted: ['running', 'waiting_for_dependency', 'cancelled', 'failed'],
  running: ['waiting_for_dependency', 'completed', 'rejected', 'failed', 'cancelled'],
  waiting_for_dependency: ['accepted', 'running', 'cancelled', 'failed'],
  completed: [],
  rejected: [],
  failed: [],
  cancelled: [],
};

const workflowRunTransitions: Readonly<Record<WorkflowRunStatus, readonly WorkflowRunStatus[]>> = {
  queued: ['running', 'waiting_for_dependency', 'cancelled', 'failed'],
  running: ['waiting_for_dependency', 'succeeded', 'failed', 'cancelled'],
  waiting_for_dependency: ['queued', 'running', 'cancelled', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionActionProposal(
  from: ActionProposalStatus,
  to: ActionProposalStatus,
): boolean {
  return actionTransitions[from].includes(to);
}

export function canTransitionExecutionRequest(
  from: ExecutionRequestStatus,
  to: ExecutionRequestStatus,
): boolean {
  return executionTransitions[from].includes(to);
}

export function canTransitionAttentionItem(from: AttentionStatus, to: AttentionStatus): boolean {
  return attentionTransitions[from].includes(to);
}

export function canTransitionInterAgentRequest(
  from: InterAgentRequestStatus,
  to: InterAgentRequestStatus,
): boolean {
  return interAgentTransitions[from].includes(to);
}

export function canTransitionWorkflowRun(from: WorkflowRunStatus, to: WorkflowRunStatus): boolean {
  return workflowRunTransitions[from].includes(to);
}
