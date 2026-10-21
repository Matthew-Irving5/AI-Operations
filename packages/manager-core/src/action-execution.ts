import { z } from 'zod';
import {
  canonicalActionAdapterContextSchema,
  canonicalActionAdapterOutcomeSchema,
  canonicalActionPreconditionResultSchema,
  canonicalActionExecutionIdentitySchema,
  canonicalActionPolicyInputSchema,
  canonicalActionPolicyResultSchema,
  canonicalActionReceiptDraftSchema,
  canonicalActionReceiptSchema,
  evaluateCanonicalActionPolicy,
  type CanonicalActionAdapter,
  type CanonicalActionExecutionIdentity,
  type CanonicalActionPolicyResult,
  type CanonicalActionReceipt,
  type CanonicalActionReceiptDraft,
} from '@ai-operations/contracts';

const actionUuidSchema = z.string().uuid();

export const canonicalActionExecutionInputSchema = z
  .object({
    identity: canonicalActionExecutionIdentitySchema,
    actionId: actionUuidSchema.nullable(),
    actionType: z.string().trim().min(1).max(100),
    policyInput: canonicalActionPolicyInputSchema,
    payload: z.unknown(),
    correlationId: actionUuidSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.actionType !== input.policyInput.actionType) {
      context.addIssue({
        code: 'custom',
        message: 'canonical_action_type_must_match_policy_input',
        path: ['policyInput', 'actionType'],
      });
    }
  });

export type CanonicalActionExecutionInput = z.infer<typeof canonicalActionExecutionInputSchema>;

export const canonicalActionReversalInputSchema = canonicalActionExecutionInputSchema
  .safeExtend({ originalReceipt: canonicalActionReceiptSchema })
  .strict()
  .superRefine((input, context) => {
    const original = input.originalReceipt;
    if (
      original.userId !== input.identity.userId ||
      original.actionId !== input.actionId ||
      original.actionType !== input.actionType ||
      original.policyDecision !== 'allow' ||
      !['succeeded', 'partially_succeeded'].includes(original.kind) ||
      original.reversalToken === null ||
      original.reversesReceiptId !== null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'canonical_action_original_receipt_not_reversible',
        path: ['originalReceipt'],
      });
    }
  });

export type CanonicalActionReversalInput = z.infer<typeof canonicalActionReversalInputSchema>;

export type CanonicalActionExecutionLookup =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'in_progress' }>
  | Readonly<{ kind: 'replay'; receipt: CanonicalActionReceipt }>
  | Readonly<{ kind: 'conflict' }>;

export type CanonicalActionExecutionClaim =
  | Readonly<{ kind: 'claimed'; claimToken: string; attempt: number }>
  | Readonly<{ kind: 'in_progress' }>
  | Readonly<{ kind: 'replay'; receipt: CanonicalActionReceipt }>
  | Readonly<{ kind: 'conflict' }>;

export type CanonicalActionCompletion =
  | Readonly<{ kind: 'persisted'; receipt: CanonicalActionReceipt }>
  | Readonly<{ kind: 'replay'; receipt: CanonicalActionReceipt }>
  | Readonly<{ kind: 'conflict' }>;

/**
 * Implementations must scope atomically by (userId, idempotencyKey), binding the
 * stored claim to executionRequestId and requestFingerprint. lookup, claim, and
 * complete are atomic with respect to that scope. A different fingerprint under
 * the same scope is a conflict; it must never create a second side effect.
 */
export interface CanonicalActionExecutionStore {
  lookup(identity: CanonicalActionExecutionIdentity): Promise<CanonicalActionExecutionLookup>;
  recordPolicyDecision(
    identity: CanonicalActionExecutionIdentity,
    decision: CanonicalActionPolicyResult,
  ): Promise<void>;
  claim(identity: CanonicalActionExecutionIdentity): Promise<CanonicalActionExecutionClaim>;
  complete(
    identity: CanonicalActionExecutionIdentity,
    claimToken: string,
    receipt: CanonicalActionReceiptDraft,
  ): Promise<CanonicalActionCompletion>;
}

export type CanonicalActionExecutionResult =
  | Readonly<{ kind: 'completed' | 'replay'; receipt: CanonicalActionReceipt }>
  | Readonly<{ kind: 'in_progress' | 'conflict' }>
  | Readonly<{
      kind: 'policy_stopped';
      decision: CanonicalActionPolicyResult;
    }>
  | Readonly<{ kind: 'rejected'; reason: 'invalid_payload' | 'action_type_not_supported' }>;

