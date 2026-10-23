import { type ManagerCode, managerCodeSchema } from "@ai-operations/contracts";
import {
  createAndQueueInterAgentRequest,
  type InterAgentDelegationPersistence,
  type InterAgentRouteAuthorizer,
} from "../../../packages/manager-core/src/delegation-runtime.ts";
import {
  acceptCreatedWorkflowRun,
  type WorkflowLaunchDispatchEvent,
} from "../workflow-launch/worker-dispatch.ts";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const requestSchema = z.object({
  sourceRunId: uuidSchema,
  destinationManagerCode: managerCodeSchema,
  destinationWorkflowCode: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(1).max(4000),
  requiredOutputContract: z.record(z.string(), z.unknown()),
  contextEvidenceIds: z.array(uuidSchema).max(50).default([]),
  priority: z.number().int().min(0).max(4).default(2),
  deadlineAt: z.string().datetime({ offset: true }).nullable().default(null),
  sourceMessageId: uuidSchema.nullable().default(null),
}).strict();

export type InterAgentSourceRun = Readonly<{
  id: string;
  userId: string;
  managerCode: ManagerCode;
  status: string;
  correlationId: string;
  costRootRunId: string | null;
  routingPath: readonly ManagerCode[];
}>;

export interface InterAgentDelegationHandlerDependencies {
  isAuthorized(request: Request): boolean;
  loadSourceRun(sourceRunId: string): Promise<InterAgentSourceRun | null>;
  authorizer: InterAgentRouteAuthorizer;
  persistence: InterAgentDelegationPersistence;
  dispatchRun?: (runId: string) => Promise<boolean>;
  waitUntil?: (task: Promise<unknown>) => void;
  logDispatchEvent?: (event: WorkflowLaunchDispatchEvent) => void;
  newId?: () => string;
  now?: () => string;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createInterAgentDelegationHandler(
  dependencies: InterAgentDelegationHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return json({ code: "method_not_allowed" }, 405);
    }
    if (!dependencies.isAuthorized(request)) {
      return json({ code: "unauthorised" }, 401);
    }
    const rawBody = await request.text();
    if (rawBody.length > 16_000) {
      return json({ code: "invalid_request" }, 413);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawBody);
    } catch {
      return json({ code: "invalid_request" }, 400);
    }
    const parsed = requestSchema.safeParse(decoded);
    if (!parsed.success) return json({ code: "invalid_request" }, 400);

    let source: InterAgentSourceRun | null;
    try {
      source = await dependencies.loadSourceRun(parsed.data.sourceRunId);
    } catch {
      return json({ code: "source_run_unavailable" }, 503);
    }
    if (!source) return json({ code: "source_run_not_found" }, 404);
    if (
      source.id !== parsed.data.sourceRunId ||
      !["running", "waiting_for_dependency"].includes(source.status)
    ) {
      return json({ code: "source_run_not_delegatable" }, 409);
    }

    try {
      const created = await createAndQueueInterAgentRequest({
        request: {
          userId: source.userId,
          sourceRunId: source.id,
          sourceMessageId: parsed.data.sourceMessageId,
          sourceManagerCode: source.managerCode,
          destinationManagerCode: parsed.data.destinationManagerCode,
          destinationWorkflowCode: parsed.data.destinationWorkflowCode,
          objective: parsed.data.objective,
          requiredOutputContract: parsed.data.requiredOutputContract,
          contextEvidenceIds: parsed.data.contextEvidenceIds,
          priority: parsed.data.priority,
          deadlineAt: parsed.data.deadlineAt,
          correlationId: source.correlationId,
        },
        routingPath: source.routingPath,
        sourceRunLineage: {
          id: source.id,
          costRootRunId: source.costRootRunId,
        },
        authorizer: dependencies.authorizer,
        persistence: dependencies.persistence,
        newId: dependencies.newId,
        now: dependencies.now,
      });
      if (!created.duplicate && dependencies.dispatchRun) {
        acceptCreatedWorkflowRun(
          created.destinationRunId,
          dependencies.dispatchRun,
          dependencies.waitUntil,
          dependencies.logDispatchEvent ?? (() => undefined),
        );
      }
      return json({
        requestId: created.request.id,
        destinationRunId: created.destinationRunId,
        duplicate: created.duplicate,
        status: "requested",
      }, 202);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "inter_agent_capability_missing") {
        return json({ code }, 403);
      }
      if (
        code.startsWith("inter_agent_request_") ||
        code.startsWith("inter_agent_routing_")
      ) {
        return json({ code }, 422);
      }
      return json({ code: "inter_agent_request_failed" }, 503);
    }
  };
}
