import {
  type ConversationHandoff,
  conversationHandoffSchema,
  managerCodeSchema,
} from "@ai-operations/contracts";
import {
  type ConversationHandoffAuthorizer,
  type ConversationHandoffPersistence,
  requestConversationHandoff,
  resolveConversationHandoff,
} from "../../../packages/manager-core/src/handoff-runtime.ts";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const operationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("request"),
    handoff: conversationHandoffSchema,
  }).strict(),
  z.object({
    operation: z.literal("resolve"),
    handoffId: uuidSchema,
    userId: uuidSchema,
    status: z.enum(["accepted", "rejected", "cancelled"]),
    actorManagerCode: managerCodeSchema,
  }).strict(),
]);

export interface InterAgentHandoffDependencies {
  isAuthorized(request: Request): boolean;
  loadHandoff(
    handoffId: string,
    userId: string,
  ): Promise<ConversationHandoff | null>;
  authorizer: ConversationHandoffAuthorizer;
  persistence: ConversationHandoffPersistence;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createInterAgentHandoffHandler(
  dependencies: InterAgentHandoffDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return json({ code: "method_not_allowed" }, 405);
    }
    if (!dependencies.isAuthorized(request)) {
      return json({ code: "unauthorised" }, 401);
    }
    const body = await request.text();
    if (body.length > 16_000) return json({ code: "invalid_request" }, 413);
    let decoded: unknown;
    try {
      decoded = JSON.parse(body);
    } catch {
      return json({ code: "invalid_request" }, 400);
    }
    const parsed = operationSchema.safeParse(decoded);
    if (!parsed.success) return json({ code: "invalid_request" }, 400);

    try {
      if (parsed.data.operation === "request") {
        const created = await requestConversationHandoff({
          handoff: parsed.data.handoff,
          authorizer: dependencies.authorizer,
          persistence: dependencies.persistence,
        });
        return json(created, 202);
      }
      const handoff = await dependencies.loadHandoff(
        parsed.data.handoffId,
        parsed.data.userId,
      );
      if (!handoff) {
        return json({ code: "conversation_handoff_not_found" }, 404);
      }
      const resolved = await resolveConversationHandoff({
        handoff,
        status: parsed.data.status,
        actorManagerCode: parsed.data.actorManagerCode,
        persistence: dependencies.persistence,
      });
      return json(resolved);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "conversation_handoff_capability_missing") {
        return json({ code }, 403);
      }
      if (code.startsWith("conversation_handoff_")) {
        return json({ code }, 422);
      }
      return json({ code: "conversation_handoff_failed" }, 503);
    }
  };
}
