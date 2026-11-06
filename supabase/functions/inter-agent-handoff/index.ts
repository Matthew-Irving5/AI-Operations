import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { conversationHandoffSchema } from "@ai-operations/contracts";
import { createConversationHandoffPersistence } from "../../../packages/manager-core/src/handoff-persistence.ts";
import { createInterAgentHandoffHandler } from "./handler.ts";
import { verifySharedSecret } from "../_shared/auth-contract.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const workerSecret = Deno.env.get("WORKER_SECRET");

Deno.serve(createInterAgentHandoffHandler({
  isAuthorized: (request) =>
    verifySharedSecret(request, "x-worker-secret", workerSecret),
  async loadHandoff(handoffId, userId) {
    const result = await service.from("conversation_handoffs")
      .select(
        "id,conversation_id,user_id,from_manager_code,to_manager_code,reason,source_message_id,status,initiated_at,accepted_at,correlation_id,idempotency_key",
      )
      .eq("id", handoffId)
      .eq("user_id", userId)
      .maybeSingle();
    if (result.error || !result.data) return null;
    const handoff = conversationHandoffSchema.safeParse({
      contractVersion: 1,
      id: result.data.id,
      conversationId: result.data.conversation_id,
      userId: result.data.user_id,
      fromManagerCode: result.data.from_manager_code,
      toManagerCode: result.data.to_manager_code,
      reason: result.data.reason,
      sourceMessageId: result.data.source_message_id,
      status: result.data.status,
      initiatedAt: result.data.initiated_at,
      acceptedAt: result.data.accepted_at,
      correlationId: result.data.correlation_id,
      idempotencyKey: result.data.idempotency_key,
    });
    return handoff.success ? handoff.data : null;
  },
  authorizer: {
    async canTransferOwnership(fromManagerCode, toManagerCode) {
      const managers = await service.from("managers")
        .select("id,code,enabled")
        .in("code", [fromManagerCode, toManagerCode]);
      if (managers.error || !managers.data || managers.data.length !== 2) {
        return false;
      }
      const capabilities = await service.from("manager_capabilities")
        .select("manager_id,permissions,enabled")
        .eq("capability_code", "inter_agent_requests")
        .in("manager_id", managers.data.map((manager) => manager.id));
      if (capabilities.error || !capabilities.data) return false;
      const source = managers.data.find((manager) =>
        manager.code === fromManagerCode
      );
      const destination = managers.data.find((manager) =>
        manager.code === toManagerCode
      );
      const sourceCapability = capabilities.data.find((item) =>
        item.manager_id === source?.id
      );
      const destinationCapability = capabilities.data.find((item) =>
        item.manager_id === destination?.id
      );
      return source?.enabled === true && destination?.enabled === true &&
        sourceCapability?.enabled === true &&
        Array.isArray(sourceCapability.permissions) &&
        sourceCapability.permissions.includes("write") &&
        sourceCapability.permissions.includes("enqueue") &&
        destinationCapability?.enabled === true &&
        Array.isArray(destinationCapability.permissions) &&
        destinationCapability.permissions.includes("read");
    },
  },
  persistence: createConversationHandoffPersistence({
    rpc: async (functionName, parameters) =>
      await service.rpc(functionName, parameters),
  }),
}));
