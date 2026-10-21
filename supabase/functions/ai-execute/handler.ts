import {
  executeAiRequestSchema,
  executeWorkflowOutcomeSchema,
} from "./orchestration-contract.ts";
import { canonicalActionExecutionResultSchema } from "@ai-operations/manager-core/action-execution";

export interface WorkflowExecutionHandlerDependencies {
  workerSecret: string;
  serviceRoleKey: string;
  execute(runId: string): Promise<unknown>;
  executeAction?(executionRequestId: string): Promise<unknown>;
  timingSafeEqual(left: string, right: string): boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createWorkflowExecutionHandler(
  dependencies: WorkflowExecutionHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return json({ code: "method_not_allowed" }, 405);
    }
    const workerAuthorized = dependencies.workerSecret.length > 0 &&
      dependencies.timingSafeEqual(
        request.headers.get("x-worker-secret") ?? "",
        dependencies.workerSecret,
      );
    const serviceAuthorized = dependencies.serviceRoleKey.length > 0 &&
      dependencies.timingSafeEqual(
        request.headers.get("authorization") ?? "",
        `Bearer ${dependencies.serviceRoleKey}`,
      );
    if (!workerAuthorized && !serviceAuthorized) {
      return json({ code: "unauthorised" }, 401);
    }
    const parsedRequest = executeAiRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsedRequest.success) return json({ code: "invalid_request" }, 400);
    if ("executionRequestId" in parsedRequest.data) {
      if (!dependencies.executeAction) {
        return json({ code: "action_executor_unavailable" }, 503);
      }
      let result: unknown;
      try {
        result = await dependencies.executeAction(
          parsedRequest.data.executionRequestId,
        );
      } catch {
        return json({ code: "canonical_action_execution_failed" }, 500);
      }
      const parsedResult = canonicalActionExecutionResultSchema.safeParse(
        result,
      );
      if (!parsedResult.success) {
        return json({ code: "invalid_action_execution_result" }, 500);
      }
      return json(parsedResult.data);
    }
    let result: unknown;
    try {
      result = await dependencies.execute(parsedRequest.data.runId);
    } catch {
      return json(
        {
          runId: parsedRequest.data.runId,
          outcome: "retryable_failure",
          errorCode: "workflow_execution_failed",
        },
        200,
      );
    }
    const parsedOutcome = executeWorkflowOutcomeSchema.safeParse(result);
    if (
      !parsedOutcome.success ||
      parsedOutcome.data.runId !== parsedRequest.data.runId
    ) {
      return json({ code: "invalid_execution_outcome" }, 500);
    }
    return json(parsedOutcome.data);
  };
}
