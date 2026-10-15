import { describe, expect, it } from 'vitest';
import {
  auditEventSchema,
  freshnessEvaluationInputSchema,
  traceEventSchema,
} from './observability.ts';

const traceEvent = {
  contractVersion: 1,
  id: '3d4eaa2b-e605-4ef2-84d4-1054a07a7202',
  userId: 'ed794f5b-3c33-48a4-98c5-03872a1d9f3a',
  correlationId: '1d5b7f78-70fb-46e8-bf68-c670723dc9d5',
  parentEventId: null,
  runId: 'cb3f7055-e2fd-4b77-bf0a-a42fc0f1aed1',
  stepId: null,
  aiCallId: null,
  eventType: 'workflow_started',
  severity: 'info',
  outcome: 'started',
  occurredAt: '2026-10-15T12:00:00.000Z',
  environment: 'test',
  buildVersion: 'candidate-1',
  redactedMetadata: { stage: 'collect' },
  archivedPayload: null,
};

describe('traceEventSchema', () => {
  it('requires a versioned event with correlation and explicit parent/run context', () => {
    expect(traceEventSchema.safeParse(traceEvent).success).toBe(true);
    expect(traceEventSchema.safeParse({ ...traceEvent, correlationId: undefined }).success).toBe(
      false,
    );
    expect(traceEventSchema.safeParse({ ...traceEvent, unexpected: true }).success).toBe(false);
    expect(traceEventSchema.safeParse({ ...traceEvent, environment: null }).success).toBe(true);
  });

  it('validates archival metadata without accepting unhashed payload references', () => {
    expect(
      traceEventSchema.safeParse({
        ...traceEvent,
        archivedPayload: {
          objectKey: 'staging/user/ai-traces/event.json.zst',
          sha256: 'a'.repeat(64),
          sizeBytes: 12,
          contentType: 'application/json',
        },
      }).success,
    ).toBe(true);
    expect(
      traceEventSchema.safeParse({
        ...traceEvent,
        archivedPayload: { objectKey: 'staging/user/payload.json' },
      }).success,
    ).toBe(false);
  });
});

describe('auditEventSchema', () => {
  it('validates an audit event envelope with redacted before/after state', () => {
    expect(
      auditEventSchema.safeParse({
        contractVersion: 1,
        id: 'c8ed00e2-3897-4484-98b1-357297e9e648',
        userId: null,
        actorType: 'worker',
        actionType: 'complete_workflow',
        targetType: 'workflow_run',
        targetId: 'cb3f7055-e2fd-4b77-bf0a-a42fc0f1aed1',
        aal: null,
        correlationId: '1d5b7f78-70fb-46e8-bf68-c670723dc9d5',
        redactedBefore: { status: 'running' },
        redactedAfter: { status: 'succeeded' },
        result: 'success',
        createdAt: '2026-10-15T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('freshnessEvaluationInputSchema', () => {
  it('requires offset-aware times and a positive source-specific cadence', () => {
    const valid = {
      now: '2026-10-15T12:00:00.000Z',
      lastSourceAt: null,
      lastSuccessAt: null,
      sourceState: 'unknown',
      expectedCadenceSeconds: 300,
    };

    expect(freshnessEvaluationInputSchema.safeParse(valid).success).toBe(true);
    expect(
      freshnessEvaluationInputSchema.safeParse({ ...valid, expectedCadenceSeconds: 0 }).success,
    ).toBe(false);
    expect(freshnessEvaluationInputSchema.safeParse({ ...valid, now: '2026-10-15' }).success).toBe(
      false,
    );
  });
});