export const canonicalActionExecutionResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('completed'), receipt: canonicalActionReceiptSchema }).strict(),
  z.object({ kind: z.literal('replay'), receipt: canonicalActionReceiptSchema }).strict(),
  z.object({ kind: z.literal('in_progress') }).strict(),
  z.object({ kind: z.literal('conflict') }).strict(),
  z
    .object({
      kind: z.literal('policy_stopped'),
      decision: canonicalActionPolicyResultSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('rejected'),
      reason: z.enum(['invalid_payload', 'action_type_not_supported']),
    })
    .strict(),
]);

function assertReceiptIdentity(
  receipt: CanonicalActionReceipt,
  identity: CanonicalActionExecutionIdentity,
): CanonicalActionReceipt {
  const parsed = canonicalActionReceiptSchema.parse(receipt);
  if (
    parsed.userId !== identity.userId ||
    parsed.executionRequestId !== identity.executionRequestId ||
    parsed.idempotencyKey !== identity.idempotencyKey ||
    parsed.requestFingerprint !== identity.requestFingerprint
  ) {
    throw new Error('canonical_action_store_receipt_identity_mismatch');
  }
  return parsed;
}

function resultForLookup(
  result: CanonicalActionExecutionLookup | CanonicalActionExecutionClaim,
  identity: CanonicalActionExecutionIdentity,
): CanonicalActionExecutionResult | null {
  if (result.kind === 'in_progress' || result.kind === 'conflict') return { kind: result.kind };
  if (result.kind === 'replay') {
    return { kind: 'replay', receipt: assertReceiptIdentity(result.receipt, identity) };
  }
  return null;
}

function makeReceiptDraft(
  input: CanonicalActionExecutionInput,
  decision: CanonicalActionPolicyResult,
  attempt: number,
  result: Readonly<{
    kind: CanonicalActionReceiptDraft['kind'];
    summary: string;
    resultReference: string | null;
    changedReferences: readonly string[];
    errorCode: string | null;
    redactedError: string | null;
    reversalToken: string | null;
    reversesReceiptId?: string | null;
  }>,
): CanonicalActionReceiptDraft {
  return canonicalActionReceiptDraftSchema.parse({
    contractVersion: 1,
    userId: input.identity.userId,
    executionRequestId: input.identity.executionRequestId,
    actionId: input.actionId,
    actionType: input.actionType,
    authority: input.policyInput.authority,
    channel: input.policyInput.channel,
    policyDecision: decision.decision,
    policyReason: decision.reason,
    kind: result.kind,
    summary: result.summary,
    resultReference: result.resultReference,
    changedReferences: [...result.changedReferences],
    errorCode: result.errorCode,
    redactedError: result.redactedError,
    reversalToken: result.reversalToken,
    reversesReceiptId: result.reversesReceiptId ?? null,
    idempotencyKey: input.identity.idempotencyKey,
    requestFingerprint: input.identity.requestFingerprint,
    correlationId: input.correlationId,
    attempt,
  });
}

function persistOutcomeDraft(
  input: CanonicalActionExecutionInput,
  decision: CanonicalActionPolicyResult,
  attempt: number,
  outcome: z.infer<typeof canonicalActionAdapterOutcomeSchema>,
  reversesReceiptId: string | null = null,
): CanonicalActionReceiptDraft {
  return makeReceiptDraft(input, decision, attempt, {
    kind: outcome.kind,
    summary: outcome.summary,
    resultReference: outcome.resultReference,
    changedReferences: outcome.changedReferences,
    errorCode: outcome.kind === 'succeeded' ? null : outcome.errorCode,
    redactedError: outcome.kind === 'succeeded' ? null : outcome.redactedError,
    reversalToken: outcome.reversalToken,
    reversesReceiptId,
  });
}

function unresolvedDraft(
  input: CanonicalActionExecutionInput,
  decision: CanonicalActionPolicyResult,
  attempt: number,
  errorCode: string,
  summary: string,
  kind: 'waiting_for_dependency' | 'failed' = 'waiting_for_dependency',
  reversesReceiptId: string | null = null,
): CanonicalActionReceiptDraft {
  return makeReceiptDraft(input, decision, attempt, {
    kind,
    summary,
    resultReference: null,
    changedReferences: [],
    errorCode,
    redactedError: null,
    reversalToken: null,
    reversesReceiptId,
  });
}

