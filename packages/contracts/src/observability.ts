import { z } from 'zod';

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const jsonValueSchema = z.json();
const objectSchema = z.record(z.string().trim().min(1).max(120), jsonValueSchema);

export const traceEventOutcomeSchema = z.enum([
  'started',
  'succeeded',
  'failed',
  'waiting',
  'skipped',
]);

export const traceEventSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema,
    correlationId: uuidSchema,
    parentEventId: uuidSchema.nullable(),
    runId: uuidSchema.nullable(),
    stepId: uuidSchema.nullable(),
    aiCallId: uuidSchema.nullable(),
    eventType: z.string().trim().min(1).max(120),
    severity: z.enum(['debug', 'info', 'warning', 'error']),
    outcome: traceEventOutcomeSchema.nullable(),
    occurredAt: timestampSchema,
    environment: z.enum(['local', 'test', 'staging', 'production']).nullable(),
    buildVersion: z.string().trim().min(1).max(120).nullable(),
    redactedMetadata: objectSchema,
    archivedPayload: z
      .object({
        objectKey: z.string().trim().min(1).max(1024),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        sizeBytes: z.number().int().nonnegative(),
        contentType: z.string().trim().min(1).max(120),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const auditEventSchema = z
  .object({
    contractVersion: z.literal(1),
    id: uuidSchema,
    userId: uuidSchema.nullable(),
    actorType: z.string().trim().min(1).max(40),
    actionType: z.string().trim().min(1).max(120),
    targetType: z.string().trim().min(1).max(120),
    targetId: z.string().trim().min(1).max(255).nullable(),
    aal: z.string().trim().min(1).max(40).nullable(),
    correlationId: uuidSchema.nullable(),
    redactedBefore: jsonValueSchema.nullable(),
    redactedAfter: jsonValueSchema.nullable(),
    result: z.string().trim().min(1).max(80),
    createdAt: timestampSchema,
  })
  .strict();

export const freshnessStateSchema = z.enum(['fresh', 'stale', 'unknown', 'degraded']);
export const sourceFreshnessStateSchema = z.enum([
  'fresh',
  'stale',
  'error',
  'reauthentication_required',
  'not_connected',
  'unknown',
  'degraded',
]);

export const freshnessEvaluationInputSchema = z
  .object({
    now: timestampSchema,
    lastSourceAt: timestampSchema.nullable(),
    lastSuccessAt: timestampSchema.nullable(),
    sourceState: sourceFreshnessStateSchema,
    expectedCadenceSeconds: z.number().int().positive(),
  })
  .strict();

export type TraceEvent = z.infer<typeof traceEventSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type TraceEventOutcome = z.infer<typeof traceEventOutcomeSchema>;
export type FreshnessState = z.infer<typeof freshnessStateSchema>;
export type SourceFreshnessState = z.infer<typeof sourceFreshnessStateSchema>;
export type FreshnessEvaluationInput = z.infer<typeof freshnessEvaluationInputSchema>;
