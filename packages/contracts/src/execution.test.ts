import { describe, expect, it } from 'vitest';
import {
  actionProposalSchema,
  attentionItemSchema,
  canTransitionActionProposal,
  canTransitionAttentionItem,
  canTransitionExecutionRequest,
  canTransitionInterAgentRequest,
  canTransitionWorkflowRun,
  executionReceiptSchema,
  evidenceReferenceSchema,
  interAgentReplySchema,
  interAgentRequestSchema,
  workflowRunStatusSchema,
} from './index';

const timestamp = '2026-10-09T09:00:00Z';
const userId = '8e4bca8c-87d0-4409-946a-118ecaa80523';
const correlationId = '28a96d75-5045-41ee-ae9b-21dab6d26660';
const requestId = 'b7f186df-b06b-47a1-9c44-8c895c7bf48b';

describe('canonical execution contracts', () => {
  it('does not let an unapproved agent proposal enter execution', () => {
    const result = actionProposalSchema.safeParse({
      contractVersion: 1,
      id: '6056f246-3a7d-4d81-9a7d-c7005c914967',
      userId,
      runId: null,
      conversationId: null,
      sourceMessageId: null,
      managerCode: 'finance',
      authority: 'agent_proposal',
      actionType: 'create_report',
      title: 'Create report',
      description: 'Create the approved finance report.',
      riskClass: 'low',
      requiredCapability: 'own_domain_state',
      requiredPermissions: ['write'],
      status: 'queued',
      approvalState: 'pending',
      proposedPayload: {},
      idempotencyKey: 'action:finance:report:2026-10',
      correlationId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'agent_proposal_requires_approval_before_execution',
      );
    }
  });

  it('requires failure details in a failed execution receipt', () => {
    expect(
      executionReceiptSchema.safeParse({
        contractVersion: 1,
        id: '6056f246-3a7d-4d81-9a7d-c7005c914967',
        userId,
        executionRequestId: requestId,
        actionId: null,
        kind: 'failed',
        summary: 'The provider rejected the request.',
        resultReference: null,
        errorCode: null,
        redactedError: null,
        idempotencyKey: 'receipt:failure:request-1',
        correlationId,
        createdAt: timestamp,
      }).success,
    ).toBe(false);
  });

  it('validates inter-agent request and reply links', () => {
    expect(
      interAgentRequestSchema.safeParse({
        contractVersion: 1,
        id: requestId,
        userId,
        sourceManagerCode: 'personal',
        destinationManagerCode: 'finance',
        objective: 'Verify the latest close totals.',
        requiredOutputContract: { type: 'object', additionalProperties: false },
        contextEvidenceIds: [],
        priority: 2,
        deadlineAt: null,
        idempotencyKey: 'a2a:personal:finance:close:2026-10',
        sourceRunId: null,
        sourceMessageId: null,
        status: 'completed',
        resultReference: 'd811f41f-cd7a-4875-aaff-39a851e753d6',
        correlationId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).success,
    ).toBe(true);

    expect(
      interAgentReplySchema.safeParse({
        contractVersion: 1,
        id: 'e4965751-a27a-4ba5-99bb-846fe6483953',
        userId,
        requestId,
        managerCode: 'finance',
        kind: 'completed',
        output: { totalMinor: 1200, currency: 'GBP' },
        resultReference: 'd811f41f-cd7a-4875-aaff-39a851e753d6',
        evidenceReferenceIds: [],
        createdAt: timestamp,
        correlationId,
      }).success,
    ).toBe(true);
  });

  it('keeps evidence bound to one typed source and provenance', () => {
    const validEvidence = {
      contractVersion: 1,
      id: '6056f246-3a7d-4d81-9a7d-c7005c914967',
      userId,
      sourceType: 'external_url',
      sourceObjectId: null,
      researchSourceId: null,
      sourceRecordTable: null,
      sourceRecordId: null,
      sourceUrl: 'https://example.test/authoritative-source',
      sourceKey: null,
      title: 'Authoritative source',
      sha256: null,
      capturedAt: null,
      retrievedAt: timestamp,
      verificationMethod: 'authoritative_url',
      confidence: 'high',
      expiresAt: null,
      workflowRunId: null,
      aiCallId: null,
      traceEventId: null,
      promptVersionId: null,
      modelId: null,
      provenance: {},
      createdAt: timestamp,
    } as const;
    expect(evidenceReferenceSchema.safeParse(validEvidence).success).toBe(true);
    expect(
      evidenceReferenceSchema.safeParse({
        ...validEvidence,
        sourceKey: 'also-set',
      }).success,
    ).toBe(false);
  });

  it('keeps attention, action, inter-agent, and run state transitions bounded', () => {
    expect(canTransitionActionProposal('proposed', 'awaiting_approval')).toBe(true);
    expect(canTransitionActionProposal('proposed', 'succeeded')).toBe(false);
    expect(canTransitionAttentionItem('new', 'queued_for_planner')).toBe(true);
    expect(canTransitionAttentionItem('expired', 'resolved')).toBe(false);
    expect(canTransitionInterAgentRequest('requested', 'accepted')).toBe(true);
    expect(canTransitionInterAgentRequest('completed', 'running')).toBe(false);
    expect(canTransitionExecutionRequest('running', 'waiting_for_dependency')).toBe(true);
    expect(canTransitionExecutionRequest('succeeded', 'running')).toBe(false);
    expect(canTransitionWorkflowRun('waiting_for_dependency', 'running')).toBe(true);
    expect(workflowRunStatusSchema.safeParse('waiting_for_dependency').success).toBe(true);
  });

  it('requires acknowledgement and resolution timestamps for completed attention states', () => {
    const base = {
      contractVersion: 1,
      id: '6056f246-3a7d-4d81-9a7d-c7005c914967',
      userId,
      sourceManagerCode: 'health',
      itemType: 'health_finding',
      finding: 'A recent health observation needs review.',
      recommendedCommunication: 'Include the finding in the next plan.',
      recommendedAction: null,
      priority: 2,
      urgency: 'routine',
      deadlineAt: null,
      expiresAt: null,
      evidenceReferenceIds: [],
      deduplicationKey: 'attention:health:finding:week-41',
      acknowledgementRequired: true,
      sourceRunId: null,
      sourceConversationId: null,
      createdAt: timestamp,
      acknowledgedAt: null,
      resolvedAt: null,
      correlationId,
    } as const;

    expect(attentionItemSchema.safeParse({ ...base, status: 'incorporated' }).success).toBe(false);
    expect(
      attentionItemSchema.safeParse({
        ...base,
        status: 'resolved',
        acknowledgementRequired: false,
        resolvedAt: timestamp,
      }).success,
    ).toBe(true);
  });
});
