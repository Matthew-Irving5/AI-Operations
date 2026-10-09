import { z } from 'zod';

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const evidenceSourceTypeSchema = z.enum([
  'source_object',
  'research_source',
  'domain_record',
  'external_url',
  'legacy_reference',
]);

export const evidenceConfidenceSchema = z.enum(['unknown', 'low', 'medium', 'high']);
export const evidenceVerificationMethodSchema = z.enum([
  'provider_verified',
  'user_supplied',
  'source_document',
  'authoritative_url',
  'derived_deterministically',
  'model_inference',
  'legacy_unclassified',
]);

export const evidenceReferenceSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    sourceType: evidenceSourceTypeSchema,
    sourceObjectId: uuidSchema.nullable(),
    researchSourceId: uuidSchema.nullable(),
    sourceRecordTable: z.string().trim().min(1).max(120).nullable(),
    sourceRecordId: z.string().trim().min(1).max(255).nullable(),
    sourceUrl: z.string().url().nullable(),
    sourceKey: z.string().trim().min(1).max(1000).nullable(),
    title: z.string().trim().min(1).max(500),
    sha256: sha256Schema.nullable(),
    capturedAt: timestampSchema.nullable(),
    retrievedAt: timestampSchema.nullable(),
    verificationMethod: evidenceVerificationMethodSchema,
    confidence: evidenceConfidenceSchema,
    expiresAt: timestampSchema.nullable(),
    workflowRunId: uuidSchema.nullable(),
    aiCallId: uuidSchema.nullable(),
    traceEventId: uuidSchema.nullable(),
    promptVersionId: uuidSchema.nullable(),
    modelId: z.string().trim().min(1).max(120).nullable(),
    provenance: z.record(z.string(), z.unknown()),
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    const sourceCount = [
      evidence.sourceObjectId !== null,
      evidence.researchSourceId !== null,
      evidence.sourceRecordId !== null,
      evidence.sourceUrl !== null,
      evidence.sourceKey !== null,
    ].filter(Boolean).length;
    if (sourceCount !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'evidence_reference_requires_exactly_one_source',
        path: ['sourceType'],
      });
    }
    const sourceMatches = {
      source_object: evidence.sourceObjectId !== null,
      research_source: evidence.researchSourceId !== null,
      domain_record: evidence.sourceRecordId !== null && evidence.sourceRecordTable !== null,
      external_url: evidence.sourceUrl !== null,
      legacy_reference: evidence.sourceKey !== null,
    } as const;
    if (!sourceMatches[evidence.sourceType]) {
      context.addIssue({
        code: 'custom',
        message: 'evidence_source_fields_do_not_match_source_type',
        path: ['sourceType'],
      });
    }
    if (evidence.verificationMethod === 'authoritative_url' && evidence.sourceUrl === null) {
      context.addIssue({
        code: 'custom',
        message: 'authoritative_url_evidence_requires_url',
        path: ['sourceUrl'],
      });
    }
    if (evidence.verificationMethod === 'provider_verified' && evidence.retrievedAt === null) {
      context.addIssue({
        code: 'custom',
        message: 'provider_verified_evidence_requires_retrieval_time',
        path: ['retrievedAt'],
      });
    }
  });

export const evidenceLinkEntityTypeSchema = z.enum([
  'conversation',
  'conversation_message',
  'conversation_attachment',
  'conversation_handoff',
  'inter_agent_request',
  'attention_item',
  'action',
  'execution_request',
  'execution_receipt',
  'workflow_run',
  'run_step',
  'report',
  'report_section',
]);

export const evidenceLinkSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    evidenceReferenceId: uuidSchema,
    entityType: evidenceLinkEntityTypeSchema,
    entityId: uuidSchema,
    relation: z.enum(['supports', 'derived_from', 'supersedes', 'context']),
    createdAt: timestampSchema,
  })
  .strict();

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;
export type EvidenceConfidence = z.infer<typeof evidenceConfidenceSchema>;
export type EvidenceVerificationMethod = z.infer<typeof evidenceVerificationMethodSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type EvidenceLinkEntityType = z.infer<typeof evidenceLinkEntityTypeSchema>;
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
