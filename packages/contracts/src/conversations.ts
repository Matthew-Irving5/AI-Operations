import { z } from 'zod';
import { managerCodeSchema } from './agents.ts';

export const conversationStatusSchema = z.enum(['open', 'closed', 'archived']);
export const conversationChannelSchema = z.enum(['gmail', 'web_chat', 'internal']);
export const conversationOriginChannelSchema = z.enum(['gmail', 'web_chat']);
export const conversationDirectionSchema = z.enum(['inbound', 'outbound', 'internal']);
export const conversationSenderKindSchema = z.enum(['user', 'manager', 'system', 'external']);
export const conversationSemanticTypeSchema = z.enum([
  'statement',
  'request',
  'command',
  'correction',
  'cancellation',
  'clarification',
  'response',
]);
export const conversationAuthoritySchema = z.enum([
  'verified_user',
  'agent_generated',
  'system_generated',
  'external_untrusted',
]);
export const conversationMessageStatusSchema = z.enum([
  'received',
  'queued',
  'routing',
  'processing',
  'processed',
  'failed',
  'ignored',
]);
export const participantKindSchema = z.enum(['user', 'manager', 'external', 'system']);
export const participantRoleSchema = z.enum(['owner', 'member']);
export const attachmentScanStatusSchema = z.enum(['pending', 'clean', 'quarantined', 'failed']);
export const attachmentExtractionStatusSchema = z.enum([
  'pending',
  'complete',
  'failed',
  'unsupported',
]);
export const evidenceRetentionStateSchema = z.enum(['retained', 'quarantined', 'pending_deletion']);
export const conversationHandoffStatusSchema = z.enum([
  'requested',
  'accepted',
  'rejected',
  'cancelled',
]);
export const conversationEntityTypeSchema = z.enum([
  'workflow_run',
  'report',
  'action',
  'execution_request',
  'finance_close',
  'finance_opportunity',
  'travel_trip',
  'travel_watch',
  'procurement_item',
  'health_plan',
  'health_finding',
  'career_project',
  'career_opportunity',
  'career_radar_candidate',
  'digital_finding',
  'digital_plan',
  'planner_commitment',
  'time_block',
  'evidence_reference',
]);

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const extensibleObjectSchema = z.record(z.string(), z.unknown());

export const executionStateSummarySchema = z
  .object({
    state: z.string().trim().min(1).max(80).nullable(),
    activeRunId: uuidSchema.nullable(),
    updatedAt: timestampSchema.nullable(),
  })
  .strict();

export const conversationSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    status: conversationStatusSchema,
    originatingChannel: conversationOriginChannelSchema,
    originatingManagerCode: managerCodeSchema,
    currentManagerCode: managerCodeSchema,
    subject: z.string().trim().min(1).max(998),
    gmailThreadId: z.string().trim().min(1).max(255).nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    lastMessageAt: timestampSchema.nullable(),
    executionStateSummary: executionStateSummarySchema,
    metadata: extensibleObjectSchema,
    correlationId: uuidSchema,
  })
  .strict();

export const conversationMessageStorageRecordSchema = z
  .object({
    contract_version: z.literal(1),
    id: uuidSchema,
    conversation_id: uuidSchema,
    user_id: uuidSchema,
    direction: conversationDirectionSchema,
    sender_kind: conversationSenderKindSchema,
    manager_code: managerCodeSchema.nullable(),
    channel: conversationChannelSchema,
    semantic_type: conversationSemanticTypeSchema,
    authority: conversationAuthoritySchema,
    body_text: z.string().nullable(),
    body_reference: z.string().nullable(),
    body_sha256: sha256Schema,
    gmail_message_id: z.string().nullable(),
    gmail_rfc_message_id: z.string().nullable(),
    gmail_thread_id: z.string().nullable(),
    in_reply_to: z.string().nullable(),
    message_references: z.array(z.string()),
    provider_received_at: timestampSchema.nullable(),
    created_at: timestampSchema,
    deduplication_key: z.string().min(8),
    processing_status: conversationMessageStatusSchema,
    correlation_id: uuidSchema,
  })
  .strict();

export const conversationParticipantSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    conversationId: uuidSchema,
    userId: uuidSchema,
    kind: participantKindSchema,
    role: participantRoleSchema,
    managerCode: managerCodeSchema.nullable(),
    providerActorId: z.string().trim().min(1).max(255).nullable(),
    displayName: z.string().trim().min(1).max(120).nullable(),
    joinedAt: timestampSchema,
    leftAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((participant, context) => {
    if ((participant.kind === 'manager') !== (participant.managerCode !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'manager_participant_requires_manager_code',
        path: ['managerCode'],
      });
    }
    if (participant.kind === 'user' && participant.role !== 'owner') {
      context.addIssue({
        code: 'custom',
        message: 'user_participant_must_own_conversation',
        path: ['role'],
      });
    }
    if (participant.kind !== 'user' && participant.role === 'owner') {
      context.addIssue({
        code: 'custom',
        message: 'only_user_participant_can_own_conversation',
        path: ['role'],
      });
    }
  });

