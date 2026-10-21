import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  canonicalActionReceiptSchema,
  type CanonicalActionAdapter,
  type CanonicalActionExecutionIdentity,
  type CanonicalActionPolicyInput,
  type CanonicalActionReceipt,
  type CanonicalActionReceiptDraft,
} from '@ai-operations/contracts';
import {
  executeCanonicalAction,
  type CanonicalActionCompletion,
  type CanonicalActionExecutionClaim,
  type CanonicalActionExecutionInput,
  type CanonicalActionExecutionLookup,
  type CanonicalActionExecutionStore,
} from './action-execution';

const userId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const actionId = '00000000-0000-4000-8000-000000000003';
const correlationId = '00000000-0000-4000-8000-000000000004';
const receiptId = '00000000-0000-4000-8000-000000000005';
const idempotencyKey = 'calendar-action-001';
const requestFingerprint = `sha256:${'a'.repeat(64)}`;
const createdAt = '2026-10-21T10:00:00.000Z';

const basePolicy = (
  overrides: Partial<CanonicalActionPolicyInput> = {},
): CanonicalActionPolicyInput => ({
  actionType: 'google_calendar_event_create',
  managerCode: 'personal',
  authority: 'verified_user',
  channel: 'web_chat',
  riskClass: 'medium',
  capabilities: ['calendar_write'],
  permissions: ['write', 'execute'],
  approvalState: 'not_required',
  freshWebAal2: false,
  standingPolicyPreauthorized: false,
  ...overrides,
});

const baseInput = (
  overrides: Partial<CanonicalActionExecutionInput> = {},
): CanonicalActionExecutionInput => ({
  identity: {
    userId,
    executionRequestId: requestId,
    idempotencyKey,
    requestFingerprint,
  },
  actionId,
  actionType: 'google_calendar_event_create',
  policyInput: basePolicy(),
  payload: { title: 'Planning review' },
  correlationId,
  ...overrides,
});

type StoreState = 'empty' | 'running' | 'done';

class MemoryExecutionStore implements CanonicalActionExecutionStore {
  state: StoreState = 'empty';
  identity: CanonicalActionExecutionIdentity | null = null;
  receipt: CanonicalActionReceipt | null = null;
  policyDecisions: unknown[] = [];
  completeCount = 0;
  claimCount = 0;

  private matchesScope(identity: CanonicalActionExecutionIdentity): boolean {
    return (
      this.identity === null ||
      (this.identity.userId === identity.userId &&
        this.identity.idempotencyKey === identity.idempotencyKey &&
        this.identity.requestFingerprint === identity.requestFingerprint &&
        this.identity.executionRequestId === identity.executionRequestId)
    );
  }

  async lookup(
    identity: CanonicalActionExecutionIdentity,
  ): Promise<CanonicalActionExecutionLookup> {
    if (!this.matchesScope(identity)) return { kind: 'conflict' };
    if (this.state === 'running') return { kind: 'in_progress' };
    if (this.state === 'done' && this.receipt) return { kind: 'replay', receipt: this.receipt };
    return { kind: 'missing' };
  }

  async recordPolicyDecision(
    _identity: CanonicalActionExecutionIdentity,
    decision: unknown,
  ): Promise<void> {
    this.policyDecisions.push(decision);
  }

  async claim(identity: CanonicalActionExecutionIdentity): Promise<CanonicalActionExecutionClaim> {
    if (!this.matchesScope(identity)) return { kind: 'conflict' };
    if (this.state === 'running') return { kind: 'in_progress' };
    if (this.state === 'done' && this.receipt) return { kind: 'replay', receipt: this.receipt };
    this.identity = identity;
    this.state = 'running';
    this.claimCount += 1;
    return { kind: 'claimed', claimToken: 'claim-1', attempt: this.claimCount };
  }

  async complete(
    identity: CanonicalActionExecutionIdentity,
    claimToken: string,
    draft: CanonicalActionReceiptDraft,
  ): Promise<CanonicalActionCompletion> {
    if (!this.matchesScope(identity) || claimToken !== 'claim-1') return { kind: 'conflict' };
    if (this.state === 'done' && this.receipt) return { kind: 'replay', receipt: this.receipt };
    if (this.state !== 'running') return { kind: 'conflict' };
    const receipt = canonicalActionReceiptSchema.parse({
      ...draft,
      id: receiptId,
      createdAt,
    });
    this.receipt = receipt;
    this.state = 'done';
    this.completeCount += 1;
    return { kind: 'persisted', receipt };
  }
}

function calendarAdapter(overrides: Partial<CanonicalActionAdapter<typeof payloadSchema>> = {}) {
  return {
    adapterCode: 'test-calendar',
    actionTypes: ['google_calendar_event_create'] as const,
    payloadSchema,
    checkPreconditions: vi.fn(async () => ({
      ready: true as const,
      currentStateToken: 'calendar-version-9',
      checkedAt: createdAt,
    })),
    execute: vi.fn(async () => ({
      kind: 'succeeded' as const,
      summary: 'Calendar event created.',
      resultReference: 'provider-event-1',
      changedReferences: ['provider-event-1'],
      reversalToken: 'delete-event-1',
    })),
    ...overrides,
  } satisfies CanonicalActionAdapter<typeof payloadSchema>;
}

const payloadSchema = z.object({ title: z.string().min(1) }).strict();

