import { z } from 'zod';
import {
  managerCapabilityCodeSchema,
  managerCodeSchema,
  managerPermissionSchema,
  managerRiskClassSchema,
  type ManagerCapabilityCode,
  type ManagerCode,
  type ManagerPermission,
  type ManagerRiskClass,
} from './agents.ts';
import { conversationChannelSchema } from './conversations.ts';
import { approvalStateSchema, executionAuthoritySchema } from './execution.ts';

export const canonicalActionTypeSchema = z.enum([
  'google_calendar_event_create',
  'google_calendar_event_update',
  'google_calendar_event_delete',
  'google_task_create',
  'google_task_update',
  'google_task_complete',
  'google_task_delete',
  'local_worker_manifest_mutation',
  'review_prompt_promotion',
  'financial_transaction_execute',
  'investment_execution',
  'travel_booking_execute',
  'product_purchase_execute',
  'unsupported_professional_outreach',
]);

export type CanonicalActionType = z.infer<typeof canonicalActionTypeSchema>;

export const canonicalActionStateSchema = z.enum([
  'proposed',
  'awaiting_approval',
  'approved',
  'rejected',
  'queued',
  'executing',
  'waiting_for_dependency',
  'succeeded',
  'partially_succeeded',
  'failed',
  'cancelled',
  'expired',
  'reversible',
  'reversed',
  'closed',
]);

export type CanonicalActionState = z.infer<typeof canonicalActionStateSchema>;

export const canonicalActionReceiptKindSchema = z.enum([
  'accepted',
  'waiting_for_dependency',
  'succeeded',
  'partially_succeeded',
  'failed',
  'rejected',
  'cancelled',
  'expired',
  'too_late_to_cancel',
  'reversed',
]);

export type CanonicalActionReceiptKind = z.infer<typeof canonicalActionReceiptKindSchema>;

const actionUuidSchema = z.string().uuid();
const actionTimestampSchema = z.string().datetime({ offset: true });
const actionIdempotencyKeySchema = z.string().trim().min(8).max(255);
const actionFingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const canonicalActionReceiptSchema = z
  .object({
    contractVersion: z.literal(1),
    id: actionUuidSchema,
    userId: actionUuidSchema,
    executionRequestId: actionUuidSchema,
    actionId: actionUuidSchema.nullable(),
    actionType: canonicalActionTypeSchema,
    authority: executionAuthoritySchema,
    channel: conversationChannelSchema,
    policyDecision: z.enum(['allow', 'approval_required', 'reauth_required', 'deny']),
    policyReason: z.enum([
      'verified_user_authority',
      'approved_agent_proposal',
      'preauthorized_low_risk_action',
      'agent_proposal_requires_approval',
      'web_action_requires_fresh_aal2',
      'unsupported_action_type',
      'prohibited_action',
      'manager_not_authorized',
      'capability_not_granted',
      'permission_not_granted',
      'approval_rejected',
      'approval_expired',
      'approval_contract_invalid',
      'standing_policy_not_authorized',
      'authority_channel_mismatch',
    ]),
    kind: z.enum(['waiting_for_dependency', 'succeeded', 'partially_succeeded', 'failed']),
    summary: z.string().trim().min(1).max(2000),
    resultReference: z.string().trim().min(1).max(512).nullable(),
    changedReferences: z.array(z.string().trim().min(1).max(512)),
    errorCode: z.string().trim().min(1).max(100).nullable(),
    redactedError: z.string().trim().min(1).max(2000).nullable(),
    reversalToken: z.string().trim().min(1).max(512).nullable(),
    idempotencyKey: actionIdempotencyKeySchema,
    requestFingerprint: actionFingerprintSchema,
    correlationId: actionUuidSchema,
    attempt: z.number().int().positive(),
    createdAt: actionTimestampSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.kind === 'failed' && receipt.errorCode === null) {
      context.addIssue({
        code: 'custom',
        message: 'failed_canonical_action_receipt_requires_error_code',
        path: ['errorCode'],
      });
    }
    if (receipt.policyDecision !== 'allow') {
      context.addIssue({
        code: 'custom',
        message: 'executed_receipt_requires_allowed_policy',
        path: ['policyDecision'],
      });
    }
    if (receipt.kind === 'failed' && receipt.changedReferences.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'failed_action_receipt_cannot_claim_changes',
        path: ['changedReferences'],
      });
    }
  });

