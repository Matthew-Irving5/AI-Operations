import { createHash, randomUUID } from 'node:crypto';
import {
  actionProposalSchema,
  attentionItemSchema,
  conversationHandoffSchema,
  conversationMessageSchema,
  conversationParticipantSchema,
  conversationSchema,
  evidenceLinkSchema,
  evidenceReferenceSchema,
  type ActionProposal,
  type AttentionItem,
  type Conversation,
  type ConversationHandoff,
  type ConversationMessage,
  type ConversationParticipant,
  type EvidenceLink,
  type EvidenceReference,
} from '@ai-operations/contracts';

export type AgentRuntimeFixture = Readonly<{
  fixtureKey: string;
  conversation: Conversation;
  participants: readonly ConversationParticipant[];
  message: ConversationMessage;
  handoff: ConversationHandoff;
  attention: AttentionItem;
  action: ActionProposal;
  evidence: EvidenceReference;
  evidenceLinks: readonly EvidenceLink[];
}>;

/**
 * Build a safe, non-personal acceptance fixture that uses the same canonical
 * schemas as production contracts. The returned key is unique per run and can
 * be used to scope staging reads without storing auth material.
 */
function stableUuid(fixtureKey: string, entity: string): string {
  const bytes = createHash('sha256').update(`${fixtureKey}:${entity}`).digest('hex').slice(0, 32);
  const variant = ((Number.parseInt(bytes[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-${variant}${bytes.slice(17, 20)}-${bytes.slice(20, 32)}`;
}

export function buildAgentRuntimeFixture(
  userId: string,
  now = new Date(),
  providedFixtureKey?: string,
): AgentRuntimeFixture {
  const instant = now.toISOString();
  const fixtureKey = providedFixtureKey ?? `ai14-live-e2e:${randomUUID()}`;
  if (!/^ai14-live-e2e:[0-9a-f-]{36}$/i.test(fixtureKey)) {
    throw new Error('fixture_key_invalid');
  }
  const ids = {
    conversation: stableUuid(fixtureKey, 'conversation'),
    userParticipant: stableUuid(fixtureKey, 'participant:user'),
    managerParticipant: stableUuid(fixtureKey, 'participant:manager'),
    message: stableUuid(fixtureKey, 'message'),
    handoff: stableUuid(fixtureKey, 'handoff'),
    attention: stableUuid(fixtureKey, 'attention'),
    action: stableUuid(fixtureKey, 'action'),
    evidence: stableUuid(fixtureKey, 'evidence'),
    correlation: stableUuid(fixtureKey, 'correlation'),
  };
  const bodyText = 'Synthetic AI-14 conversation contract acceptance message.';
  const bodySha256 = createHash('sha256').update(bodyText).digest('hex');
  const conversation = conversationSchema.parse({
    contractVersion: 1,
    id: ids.conversation,
    userId,
    status: 'open',
    originatingChannel: 'web_chat',
    originatingManagerCode: 'systems',
    currentManagerCode: 'systems',
    subject: 'AI-14 canonical conversation fixture',
    gmailThreadId: null,
    createdAt: instant,
    updatedAt: instant,
    lastMessageAt: instant,
    executionStateSummary: { state: null, activeRunId: null, updatedAt: null },
    metadata: { fixture: 'ai14-live-e2e', fixtureKey },
    correlationId: ids.correlation,
  });
  const participants = [
    conversationParticipantSchema.parse({
      contractVersion: 1,
      id: ids.userParticipant,
      conversationId: ids.conversation,
      userId,
      kind: 'user',
      role: 'owner',
      managerCode: null,
      providerActorId: null,
      displayName: 'Fixture owner',
      joinedAt: instant,
      leftAt: null,
    }),
    conversationParticipantSchema.parse({
      contractVersion: 1,
      id: ids.managerParticipant,
      conversationId: ids.conversation,
      userId,
      kind: 'manager',
      role: 'member',
      managerCode: 'systems',
      providerActorId: null,
      displayName: 'Systems manager',
      joinedAt: instant,
      leftAt: null,
    }),
  ];
  const message = conversationMessageSchema.parse({
    contractVersion: 1,
    id: ids.message,
    conversationId: ids.conversation,
    userId,
    direction: 'internal',
    senderKind: 'system',
    managerCode: null,
    channel: 'internal',
    semanticType: 'statement',
    authority: 'system_generated',
    bodyText,
    bodyReference: null,
    bodySha256,
    gmailMessageId: null,
    gmailRfcMessageId: null,
    gmailThreadId: null,
    inReplyTo: null,
    references: [],
    providerReceivedAt: null,
    createdAt: instant,
    deduplicationKey: fixtureKey,
    processingStatus: 'processed',
    correlationId: ids.correlation,
  });
  const handoff = conversationHandoffSchema.parse({
    contractVersion: 1,
    id: ids.handoff,
    conversationId: ids.conversation,
    userId,
    fromManagerCode: 'systems',
    toManagerCode: 'personal',
    reason: 'Synthetic ownership handoff contract proof.',
    sourceMessageId: ids.message,
    status: 'requested',
    initiatedAt: instant,
    acceptedAt: null,
    correlationId: ids.correlation,
    idempotencyKey: fixtureKey,
  });
  const attention = attentionItemSchema.parse({
    contractVersion: 1,
    id: ids.attention,
    userId,
    sourceManagerCode: 'systems',
    itemType: 'contract_fixture',
    finding: 'Synthetic attention item for canonical contract acceptance.',
    recommendedCommunication: 'No external communication is required.',
    recommendedAction: 'Verify the persisted contract links.',
    priority: 4,
    urgency: 'routine',
    deadlineAt: null,
    expiresAt: null,
    evidenceReferenceIds: [ids.evidence],
    deduplicationKey: fixtureKey,
    acknowledgementRequired: false,
    status: 'new',
    sourceRunId: null,
    sourceConversationId: ids.conversation,
    createdAt: instant,
    acknowledgedAt: null,
    resolvedAt: null,
    correlationId: ids.correlation,
  });
  const action = actionProposalSchema.parse({
    contractVersion: 1,
    id: ids.action,
    userId,
    runId: null,
    conversationId: ids.conversation,
    sourceMessageId: ids.message,
    managerCode: 'systems',
    authority: 'verified_user',
    actionType: 'contract_fixture',
    title: 'AI-14 synthetic action proposal',
    description: 'A non-executable proposal used to verify canonical links.',
    riskClass: 'low',
    requiredCapability: 'canonical_conversation_content',
    requiredPermissions: ['read'],
    status: 'proposed',
    approvalState: 'not_required',
    proposedPayload: { fixture: true, fixtureKey },
    idempotencyKey: fixtureKey,
    correlationId: ids.correlation,
    createdAt: instant,
    updatedAt: instant,
  });
  const evidence = evidenceReferenceSchema.parse({
    contractVersion: 1,
    id: ids.evidence,
    userId,
    sourceType: 'legacy_reference',
    sourceObjectId: null,
    researchSourceId: null,
    sourceRecordTable: null,
    sourceRecordId: null,
    sourceUrl: null,
    sourceKey: fixtureKey,
    title: 'Synthetic AI-14 contract fixture',
    sha256: bodySha256,
    capturedAt: instant,
    retrievedAt: null,
    verificationMethod: 'derived_deterministically',
    confidence: 'high',
    expiresAt: null,
    workflowRunId: null,
    aiCallId: null,
    traceEventId: null,
    promptVersionId: null,
    modelId: null,
    provenance: { fixture: 'ai14-live-e2e', fixtureKey },
    createdAt: instant,
  });
  const evidenceLinks = [
    { type: 'conversation' as const, id: ids.conversation },
    { type: 'conversation_message' as const, id: ids.message },
    { type: 'conversation_handoff' as const, id: ids.handoff },
    { type: 'attention_item' as const, id: ids.attention },
    { type: 'action' as const, id: ids.action },
  ].map(({ type, id }) =>
    evidenceLinkSchema.parse({
      contractVersion: 1,
      id: stableUuid(fixtureKey, `evidence-link:${type}`),
      userId,
      evidenceReferenceId: ids.evidence,
      entityType: type,
      entityId: id,
      relation: 'supports',
      createdAt: instant,
    }),
  );

  return {
    fixtureKey,
    conversation,
    participants,
    message,
    handoff,
    attention,
    action,
    evidence,
    evidenceLinks,
  };
}