export const conversationMessageSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    conversationId: uuidSchema,
    userId: uuidSchema,
    direction: conversationDirectionSchema,
    senderKind: conversationSenderKindSchema,
    managerCode: managerCodeSchema.nullable(),
    channel: conversationChannelSchema,
    semanticType: conversationSemanticTypeSchema,
    authority: conversationAuthoritySchema,
    bodyText: z.string().nullable(),
    bodyReference: z.string().trim().min(1).max(1000).nullable(),
    bodySha256: sha256Schema,
    gmailMessageId: z.string().trim().min(1).max(255).nullable(),
    gmailRfcMessageId: z.string().trim().min(1).max(998).nullable(),
    gmailThreadId: z.string().trim().min(1).max(255).nullable(),
    inReplyTo: z.string().trim().min(1).max(998).nullable(),
    references: z.array(z.string().trim().min(1).max(998)),
    providerReceivedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    deduplicationKey: z.string().trim().min(8).max(255),
    processingStatus: conversationMessageStatusSchema,
    correlationId: uuidSchema,
  })
  .strict()
  .superRefine((message, context) => {
    if (message.bodyText === null && message.bodyReference === null) {
      context.addIssue({
        code: 'custom',
        message: 'message_body_or_reference_required',
        path: ['bodyText'],
      });
    }
    if ((message.senderKind === 'manager') !== (message.managerCode !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'manager_message_requires_manager_code',
        path: ['managerCode'],
      });
    }
    const expectedAuthority = {
      user: 'verified_user',
      manager: 'agent_generated',
      system: 'system_generated',
      external: 'external_untrusted',
    } as const;
    if (message.authority !== expectedAuthority[message.senderKind]) {
      context.addIssue({
        code: 'custom',
        message: 'message_authority_must_match_sender',
        path: ['authority'],
      });
    }
  });

export const conversationAttachmentReferenceSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    conversationId: uuidSchema,
    messageId: uuidSchema,
    sourceObjectId: uuidSchema,
    originalFilename: z.string().trim().min(1).max(512),
    detectedMime: z.string().trim().min(1).max(255),
    byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sha256: sha256Schema,
    malwareScanStatus: attachmentScanStatusSchema,
    extractionStatus: attachmentExtractionStatusSchema,
    extractionReference: z.string().trim().min(1).max(1000).nullable(),
    dataClassification: z.string().trim().min(1).max(80),
    retentionState: evidenceRetentionStateSchema,
    createdAt: timestampSchema,
  })
  .strict();

export const conversationHandoffSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    conversationId: uuidSchema,
    userId: uuidSchema,
    fromManagerCode: managerCodeSchema,
    toManagerCode: managerCodeSchema,
    reason: z.string().trim().min(1).max(2000),
    sourceMessageId: uuidSchema.nullable(),
    status: conversationHandoffStatusSchema,
    initiatedAt: timestampSchema,
    acceptedAt: timestampSchema.nullable(),
    correlationId: uuidSchema,
    idempotencyKey: z.string().trim().min(8).max(255),
  })
  .strict()
  .superRefine((handoff, context) => {
    if (handoff.fromManagerCode === handoff.toManagerCode) {
      context.addIssue({
        code: 'custom',
        message: 'handoff_destination_must_change_owner',
        path: ['toManagerCode'],
      });
    }
    if ((handoff.status === 'accepted') !== (handoff.acceptedAt !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'accepted_handoff_requires_acceptance_timestamp',
        path: ['acceptedAt'],
      });
    }
  });

export const conversationHandoffEventSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    handoffId: uuidSchema,
    userId: uuidSchema,
    status: conversationHandoffStatusSchema,
    actorManagerCode: managerCodeSchema.nullable(),
    createdAt: timestampSchema,
    correlationId: uuidSchema,
  })
  .strict();

export const conversationEntityLinkSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    conversationId: uuidSchema,
    userId: uuidSchema,
    messageId: uuidSchema.nullable(),
    entityType: conversationEntityTypeSchema,
    entityId: uuidSchema,
    relation: z.enum(['context', 'produced_by', 'supports', 'supersedes']),
    createdAt: timestampSchema,
  })
  .strict();

const conversationStorageRecordSchema = z
  .object({
    contract_version: z.literal(1),
    id: uuidSchema,
    user_id: uuidSchema,
    status: conversationStatusSchema,
    originating_channel: conversationOriginChannelSchema,
    originating_manager_code: managerCodeSchema,
    current_manager_code: managerCodeSchema,
    subject: z.string().trim().min(1).max(998),
    gmail_thread_id: z.string().trim().min(1).max(255).nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    last_message_at: timestampSchema.nullable(),
    execution_state_summary: executionStateSummarySchema,
    metadata: extensibleObjectSchema,
    correlation_id: uuidSchema,
  })
  .strict();

