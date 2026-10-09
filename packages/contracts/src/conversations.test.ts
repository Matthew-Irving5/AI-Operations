import { describe, expect, it } from 'vitest';
import {
  canTransitionConversationHandoff,
  canTransitionConversationStatus,
  conversationMessageSchema,
  conversationSchema,
  deserializeConversation,
  deserializeConversationMessage,
  serializeConversation,
  serializeConversationMessage,
} from './index';

const conversation = {
  contractVersion: 1 as const,
  id: '6056f246-3a7d-4d81-9a7d-c7005c914967',
  userId: '8e4bca8c-87d0-4409-946a-118ecaa80523',
  status: 'open' as const,
  originatingChannel: 'gmail' as const,
  originatingManagerCode: 'personal' as const,
  currentManagerCode: 'finance' as const,
  subject: 'Monthly close question',
  gmailThreadId: 'gmail-thread-1',
  createdAt: '2026-10-09T09:00:00Z',
  updatedAt: '2026-10-09T09:15:00Z',
  lastMessageAt: '2026-10-09T09:15:00Z',
  executionStateSummary: {
    state: 'running',
    activeRunId: '601fe6f1-d9b8-4ac0-bce6-13ef18cb9f50',
    updatedAt: '2026-10-09T09:15:00Z',
  },
  metadata: { source: 'fixture' },
  correlationId: '28a96d75-5045-41ee-ae9b-21dab6d26660',
};

const message = {
  contractVersion: 1 as const,
  id: '444db6f8-8b1b-4b98-9b72-d95a456754cc',
  conversationId: conversation.id,
  userId: conversation.userId,
  direction: 'inbound' as const,
  senderKind: 'user' as const,
  managerCode: null,
  channel: 'web_chat' as const,
  semanticType: 'request' as const,
  authority: 'verified_user' as const,
  bodyText: 'Please do this',
  bodyReference: null,
  bodySha256: 'a'.repeat(64),
  gmailMessageId: null,
  gmailRfcMessageId: null,
  gmailThreadId: null,
  inReplyTo: null,
  references: [],
  providerReceivedAt: null,
  createdAt: '2026-10-09T09:15:01Z',
  deduplicationKey: 'web-chat:message:1',
  processingStatus: 'received' as const,
  correlationId: conversation.correlationId,
};

describe('canonical conversation contracts', () => {
  it('round-trips a versioned conversation through its database row shape', () => {
    const parsed = conversationSchema.parse(conversation);
    expect(deserializeConversation(serializeConversation(parsed))).toEqual(parsed);
  });

  it('round-trips an append-only canonical message through its database row shape', () => {
    const parsed = conversationMessageSchema.parse(message);
    expect(deserializeConversationMessage(serializeConversationMessage(parsed))).toEqual(parsed);
  });

  it('keeps sender identity and authority aligned', () => {
    const result = conversationMessageSchema.safeParse({
      ...message,
      senderKind: 'external',
      channel: 'gmail',
      semanticType: 'command',
      gmailMessageId: 'provider-1',
      gmailRfcMessageId: '<message-1@example.test>',
      gmailThreadId: conversation.gmailThreadId,
      providerReceivedAt: '2026-10-09T09:15:00Z',
      deduplicationKey: 'gmail:account-1:message-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'message_authority_must_match_sender',
      );
    }
  });

  it('rejects impossible conversation and handoff transitions', () => {
    expect(canTransitionConversationStatus('open', 'closed')).toBe(true);
    expect(canTransitionConversationStatus('closed', 'open')).toBe(true);
    expect(canTransitionConversationStatus('archived', 'open')).toBe(false);
    expect(canTransitionConversationHandoff('requested', 'accepted')).toBe(true);
    expect(canTransitionConversationHandoff('accepted', 'requested')).toBe(false);
  });
});