export type CanonicalActionReceipt = z.infer<typeof canonicalActionReceiptSchema>;

export const canonicalActionReceiptDraftSchema = canonicalActionReceiptSchema.omit({
  id: true,
  createdAt: true,
});
export type CanonicalActionReceiptDraft = z.infer<typeof canonicalActionReceiptDraftSchema>;

export const canonicalActionExecutionIdentitySchema = z
  .object({
    userId: actionUuidSchema,
    executionRequestId: actionUuidSchema,
    idempotencyKey: actionIdempotencyKeySchema,
    requestFingerprint: actionFingerprintSchema,
  })
  .strict();
export type CanonicalActionExecutionIdentity = z.infer<
  typeof canonicalActionExecutionIdentitySchema
>;

const actionTransitions: Readonly<Record<CanonicalActionState, readonly CanonicalActionState[]>> = {
  proposed: ['awaiting_approval', 'approved', 'rejected', 'queued', 'cancelled', 'expired'],
  awaiting_approval: ['approved', 'rejected', 'cancelled', 'expired'],
  approved: ['queued', 'cancelled', 'expired'],
  rejected: [],
  queued: ['executing', 'waiting_for_dependency', 'cancelled', 'expired', 'failed'],
  executing: ['waiting_for_dependency', 'succeeded', 'partially_succeeded', 'failed', 'cancelled'],
  waiting_for_dependency: ['queued', 'executing', 'failed', 'cancelled', 'expired'],
  succeeded: ['reversible', 'closed'],
  partially_succeeded: ['reversible', 'closed'],
  failed: ['closed'],
  cancelled: [],
  expired: [],
  reversible: ['reversed', 'closed'],
  reversed: ['closed'],
  closed: [],
};

export function canTransitionCanonicalAction(
  from: CanonicalActionState,
  to: CanonicalActionState,
): boolean {
  return actionTransitions[from].includes(to);
}

export type CanonicalActionPolicyDefinition = Readonly<{
  managerCode: ManagerCode;
  requiredCapability: ManagerCapabilityCode;
  requiredPermissions: readonly ManagerPermission[];
  minimumRisk: ManagerRiskClass;
  allowsStandingPolicy: boolean;
  requiresFreshWebAal2: boolean;
  reversible: boolean;
}>;

const actionDefinitions: Readonly<
  Partial<Record<CanonicalActionType, CanonicalActionPolicyDefinition>>