describe('canonical action execution', () => {
  let store: MemoryExecutionStore;

  beforeEach(() => {
    store = new MemoryExecutionStore();
  });

  it('replays the original receipt and performs the provider effect only once', async () => {
    const adapter = calendarAdapter();
    const first = await executeCanonicalAction(baseInput(), adapter, store);
    const replay = await executeCanonicalAction(baseInput(), adapter, store);

    expect(first.kind).toBe('completed');
    expect(replay.kind).toBe('replay');
    if (first.kind !== 'completed' || replay.kind !== 'replay')
      throw new Error('expected_receipts');
    expect(replay.receipt).toEqual(first.receipt);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    expect(store.completeCount).toBe(1);
  });

  it('does not run proposals with pending approval, even when their channel is Gmail', async () => {
    const adapter = calendarAdapter();
    const input = baseInput({
      policyInput: basePolicy({
        authority: 'agent_proposal',
        channel: 'gmail',
        approvalState: 'pending',
      }),
    });
    const result = await executeCanonicalAction(input, adapter, store);

    expect(result).toMatchObject({
      kind: 'policy_stopped',
      decision: { decision: 'approval_required', reason: 'agent_proposal_requires_approval' },
    });
    expect(adapter.checkPreconditions).not.toHaveBeenCalled();
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(store.claimCount).toBe(0);
  });

  it('does not call adapters for rejected authority or prohibited actions', async () => {
    const adapter = calendarAdapter();
    const wrongChannel = await executeCanonicalAction(
      baseInput({ policyInput: basePolicy({ channel: 'internal' }) }),
      adapter,
      store,
    );
    const prohibited = await executeCanonicalAction(
      baseInput({
        actionType: 'financial_transaction_execute',
        policyInput: basePolicy({ actionType: 'financial_transaction_execute' }),
      }),
      adapter,
      store,
    );

    expect(wrongChannel).toMatchObject({
      kind: 'policy_stopped',
      decision: { decision: 'deny', reason: 'authority_channel_mismatch' },
    });
    expect(prohibited).toMatchObject({
      kind: 'policy_stopped',
      decision: { decision: 'deny', reason: 'prohibited_action' },
    });
    expect(adapter.checkPreconditions).not.toHaveBeenCalled();
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(store.claimCount).toBe(0);
  });

  it('checks the current state immediately before execution and passes its token', async () => {
    const order: string[] = [];
    const adapter = calendarAdapter({
      checkPreconditions: vi.fn(async () => {
        order.push('precondition');
        return {
          ready: true as const,
          currentStateToken: 'calendar-version-10',
          checkedAt: createdAt,
        };
      }),
      execute: vi.fn(async (_payload, context) => {
        order.push(`execute:${context.currentStateToken}`);
        return {
          kind: 'succeeded' as const,
          summary: 'Calendar event created.',
          resultReference: 'provider-event-2',
          changedReferences: ['provider-event-2'],
          reversalToken: null,
        };
      }),
    });

    const result = await executeCanonicalAction(baseInput(), adapter, store);

    expect(result.kind).toBe('completed');
    expect(order).toEqual(['precondition', 'execute:calendar-version-10']);
  });

  it('does not execute when the current-state precondition fails and records a truthful failure receipt', async () => {
    const adapter = calendarAdapter({
      checkPreconditions: vi.fn(async () => ({
        ready: false as const,
        reason: 'precondition_failed' as const,
      })),
    });
    const result = await executeCanonicalAction(baseInput(), adapter, store);

    expect(result.kind).toBe('completed');
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(store.receipt).toMatchObject({
      kind: 'failed',
      errorCode: 'precondition_failed',
      changedReferences: [],
      resultReference: null,
    });
    expect(store.completeCount).toBe(1);
  });

  it('returns in-progress for concurrent claims without a second provider effect', async () => {
    let releasePrecondition: (() => void) | undefined;
    const preconditionBlocked = new Promise<void>((resolve) => {
      releasePrecondition = resolve;
    });
    const adapter = calendarAdapter({
      checkPreconditions: vi.fn(async () => {
        await preconditionBlocked;
        return { ready: true as const, currentStateToken: 'version-1', checkedAt: createdAt };
      }),
    });

    const firstPromise = executeCanonicalAction(baseInput(), adapter, store);
    while (store.state !== 'running') await Promise.resolve();
    const concurrent = await executeCanonicalAction(baseInput(), adapter, store);
    releasePrecondition?.();
    const first = await firstPromise;

    expect(concurrent).toEqual({ kind: 'in_progress' });
    expect(first.kind).toBe('completed');
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    expect(store.claimCount).toBe(1);
  });

  it('persists partial outcomes accurately and only once', async () => {
    const adapter = calendarAdapter({
      execute: vi.fn(async () => ({
        kind: 'partially_succeeded' as const,
        summary: 'The event was created but a secondary update failed.',
        resultReference: 'provider-event-3',
        changedReferences: ['provider-event-3'],
        errorCode: 'secondary_update_failed',
        redactedError: null,
        reversalToken: 'delete-event-3',
      })),
    });
    const result = await executeCanonicalAction(baseInput(), adapter, store);

    expect(result.kind).toBe('completed');
    expect(store.receipt).toMatchObject({
      kind: 'partially_succeeded',
      errorCode: 'secondary_update_failed',
      changedReferences: ['provider-event-3'],
      reversalToken: 'delete-event-3',
    });
    expect(store.completeCount).toBe(1);
  });

  it('binds a re-used idempotency key with different request data to a conflict', async () => {
    const adapter = calendarAdapter();
    await executeCanonicalAction(baseInput(), adapter, store);
    const conflict = await executeCanonicalAction(
      baseInput({
        identity: { ...baseInput().identity, requestFingerprint: `sha256:${'b'.repeat(64)}` },
      }),
      adapter,
      store,
    );

    expect(conflict).toEqual({ kind: 'conflict' });
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });
});