async function persistOnce(
  store: CanonicalActionExecutionStore,
  identity: CanonicalActionExecutionIdentity,
  claimToken: string,
  draft: CanonicalActionReceiptDraft,
): Promise<CanonicalActionExecutionResult> {
  const completion = await store.complete(identity, claimToken, draft);
  if (completion.kind === 'conflict') return { kind: 'conflict' };
  return {
    kind: completion.kind === 'replay' ? 'replay' : 'completed',
    receipt: assertReceiptIdentity(completion.receipt, identity),
  };
}

/**
 * Runs one action through the canonical policy and adapter seam. The adapter's
 * precondition check is immediately followed by execute with its opaque token.
 * A lost or malformed provider outcome is persisted as waiting for reconciliation
 * so the idempotency key cannot trigger a duplicate side effect.
 */
export async function executeCanonicalAction<TSchema extends z.ZodType>(
  untrustedInput: CanonicalActionExecutionInput,
  adapter: CanonicalActionAdapter<TSchema>,
  store: CanonicalActionExecutionStore,
): Promise<CanonicalActionExecutionResult> {
  const input = canonicalActionExecutionInputSchema.parse(untrustedInput);

  const existing = await store.lookup(input.identity);
  const existingResult = resultForLookup(existing, input.identity);
  if (existingResult) return existingResult;

  const decision = evaluateCanonicalActionPolicy(input.policyInput);
  await store.recordPolicyDecision(input.identity, decision);
  if (decision.decision !== 'allow') return { kind: 'policy_stopped', decision };

  if (!adapter.actionTypes.some((actionType) => actionType === input.actionType)) {
    return { kind: 'rejected', reason: 'action_type_not_supported' };
  }
  const payload = adapter.payloadSchema.safeParse(input.payload);
  if (!payload.success) return { kind: 'rejected', reason: 'invalid_payload' };

  const claim = await store.claim(input.identity);
  const claimResult = resultForLookup(claim, input.identity);
  if (claimResult) return claimResult;
  if (claim.kind !== 'claimed') throw new Error('canonical_action_claim_contract_invalid');

  const adapterContext = canonicalActionAdapterContextSchema.parse({
    userId: input.identity.userId,
    actionId: input.actionId,
    executionRequestId: input.identity.executionRequestId,
    idempotencyKey: input.identity.idempotencyKey,
    correlationId: input.correlationId,
    attempt: claim.attempt,
  });

  let rawPrecondition: unknown;
  try {
    rawPrecondition = await adapter.checkPreconditions(payload.data, adapterContext);
  } catch {
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        'precondition_check_unavailable',
        'The current target state could not be verified; reconcile before retrying.',
      ),
    );
  }

  const checked = canonicalActionPreconditionResultSchema.safeParse(rawPrecondition);
  if (!checked.success) {
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        'invalid_precondition_result',
        'The adapter did not return a valid precondition result; reconcile before retrying.',
      ),
    );
  }
  if (!checked.data.ready) {
    const isUnavailable = checked.data.reason === 'dependency_unavailable';
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        checked.data.reason,
        isUnavailable
          ? 'The required provider is unavailable; reconcile before retrying.'
          : 'The current target state does not permit this action; no change was attempted.',
        isUnavailable ? 'waiting_for_dependency' : 'failed',
      ),
    );
  }

  let rawOutcome: unknown;
  try {
    rawOutcome = await adapter.execute(payload.data, {
      ...adapterContext,
      currentStateToken: checked.data.currentStateToken,
    });
  } catch {
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        'adapter_outcome_unconfirmed',
        'The provider outcome could not be confirmed; reconcile external state before retrying.',
      ),
    );
  }

  const outcome = canonicalActionAdapterOutcomeSchema.safeParse(rawOutcome);
  if (!outcome.success) {
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        'invalid_adapter_outcome',
        'The adapter returned an invalid outcome; reconcile external state before retrying.',
      ),
    );
  }

  return persistOnce(
    store,
    input.identity,
    claim.claimToken,
    persistOutcomeDraft(input, decision, claim.attempt, outcome.data),
  );
}

