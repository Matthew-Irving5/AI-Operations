import { z } from "npm:zod@4.1.5";
import {
  type CanonicalActionExecutionIdentity,
  type CanonicalActionPolicyResult,
  canonicalActionPolicyResultSchema,
  type CanonicalActionReceipt,
  canonicalActionReceiptSchema,
} from "@ai-operations/contracts";
import type {
  CanonicalActionCompletion,
  CanonicalActionExecutionClaim,
  CanonicalActionExecutionLookup,
  CanonicalActionExecutionStore,
} from "@ai-operations/manager-core/action-execution";

export interface CanonicalActionRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: unknown | null;
  }>;
}

const lookupSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("missing") }).strict(),
  z.object({ kind: z.literal("in_progress") }).strict(),
  z.object({ kind: z.literal("conflict") }).strict(),
  z.object({ kind: z.literal("replay"), receipt: canonicalActionReceiptSchema })
    .strict(),
]);

const claimSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("claimed"),
      claimToken: z.string().uuid(),
      attempt: z.number().int().positive(),
    })
    .strict(),
  z.object({ kind: z.literal("in_progress") }).strict(),
  z.object({ kind: z.literal("conflict") }).strict(),
  z.object({ kind: z.literal("replay"), receipt: canonicalActionReceiptSchema })
    .strict(),
]);

const completionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("persisted"),
    receipt: canonicalActionReceiptSchema,
  }).strict(),
  z.object({ kind: z.literal("replay"), receipt: canonicalActionReceiptSchema })
    .strict(),
  z.object({ kind: z.literal("conflict") }).strict(),
]);

async function callRpc<T>(
  client: CanonicalActionRpcClient,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error !== null) {
    throw new Error("canonical_action_persistence_unavailable");
  }
  return schema.parse(data);
}

function identityArgs(identity: CanonicalActionExecutionIdentity) {
  return {
    p_user_id: identity.userId,
    p_execution_request_id: identity.executionRequestId,
    p_idempotency_key: identity.idempotencyKey,
    p_request_fingerprint: identity.requestFingerprint,
  };
}

export function createSupabaseCanonicalActionExecutionStore(
  client: CanonicalActionRpcClient,
): CanonicalActionExecutionStore {
  return {
    async lookup(identity): Promise<CanonicalActionExecutionLookup> {
      return await callRpc(
        client,
        "lookup_canonical_action_execution",
        identityArgs(identity),
        lookupSchema,
      );
    },
    async recordPolicyDecision(
      identity,
      decision: CanonicalActionPolicyResult,
    ): Promise<void> {
      const validDecision = canonicalActionPolicyResultSchema.parse(decision);
      const recorded = await callRpc(
        client,
        "record_canonical_action_policy_decision",
        {
          ...identityArgs(identity),
          p_policy_decision: validDecision,
        },
        z.boolean(),
      );
      if (!recorded) {
        throw new Error("canonical_action_policy_binding_conflict");
      }
    },
    async claim(identity): Promise<CanonicalActionExecutionClaim> {
      return await callRpc(
        client,
        "claim_canonical_action_execution",
        identityArgs(identity),
        claimSchema,
      );
    },
    async complete(
      identity,
      claimToken,
      receipt,
    ): Promise<CanonicalActionCompletion> {
      return await callRpc(
        client,
        "complete_canonical_action_execution",
        {
          ...identityArgs(identity),
          p_claim_token: claimToken,
          p_receipt: receipt,
        },
        completionSchema,
      );
    },
  };
}

export function assertCanonicalActionReceipt(
  receipt: unknown,
): CanonicalActionReceipt {
  return canonicalActionReceiptSchema.parse(receipt);
}