> = {
  google_calendar_event_create: {
    managerCode: 'personal',
    requiredCapability: 'calendar_write',
    requiredPermissions: ['write', 'execute'],
    minimumRisk: 'medium',
    allowsStandingPolicy: false,
    requiresFreshWebAal2: false,
    reversible: true,
  },
  google_calendar_event_update: {
    managerCode: 'personal',
    requiredCapability: 'calendar_write',
    requiredPermissions: ['write', 'execute'],
    minimumRisk: 'medium',
    allowsStandingPolicy: false,
    requiresFreshWebAal2: false,
    reversible: true,
  },
  google_calendar_event_delete: {
    managerCode: 'personal',
    requiredCapability: 'calendar_write',
    requiredPermissions: ['write', 'execute'],
    minimumRisk: 'high',
    allowsStandingPolicy: false,
    requiresFreshWebAal2: false,
    reversible: true,
  },
  google_task_create: {
    managerCode: 'personal',
    requiredCapability: 'reminder_write',
    requiredPermissions: ['write', 'execute'],
    minimumRisk: 'low',
    allowsStandingPolicy: true,
    requiresFreshWebAal2: false,
    reversible: true,
  },
  google_task_update: {
    managerCode: 'personal',
    requiredCapability: 'reminder_write',
    requiredPermissions: ['write', 'execute'],
    minimumRisk: 'medium',
    allowsStandingPolicy: false,
    requiresFreshWebAal2: false,
    reversible: true,
  },
  google_task_complete: {
    managerCode: 'personal',
    requiredCapability: 'reminder_write',
    requiredPermissions: ['write', 'execute'],
    minimumRisk: 'low',
    allowsStandingPolicy: true,
    requiresFreshWebAal2: false,
    reversible: true,
  },
  google_task_delete: {
    managerCode: 'personal',
    requiredCapability: 'reminder_write',
    requiredPermissions: ['write', 'execute'],
    minimumRisk: 'high',
    allowsStandingPolicy: false,
    requiresFreshWebAal2: false,
    reversible: true,
  },
  local_worker_manifest_mutation: {
    managerCode: 'digital_estate',
    requiredCapability: 'windows_worker_mutation',
    requiredPermissions: ['execute'],
    minimumRisk: 'critical',
    allowsStandingPolicy: false,
    requiresFreshWebAal2: true,
    reversible: true,
  },
  review_prompt_promotion: {
    managerCode: 'systems',
    requiredCapability: 'prompt_model_config',
    requiredPermissions: ['write', 'execute'],
    minimumRisk: 'high',
    allowsStandingPolicy: false,
    requiresFreshWebAal2: false,
    reversible: true,
  },
};

const prohibitedActionTypes = new Set<CanonicalActionType>([
  'financial_transaction_execute',
  'investment_execution',
  'travel_booking_execute',
  'product_purchase_execute',
  'unsupported_professional_outreach',
]);

export const canonicalActionPolicyInputSchema = z
  .object({
    actionType: z.string().trim().min(1).max(100),
    managerCode: managerCodeSchema,
    authority: executionAuthoritySchema,
    channel: conversationChannelSchema,
    riskClass: managerRiskClassSchema,
    capabilities: z.array(managerCapabilityCodeSchema),
    permissions: z.array(managerPermissionSchema),
    approvalState: approvalStateSchema,
    freshWebAal2: z.boolean(),
    standingPolicyPreauthorized: z.boolean(),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.capabilities).size !== input.capabilities.length) {
      context.addIssue({
        code: 'custom',
        message: 'canonical_action_capabilities_must_be_unique',
        path: ['capabilities'],
      });
    }
    if (new Set(input.permissions).size !== input.permissions.length) {
      context.addIssue({
        code: 'custom',
        message: 'canonical_action_permissions_must_be_unique',
        path: ['permissions'],
      });
    }
  });

export type CanonicalActionPolicyInput = z.infer<typeof canonicalActionPolicyInputSchema>;

export const canonicalActionPolicyDecisionSchema = z.enum([
  'allow',
  'approval_required',
  'reauth_required',
  'deny',
]);

export const canonicalActionPolicyReasonSchema = z.enum([
  'verified_user_authority',
  'approved_agent_proposal',
  'preauthorized_low_risk_action',
  'agent_proposal_requires_approval',
  'web_action_requires_fresh_aal2',
  'unsupported_action_type',
  'prohibited_action',
  'manager_not_authorized',
  'capability_not_granted',
  'permission_not_granted',
  'approval_rejected',
  'approval_expired',
  'approval_contract_invalid',
  'standing_policy_not_authorized',
  'authority_channel_mismatch',
]);

export const canonicalActionPolicyResultSchema = z
  .object({
    policyVersion: z.literal(1),
    actionType: z.string().trim().min(1).max(100),
    decision: canonicalActionPolicyDecisionSchema,
    reason: canonicalActionPolicyReasonSchema,
    effectiveRisk: managerRiskClassSchema.nullable(),
    requiredCapability: managerCapabilityCodeSchema.nullable(),
    requiredPermissions: z.array(managerPermissionSchema),
    approvalRequired: z.boolean(),
    freshWebAal2Required: z.boolean(),
    reversible: z.boolean(),
  })
  .strict();

