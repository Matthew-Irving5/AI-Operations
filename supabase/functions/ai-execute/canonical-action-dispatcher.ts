import {
  canonicalActionExecutionInputSchema,
  type CanonicalActionExecutionResult,
  type CanonicalActionExecutionStore,
  canonicalActionReversalInputSchema,
  executeCanonicalAction,
  executeCanonicalActionReversal,
} from "@ai-operations/manager-core/action-execution";
import type { CanonicalActionAdapter } from "@ai-operations/contracts";
import { z } from "zod";

const dispatchEnvelopeSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("execute"),
      input: canonicalActionExecutionInputSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reverse"),
      input: canonicalActionReversalInputSchema,
    })
    .strict(),
]);

export type CanonicalActionDispatchEnvelope = z.infer<
  typeof dispatchEnvelopeSchema
>;

export interface CanonicalActionRequestSource {
  loadExecution(executionRequestId: string): Promise<unknown>;
}

export interface CanonicalActionDispatcherDependencies {
  source: CanonicalActionRequestSource;
  store: CanonicalActionExecutionStore;
  adapters: readonly CanonicalActionAdapter[];
}

export function createCanonicalActionDispatcher(
  dependencies: CanonicalActionDispatcherDependencies,
): (executionRequestId: string) => Promise<CanonicalActionExecutionResult> {
  return async (executionRequestId) => {
    if (!z.string().uuid().safeParse(executionRequestId).success) {
      throw new Error("canonical_action_execution_request_id_invalid");
    }
    const envelope = dispatchEnvelopeSchema.parse(
      await dependencies.source.loadExecution(executionRequestId),
    );
    const adapter = dependencies.adapters.find((candidate) =>
      candidate.actionTypes.some((actionType) =>
        actionType === envelope.input.actionType
      )
    );
    if (!adapter) {
      return { kind: "rejected", reason: "action_type_not_supported" };
    }
    if (envelope.operation === "reverse") {
      return await executeCanonicalActionReversal(
        envelope.input,
        adapter,
        dependencies.store,
      );
    }
    return await executeCanonicalAction(
      envelope.input,
      adapter,
      dependencies.store,
    );
  };
}
