import {
  canonicalActionPolicyDefinitionFor,
  type CanonicalActionPolicyInput,
  canonicalActionReceiptSchema,
  managerCapabilityCodeSchema,
  managerCodeSchema,
  managerPermissionSchema,
  managerRiskClassSchema,
} from "@ai-operations/contracts";
import type { CanonicalActionDispatchEnvelope } from "./canonical-action-dispatcher.ts";
import { z } from "zod";

const loadedRequestSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    actionId: z.string().uuid().nullable(),
    executionMode: z.enum(["execute", "reverse"]),
    authority: z.enum(["verified_user", "agent_proposal", "standing_policy"]),
    channel: z.enum(["gmail", "web_chat", "internal"]),
    managerCode: managerCodeSchema,
    actionType: z.string().trim().min(1).max(100),
    riskClass: managerRiskClassSchema.nullable(),
    approvalState: z
      .enum([
        "not_required",
        "pending",
        "approved",
        "rejected",
        "expired",
        "invalidated",
      ])
      .nullable(),
    idempotencyKey: z.string().trim().min(8).max(255),
    requestFingerprint: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
    correlationId: z.string().uuid(),
    typedParameters: z.record(z.string(), z.unknown()),
    commandVersion: z.number().int().positive(),
    targetType: z.string().trim().min(1).max(100),
    targetReference: z.string().trim().max(512).nullable(),
    scope: z.string().trim().min(1).max(1000),
  })
  .strict();

const capabilityGrantSchema = z
  .object({
    capabilityCode: managerCapabilityCodeSchema,
    permissions: z.array(managerPermissionSchema),
  })
  .strict();

const loadedContextSchema = z
  .object({
    request: loadedRequestSchema,
    capabilities: z.array(capabilityGrantSchema),
    freshWebAal2: z.boolean(),
    standingPolicyPreauthorized: z.boolean(),
    originalReceipt: z.unknown().nullable(),
    originalPayload: z.unknown().nullable(),
  })
  .strict();

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort((
      [left],
      [right],
    ) => left.localeCompare(right));
    return `{${
      entries.map(([key, entry]) =>
        `${JSON.stringify(key)}:${stableJson(entry)}`
      ).join(",")
    }}`;
  }
  return JSON.stringify(value);
}

async function requestFingerprint(
  request: z.infer<typeof loadedRequestSchema>,
): Promise<string> {
  const immutableRequest = {
    userId: request.userId,
    actionId: request.actionId,
    executionMode: request.executionMode,
    authority: request.authority,
    channel: request.channel,
    managerCode: request.managerCode,
    actionType: request.actionType,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
    typedParameters: request.typedParameters,
    commandVersion: request.commandVersion,
    targetType: request.targetType,
    targetReference: request.targetReference,
    scope: request.scope,
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableJson(immutableRequest)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

function policyInput(
  context: z.infer<typeof loadedContextSchema>,
): CanonicalActionPolicyInput {
  const { request } = context;
  const definition = canonicalActionPolicyDefinitionFor(request.actionType);
  const grant = definition
    ? context.capabilities.find(
      (candidate) => candidate.capabilityCode === definition.requiredCapability,
    )
    : undefined;
  return {
    actionType: request.actionType,
    managerCode: request.managerCode,
    authority: request.authority,
    channel: request.channel,
    riskClass: request.riskClass ?? definition?.minimumRisk ?? "low",
    capabilities: context.capabilities.map((candidate) =>
      candidate.capabilityCode
    ),
    permissions: grant?.permissions ?? [],
    approvalState: request.approvalState ?? "not_required",
    freshWebAal2: context.freshWebAal2,
    standingPolicyPreauthorized: context.standingPolicyPreauthorized,
  };
}

export async function buildCanonicalActionDispatchEnvelope(
  untrustedContext: unknown,
): Promise<CanonicalActionDispatchEnvelope> {
  const context = loadedContextSchema.parse(untrustedContext);
  const request = context.request;
  const calculatedFingerprint = await requestFingerprint(request);
  if (
    request.requestFingerprint !== null &&
    request.requestFingerprint !== calculatedFingerprint
  ) {
    throw new Error("canonical_action_request_fingerprint_mismatch");
  }

  const common = {
    identity: {
      userId: request.userId,
      executionRequestId: request.id,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: calculatedFingerprint,
    },
    actionId: request.actionId,
    actionType: request.actionType,
    policyInput: policyInput(context),
    correlationId: request.correlationId,
  };
  if (request.executionMode === "reverse") {
    const originalReceipt = canonicalActionReceiptSchema.parse(
      context.originalReceipt,
    );
    if (
      !isRecord(request.typedParameters) ||
      typeof request.typedParameters.originalReceiptId !== "string" ||
      request.typedParameters.originalReceiptId !== originalReceipt.id ||
      context.originalPayload === null
    ) {
      throw new Error("canonical_action_reversal_context_invalid");
    }
    return {
      operation: "reverse",
      input: {
        ...common,
        payload: context.originalPayload,
        originalReceipt,
      },
    };
  }
  if (context.originalReceipt !== null || context.originalPayload !== null) {
    throw new Error("canonical_action_execution_context_unexpected_reversal");
  }
  return {
    operation: "execute",
    input: { ...common, payload: request.typedParameters },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