/** Reverses an eligible persisted action through the same claim/receipt store. */
export async function executeCanonicalActionReversal<TSchema extends z.ZodType>(
  untrustedInput: CanonicalActionReversalInput,
  adapter: CanonicalActionAdapter<TSchema>,
  store: CanonicalActionExecutionStore,
): Promise<CanonicalActionExecutionResult> {
  const input = canonicalActionReversalInputSchema.parse(untrustedInput);
  const originalReceipt = input.originalReceipt;
  const existing = await store.lookup(input.identity);
  const existingResult = resultForLookup(existing, input.identity);
  if (existingResult) return existingResult;

  const decision = evaluateCanonicalActionPolicy(input.policyInput);
  await store.recordPolicyDecision(input.identity, decision);
  if (decision.decision !== 'allow') return { kind: 'policy_stopped', decision };
  if (
    !decision.reversible ||
    !adapter.actionTypes.some((actionType) => actionType === input.actionType) ||
    !adapter.checkReversalPreconditions ||
    !adapter.reverse
  ) {
    return { kind: 'rejected', reason: 'action_type_not_supported' };
  }
  const payload = adapter.payloadSchema.safeParse(input.payload);
  if (!payload.success) return { kind: 'rejected', reason: 'invalid_payload' };

  const claim = await store.claim(input.identity);
  const claimResult = resultForLookup(claim, input.identity);
  if (claimResult) return claimResult;
  if (claim.kind !== 'claimed') throw new Error('canonical_action_claim_contract_invalid');

  const adapterContext = canonicalActionAdapterContextSchema.parse({
    userId: input.identity.userId,
    actionId: input.actionId,
    executionRequestId: input.identity.executionRequestId,
    idempotencyKey: input.identity.idempotencyKey,
    correlationId: input.correlationId,
    attempt: claim.attempt,
  });
  const originalOutcome = canonicalActionAdapterOutcomeSchema.parse(
    originalReceipt.kind === 'succeeded'
      ? {
          kind: 'succeeded',
          summary: originalReceipt.summary,
          resultReference: originalReceipt.resultReference,
          changedReferences: originalReceipt.changedReferences,
          reversalToken: originalReceipt.reversalToken,
        }
      : {
          kind: 'partially_succeeded',
          summary: originalReceipt.summary,
          resultReference: originalReceipt.resultReference,
          changedReferences: originalReceipt.changedReferences,
          errorCode: originalReceipt.errorCode ?? 'partial_result',
          redactedError: originalReceipt.redactedError,
          reversalToken: originalReceipt.reversalToken,
        },
  );

  let rawPrecondition: unknown;
  try {
    rawPrecondition = await adapter.checkReversalPreconditions(
      payload.data,
      originalOutcome,
      adapterContext,
    );
  } catch {
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        'reversal_precondition_unavailable',
        'The current target state could not be verified for reversal; reconcile before retrying.',
        'waiting_for_dependency',
        originalReceipt.id,
      ),
    );
  }
  const checked = canonicalActionPreconditionResultSchema.safeParse(rawPrecondition);
  if (!checked.success || !checked.data.ready) {
    const failureReason =
      checked.success && checked.data.ready === false
        ? checked.data.reason
        : 'invalid_reversal_precondition';
    const dependencyUnavailable = failureReason === 'dependency_unavailable';
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        failureReason,
        dependencyUnavailable
          ? 'The reversal dependency is unavailable; reconcile before retrying.'
          : 'The action changed after its original receipt; no reversal was attempted.',
        dependencyUnavailable ? 'waiting_for_dependency' : 'failed',
        originalReceipt.id,
      ),
    );
  }

  let rawOutcome: unknown;
  try {
    rawOutcome = await adapter.reverse(payload.data, originalOutcome, {
      ...adapterContext,
      currentStateToken: checked.data.currentStateToken,
      originalReceiptId: originalReceipt.id,
    });
  } catch {
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        'reversal_outcome_unconfirmed',
        'The reversal outcome could not be confirmed; reconcile external state before retrying.',
        'waiting_for_dependency',
        originalReceipt.id,
      ),
    );
  }
  const outcome = canonicalActionAdapterOutcomeSchema.safeParse(rawOutcome);
  if (!outcome.success) {
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      unresolvedDraft(
        input,
        decision,
        claim.attempt,
        'invalid_reversal_outcome',
        'The adapter returned an invalid reversal result; reconcile external state before retrying.',
        'waiting_for_dependency',
        originalReceipt.id,
      ),
    );
  }
  if (outcome.data.kind === 'succeeded') {
    return persistOnce(
      store,
      input.identity,
      claim.claimToken,
      makeReceiptDraft(input, decision, claim.attempt, {
        ...outcome.data,
        kind: 'reversed',
        errorCode: null,
        redactedError: null,
        reversesReceiptId: originalReceipt.id,
        reversalToken: null,
      }),
    );
  }
  return persistOnce(
    store,
    input.identity,
    claim.claimToken,
    persistOutcomeDraft(input, decision, claim.attempt, outcome.data, originalReceipt.id),
  );
}
