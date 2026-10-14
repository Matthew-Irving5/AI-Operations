import { z } from "zod";
import {
  workflowDefinitionReferenceSchema,
  workflowRunStateSchema,
} from "@ai-operations/contracts";

export const executeWorkflowRequestSchema = z.object({
  runId: z.string().uuid(),
}).strict();

const safeErrorCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{2,99}$/);
export const executeWorkflowOutcomeSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      runId: z.string().uuid(),
      outcome: z.literal("succeeded"),
      reportId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      runId: z.string().uuid(),
      outcome: z.literal("submitted"),
      responseId: z.string().regex(/^resp_[A-Za-z0-9_-]+$/),
    })
    .strict(),
  z
    .object({
      runId: z.string().uuid(),
      outcome: z.literal("retryable_failure"),
      errorCode: safeErrorCodeSchema,
    })
    .strict(),
  z
    .object({
      runId: z.string().uuid(),
      outcome: z.literal("terminal_failure"),
      errorCode: safeErrorCodeSchema,
    })
    .strict(),
]);

const controlKeys = new Set([
  "userId",
  "user_id",
  "managerCode",
  "manager_code",
  "workflowCode",
  "workflow_code",
  "workflowDefinitionId",
  "workflow_definition_id",
  "model",
  "model_id",
  "promptCode",
  "prompt_code",
  "estimatedCost",
  "estimated_cost",
  "hardCapUsd",
  "hard_cap",
  "searchCeiling",
  "search_ceiling",
  "requestId",
  "request_id",
  "maxAttempts",
  "max_attempts",
  "background",
  "run_id",
  "schedule_id",
  "execution_mode",
]);
const workflowInputSchema = z.record(z.string(), z.unknown()).superRefine(
  (input, context) => {
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 10_000) {
      context.addIssue({ code: "custom", message: "workflow_input_too_large" });
    }
    for (const key of controlKeys) {
      if (Object.hasOwn(input, key)) {
        context.addIssue({
          code: "custom",
          message: "workflow_input_contains_control_field",
          path: [key],
        });
      }
    }
  },
);

export type ExecuteWorkflowRequest = z.infer<
  typeof executeWorkflowRequestSchema
>;
export type ExecuteWorkflowOutcome = z.infer<
  typeof executeWorkflowOutcomeSchema
>;
export type TrustedWorkflowExecution = Readonly<{
  run: z.infer<typeof workflowRunStateSchema>;
  definition: z.infer<typeof workflowDefinitionReferenceSchema>;
  input: Record<string, unknown>;
}>;

export interface WorkflowExecutionSource {
  loadRun(runId: string): Promise<unknown | null>;
  loadDefinition(definitionId: string): Promise<unknown | null>;
  loadInput(runId: string): Promise<unknown | null>;
}

export async function loadTrustedWorkflowExecution(
  runId: string,
  source: WorkflowExecutionSource,
): Promise<TrustedWorkflowExecution> {
  const runResult = await source.loadRun(runId);
  const run = workflowRunStateSchema.parse(runResult);
  if (run.id !== runId || !["queued", "running"].includes(run.status)) {
    throw new Error("workflow_run_not_executable");
  }

  const definitionResult = await source.loadDefinition(
    run.workflowDefinitionId,
  );
  const definition = workflowDefinitionReferenceSchema.parse(definitionResult);
  if (
    definition.id !== run.workflowDefinitionId ||
    definition.managerCode !== run.managerCode
  ) {
    throw new Error("workflow_manager_contract_mismatch");
  }

  const input = workflowInputSchema.parse(await source.loadInput(run.id));
  return { run, definition, input };
}
