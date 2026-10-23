import { z } from "zod";
import {
  type CanonicalActionAdapter,
  type CanonicalActionAdapterContext,
  type CanonicalActionAdapterOutcome,
  type CanonicalActionPreconditionResult,
} from "@ai-operations/contracts";

export const promptPromotionPayloadSchema = z
  .object({
    templateId: z.string().uuid(),
    targetVersion: z.number().int().positive(),
  })
  .strict();

export type PromptPromotionPayload = z.infer<
  typeof promptPromotionPayloadSchema
>;

export const promptPromotionTargetSchema = z
  .object({
    managerCode: z.string(),
    templateCode: z.string(),
    activeVersion: z.number().int().positive(),
    targetVersion: z.number().int().positive(),
    evaluationStatus: z.string(),
    evaluationPassed: z.boolean(),
  })
  .strict();
export type PromptPromotionTarget = z.infer<typeof promptPromotionTargetSchema>;

export type PromptTransitionInput = Readonly<{
  templateId: string;
  targetVersion: number;
  expectedActiveVersion: number;
  actorUserId: string;
  operation: "promote" | "rollback";
  idempotencyKey: string;
}>;

export const promptTransitionResultSchema = z
  .object({
    activeVersion: z.number().int().positive(),
    previousVersion: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();
export type PromptTransitionResult = z.infer<
  typeof promptTransitionResultSchema
>;

export interface PromptPromotionSource {
  loadTarget(
    templateId: string,
    targetVersion: number,
  ): Promise<PromptPromotionTarget | null>;
  transition(input: PromptTransitionInput): Promise<PromptTransitionResult>;
}

const promptRef = (templateId: string, version: number) =>
  `prompt-template:${templateId}:version:${version}`;

function parseVersionToken(token: string): number {
  if (!/^[1-9]\d*$/.test(token)) {
    throw new Error("prompt_active_version_token_invalid");
  }
  const value = Number(token);
  if (!Number.isSafeInteger(value)) {
    throw new Error("prompt_active_version_token_invalid");
  }
  return value;
}

async function transitionKey(
  context: CanonicalActionAdapterContext,
  operation: "promote" | "rollback",
) {
  const material =
    `${context.userId}:${context.executionRequestId}:${context.idempotencyKey}:${operation}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `ai44:${operation}:${hex}`;
}

export function createPromptPromotionAdapter(
  source: PromptPromotionSource,
): CanonicalActionAdapter<typeof promptPromotionPayloadSchema> {
  return {
    adapterCode: "systems-prompt-promotion-v1",
    actionTypes: ["review_prompt_promotion"],
    payloadSchema: promptPromotionPayloadSchema,
    async checkPreconditions(
      payload,
    ): Promise<CanonicalActionPreconditionResult> {
      let target: PromptPromotionTarget | null;
      try {
        target = await source.loadTarget(
          payload.templateId,
          payload.targetVersion,
        );
      } catch {
        return { ready: false, reason: "dependency_unavailable" };
      }
      if (
        !target ||
        target.managerCode !== "systems" ||
        target.templateCode !== "controlled-agent-report"
      ) {
        return { ready: false, reason: "target_unsupported" };
      }
      if (
        target.activeVersion === payload.targetVersion ||
        !["evaluated", "promoted"].includes(target.evaluationStatus) ||
        !target.evaluationPassed
      ) {
        return { ready: false, reason: "precondition_failed" };
      }
      return {
        ready: true,
        currentStateToken: String(target.activeVersion),
        checkedAt: new Date().toISOString(),
      };
    },
    async execute(payload, context): Promise<CanonicalActionAdapterOutcome> {
      const expectedActiveVersion = parseVersionToken(
        context.currentStateToken,
      );
      const transition = await source.transition({
        templateId: payload.templateId,
        targetVersion: payload.targetVersion,
        expectedActiveVersion,
        actorUserId: context.userId,
        operation: "promote",
        idempotencyKey: await transitionKey(context, "promote"),
      });
      if (
        transition.activeVersion !== payload.targetVersion ||
        transition.previousVersion !== expectedActiveVersion
      ) {
        throw new Error("prompt_promotion_transition_mismatch");
      }
      return {
        kind: "succeeded",
        summary: "The evaluated prompt version was promoted.",
        resultReference: promptRef(payload.templateId, payload.targetVersion),
        changedReferences: [
          promptRef(payload.templateId, payload.targetVersion),
        ],
        reversalToken: `${payload.targetVersion}:${transition.previousVersion}`,
      };
    },
    async checkReversalPreconditions(
      payload,
      originalOutcome,
    ): Promise<CanonicalActionPreconditionResult> {
      const reversal = /^([1-9]\d*):([1-9]\d*)$/.exec(
        originalOutcome.reversalToken ?? "",
      );
      if (!reversal || Number(reversal[1]) !== payload.targetVersion) {
        return { ready: false, reason: "target_unsupported" };
      }
      let priorTarget: PromptPromotionTarget | null;
      try {
        priorTarget = await source.loadTarget(
          payload.templateId,
          Number(reversal[2]),
        );
      } catch {
        return { ready: false, reason: "dependency_unavailable" };
      }
      if (
        !priorTarget ||
        priorTarget.managerCode !== "systems" ||
        priorTarget.templateCode !== "controlled-agent-report" ||
        !["approved", "promoted"].includes(priorTarget.evaluationStatus)
      ) {
        return { ready: false, reason: "target_unsupported" };
      }
      if (priorTarget.activeVersion !== payload.targetVersion) {
        return { ready: false, reason: "precondition_failed" };
      }
      return {
        ready: true,
        currentStateToken: String(priorTarget.activeVersion),
        checkedAt: new Date().toISOString(),
      };
    },
    async reverse(
      payload,
      originalOutcome,
      context,
    ): Promise<CanonicalActionAdapterOutcome> {
      const reversal = /^([1-9]\d*):([1-9]\d*)$/.exec(
        originalOutcome.reversalToken ?? "",
      );
      if (!reversal || Number(reversal[1]) !== payload.targetVersion) {
        throw new Error("prompt_reversal_token_invalid");
      }
      const expectedActiveVersion = parseVersionToken(
        context.currentStateToken,
      );
      if (expectedActiveVersion !== payload.targetVersion) {
        throw new Error("prompt_reversal_active_version_changed");
      }
      const previousVersion = Number(reversal[2]);
      const transition = await source.transition({
        templateId: payload.templateId,
        targetVersion: previousVersion,
        expectedActiveVersion,
        actorUserId: context.userId,
        operation: "rollback",
        idempotencyKey: await transitionKey(context, "rollback"),
      });
      if (
        transition.activeVersion !== previousVersion ||
        transition.previousVersion !== expectedActiveVersion
      ) {
        throw new Error("prompt_reversal_transition_mismatch");
      }
      return {
        kind: "succeeded",
        summary:
          "The prompt version was restored to its prior approved version.",
        resultReference: promptRef(payload.templateId, previousVersion),
        changedReferences: [
          promptRef(payload.templateId, expectedActiveVersion),
        ],
        reversalToken: null,
      };
    },
  };
}