export type CanonicalActionPolicyResult = z.infer<typeof canonicalActionPolicyResultSchema>;

const riskRank: Readonly<Record<ManagerRiskClass, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function higherRisk(a: ManagerRiskClass, b: ManagerRiskClass): ManagerRiskClass {
  return riskRank[a] >= riskRank[b] ? a : b;
}

function result(
  input: CanonicalActionPolicyInput,
  definition: CanonicalActionPolicyDefinition | undefined,
  decision: CanonicalActionPolicyResult['decision'],
  reason: CanonicalActionPolicyResult['reason'],
  effectiveRisk: ManagerRiskClass | null = definition
    ? higherRisk(definition.minimumRisk, input.riskClass)
    : null,
): CanonicalActionPolicyResult {
  return canonicalActionPolicyResultSchema.parse({
    policyVersion: 1,
    actionType: input.actionType,
    decision,
    reason,
    effectiveRisk,
    requiredCapability: definition?.requiredCapability ?? null,
    requiredPermissions: definition ? [...definition.requiredPermissions] : [],
    approvalRequired: decision === 'approval_required',
    freshWebAal2Required: decision === 'reauth_required',
    reversible: definition?.reversible ?? false,
  });
}

/**
 * Evaluates only trusted, typed action metadata. Free-text content is deliberately
 * absent: authority comes from the authenticated channel and the action manifest.
 */
export function evaluateCanonicalActionPolicy(
  untrustedInput: CanonicalActionPolicyInput,
): CanonicalActionPolicyResult {
  const input = canonicalActionPolicyInputSchema.parse(untrustedInput);
  const actionType = canonicalActionTypeSchema.safeParse(input.actionType);
  if (!actionType.success) {
    return result(input, undefined, 'deny', 'unsupported_action_type');
  }
  if (prohibitedActionTypes.has(actionType.data)) {
    return result(input, undefined, 'deny', 'prohibited_action');
  }

  const definition = actionDefinitions[actionType.data];
  if (!definition) {
    return result(input, undefined, 'deny', 'unsupported_action_type');
  }
  if (input.managerCode !== definition.managerCode) {
    return result(input, definition, 'deny', 'manager_not_authorized');
  }
  if (!input.capabilities.includes(definition.requiredCapability)) {
    return result(input, definition, 'deny', 'capability_not_granted');
  }
  if (
    !definition.requiredPermissions.every((permission) => input.permissions.includes(permission))
  ) {
    return result(input, definition, 'deny', 'permission_not_granted');
  }

  if (input.authority === 'verified_user' && input.channel === 'internal') {
    return result(input, definition, 'deny', 'authority_channel_mismatch');
  }

  if (input.authority === 'verified_user') {
    if (input.approvalState !== 'not_required') {
      return result(input, definition, 'deny', 'approval_contract_invalid');
    }
    if (input.channel === 'web_chat' && definition.requiresFreshWebAal2 && !input.freshWebAal2) {
      return result(input, definition, 'reauth_required', 'web_action_requires_fresh_aal2');
    }
    return result(input, definition, 'allow', 'verified_user_authority');
  }

  if (input.authority === 'agent_proposal') {
    if (input.approvalState === 'rejected' || input.approvalState === 'invalidated') {
      return result(input, definition, 'deny', 'approval_rejected');
    }
    if (input.approvalState === 'expired') {
      return result(input, definition, 'deny', 'approval_expired');
    }
    if (input.approvalState === 'not_required') {
      return result(input, definition, 'deny', 'approval_contract_invalid');
    }
    if (input.approvalState !== 'approved') {
      return result(input, definition, 'approval_required', 'agent_proposal_requires_approval');
    }
    return result(input, definition, 'allow', 'approved_agent_proposal');
  }

  if (
    input.channel !== 'internal' ||
    input.approvalState !== 'not_required' ||
    !input.standingPolicyPreauthorized ||
    !definition.allowsStandingPolicy ||
    higherRisk(definition.minimumRisk, input.riskClass) !== 'low'
  ) {
    return result(input, definition, 'deny', 'standing_policy_not_authorized');
  }
  return result(input, definition, 'allow', 'preauthorized_low_risk_action');
}