export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationParticipant = z.infer<typeof conversationParticipantSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationAttachmentReference = z.infer<typeof conversationAttachmentReferenceSchema>;
export type ConversationHandoff = z.infer<typeof conversationHandoffSchema>;
export type ConversationHandoffEvent = z.infer<typeof conversationHandoffEventSchema>;
export type ConversationEntityLink = z.infer<typeof conversationEntityLinkSchema>;
export type ConversationStorageRecord = z.infer<typeof conversationStorageRecordSchema>;
export type ConversationMessageStorageRecord = z.infer<
  typeof conversationMessageStorageRecordSchema
>;

const conversationTransitions: Readonly<
  Record<
    z.infer<typeof conversationStatusSchema>,
    readonly z.infer<typeof conversationStatusSchema>[]
  >
> = {
  open: ['closed', 'archived'],
  closed: ['open', 'archived'],
  archived: [],
};

const handoffTransitions: Readonly<
  Record<
    z.infer<typeof conversationHandoffStatusSchema>,
    readonly z.infer<typeof conversationHandoffStatusSchema>[]
  >
> = {
  requested: ['accepted', 'rejected', 'cancelled'],
  accepted: [],
  rejected: [],
  cancelled: [],
};

export function canTransitionConversationStatus(
  from: Conversation['status'],
  to: Conversation['status'],
): boolean {
  return conversationTransitions[from].includes(to);
}

export function canTransitionConversationHandoff(
  from: ConversationHandoff['status'],
  to: ConversationHandoff['status'],
): boolean {
  return handoffTransitions[from].includes(to);
}

export function serializeConversation(conversation: Conversation): ConversationStorageRecord {
  const value = conversationSchema.parse(conversation);
  return conversationStorageRecordSchema.parse({
    contract_version: value.contractVersion,
    id: value.id,
    user_id: value.userId,
    status: value.status,
    originating_channel: value.originatingChannel,
    originating_manager_code: value.originatingManagerCode,
    current_manager_code: value.currentManagerCode,
    subject: value.subject,
    gmail_thread_id: value.gmailThreadId,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
    last_message_at: value.lastMessageAt,
    execution_state_summary: value.executionStateSummary,
    metadata: value.metadata,
    correlation_id: value.correlationId,
  });
}

export function deserializeConversation(record: unknown): Conversation {
  const row = conversationStorageRecordSchema.parse(record);
  return conversationSchema.parse({
    contractVersion: row.contract_version,
    id: row.id,
    userId: row.user_id,
    status: row.status,
    originatingChannel: row.originating_channel,
    originatingManagerCode: row.originating_manager_code,
    currentManagerCode: row.current_manager_code,
    subject: row.subject,
    gmailThreadId: row.gmail_thread_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    executionStateSummary: row.execution_state_summary,
    metadata: row.metadata,
    correlationId: row.correlation_id,
  });
}

export function serializeConversationMessage(
  message: ConversationMessage,
): ConversationMessageStorageRecord {
  const value = conversationMessageSchema.parse(message);
  return conversationMessageStorageRecordSchema.parse({
    contract_version: value.contractVersion,
    id: value.id,
    conversation_id: value.conversationId,
    user_id: value.userId,
    direction: value.direction,
    sender_kind: value.senderKind,
    manager_code: value.managerCode,
    channel: value.channel,
    semantic_type: value.semanticType,
    authority: value.authority,
    body_text: value.bodyText,
    body_reference: value.bodyReference,
    body_sha256: value.bodySha256,
    gmail_message_id: value.gmailMessageId,
    gmail_rfc_message_id: value.gmailRfcMessageId,
    gmail_thread_id: value.gmailThreadId,
    in_reply_to: value.inReplyTo,
    message_references: value.references,
    provider_received_at: value.providerReceivedAt,
    created_at: value.createdAt,
    deduplication_key: value.deduplicationKey,
    processing_status: value.processingStatus,
    correlation_id: value.correlationId,
  });
}

export function deserializeConversationMessage(row: unknown): ConversationMessage {
  const value = conversationMessageStorageRecordSchema.parse(row);
  return conversationMessageSchema.parse({
    contractVersion: value.contract_version,
    id: value.id,
    conversationId: value.conversation_id,
    userId: value.user_id,
    direction: value.direction,
    senderKind: value.sender_kind,
    managerCode: value.manager_code,
    channel: value.channel,
    semanticType: value.semantic_type,
    authority: value.authority,
    bodyText: value.body_text,
    bodyReference: value.body_reference,
    bodySha256: value.body_sha256,
    gmailMessageId: value.gmail_message_id,
    gmailRfcMessageId: value.gmail_rfc_message_id,
    gmailThreadId: value.gmail_thread_id,
    inReplyTo: value.in_reply_to,
    references: value.message_references,
    providerReceivedAt: value.provider_received_at,
    createdAt: value.created_at,
    deduplicationKey: value.deduplication_key,
    processingStatus: value.processing_status,
    correlationId: value.correlation_id,
  });
}