export const canonicalActionPreconditionResultSchema = z.discriminatedUnion('ready', [
  z
    .object({
      ready: z.literal(true),
      currentStateToken: z.string().trim().min(1).max(512),
      checkedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      ready: z.literal(false),
      reason: z.enum(['precondition_failed', 'dependency_unavailable', 'target_unsupported']),
    })
    .strict(),
]);

export type CanonicalActionPreconditionResult = z.infer<
  typeof canonicalActionPreconditionResultSchema
>;

export const canonicalActionAdapterOutcomeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('succeeded'),
      summary: z.string().trim().min(1).max(2000),
      resultReference: z.string().trim().min(1).max(512).nullable(),
      changedReferences: z.array(z.string().trim().min(1).max(512)),
      reversalToken: z.string().trim().min(1).max(512).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('partially_succeeded'),
      summary: z.string().trim().min(1).max(2000),
      resultReference: z.string().trim().min(1).max(512).nullable(),
      changedReferences: z.array(z.string().trim().min(1).max(512)),
      errorCode: z.string().trim().min(1).max(100),
      redactedError: z.string().trim().min(1).max(2000).nullable(),
      reversalToken: z.string().trim().min(1).max(512).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('failed'),
      summary: z.string().trim().min(1).max(2000),
      resultReference: z.null(),
      changedReferences: z.array(z.string().trim().min(1).max(512)).length(0),
      errorCode: z.string().trim().min(1).max(100),
      redactedError: z.string().trim().min(1).max(2000).nullable(),
      reversalToken: z.null(),
    })
    .strict(),
]);

export type CanonicalActionAdapterOutcome = z.infer<typeof canonicalActionAdapterOutcomeSchema>;

export type CanonicalActionAdapterContext = Readonly<{
  actionId: string | null;
  executionRequestId: string;
  idempotencyKey: string;
  correlationId: string;
  attempt: number;
}>;

export type CanonicalActionAdapterExecutionContext = CanonicalActionAdapterContext &
  Readonly<{ currentStateToken: string }>;

export const canonicalActionAdapterContextSchema = z
  .object({
    actionId: actionUuidSchema.nullable(),
    executionRequestId: actionUuidSchema,
    idempotencyKey: actionIdempotencyKeySchema,
    correlationId: actionUuidSchema,
    attempt: z.number().int().positive(),
  })
  .strict();

export type CanonicalActionAdapterReversalContext = CanonicalActionAdapterExecutionContext &
  Readonly<{ originalReceiptId: string }>;

export interface CanonicalActionAdapter<TPayloadSchema extends z.ZodType = z.ZodType> {
  readonly adapterCode: string;
  readonly actionTypes: readonly CanonicalActionType[];
  readonly payloadSchema: TPayloadSchema;
  checkPreconditions(
    payload: z.infer<TPayloadSchema>,
    context: CanonicalActionAdapterContext,
  ): Promise<CanonicalActionPreconditionResult>;
  execute(
    payload: z.infer<TPayloadSchema>,
    context: CanonicalActionAdapterExecutionContext,
  ): Promise<CanonicalActionAdapterOutcome>;
  checkReversalPreconditions?(
    payload: z.infer<TPayloadSchema>,
    originalOutcome: CanonicalActionAdapterOutcome,
    context: CanonicalActionAdapterContext,
  ): Promise<CanonicalActionPreconditionResult>;
  reverse?(
    payload: z.infer<TPayloadSchema>,
    originalOutcome: CanonicalActionAdapterOutcome,
    context: CanonicalActionAdapterReversalContext,
  ): Promise<CanonicalActionAdapterOutcome>;
}
