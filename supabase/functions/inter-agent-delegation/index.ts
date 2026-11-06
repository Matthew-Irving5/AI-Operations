import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { managerCodeSchema } from "@ai-operations/contracts";
import { createInterAgentDelegationPersistence } from "../../../packages/manager-core/src/delegation-persistence.ts";
import { createInterAgentDelegationHandler } from "./handler.ts";
import { verifySharedSecret } from "../_shared/auth-contract.ts";
import {
  createWorkflowRunDispatcher,
  type WorkflowLaunchDispatchEvent,
} from "../workflow-launch/worker-dispatch.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const workerSecret = Deno.env.get("WORKER_SECRET");
const relationRecord = (value: unknown): Record<string, unknown> | null => {
  const relation = Array.isArray(value) ? value[0] : value;
  return typeof relation === "object" && relation !== null &&
      !Array.isArray(relation)
    ? relation as Record<string, unknown>
    : null;
};

const dispatchRun = createWorkflowRunDispatcher(
  workerSecret,
  ({ body, headers }) =>
    service.functions.invoke("job-worker", { body, headers }),
);
const edgeRuntime = (
  globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void };
  }
).EdgeRuntime;

Deno.serve(createInterAgentDelegationHandler({
  isAuthorized: (request) =>
    verifySharedSecret(request, "x-worker-secret", workerSecret),
  async loadSourceRun(sourceRunId) {
    const result = await service.from("workflow_runs")
      .select(
        "id,user_id,status,correlation_id,cost_root_run_id,workflow_definitions!inner(managers!inner(code))",
      )
      .eq("id", sourceRunId)
      .maybeSingle();
    if (result.error) throw new Error("source_run_lookup_failed");
    if (!result.data) return null;
    const definition = relationRecord(result.data.workflow_definitions);
    const manager = relationRecord(definition?.managers);
    const managerCode = managerCodeSchema.safeParse(manager?.code);
    if (
      !managerCode.success || typeof result.data.id !== "string" ||
      typeof result.data.user_id !== "string" ||
      typeof result.data.status !== "string" ||
      typeof result.data.correlation_id !== "string" ||
      (result.data.cost_root_run_id !== null &&
        typeof result.data.cost_root_run_id !== "string")
    ) return null;

    const queue = await service.from("job_queue")
      .select("payload")
      .eq("run_id", sourceRunId)
      .eq("job_type", "workflow_execute")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (queue.error || !queue.data) return null;
    const payload = relationRecord(queue.data.payload);
    const request = relationRecord(payload?.request);
    const rawPath = request?.delegationPath;
    const routingPath = Array.isArray(rawPath)
      ? rawPath.map((code) => managerCodeSchema.safeParse(code))
      : [];
    const validatedPath = routingPath.length > 0 &&
        routingPath.every((entry) => entry.success)
      ? routingPath.map((entry) => entry.data)
      : [managerCode.data];
    if (validatedPath.at(-1) !== managerCode.data) return null;
    return {
      id: result.data.id,
      userId: result.data.user_id,
      managerCode: managerCode.data,
      status: result.data.status,
      correlationId: result.data.correlation_id,
      costRootRunId: result.data.cost_root_run_id,
      routingPath: validatedPath,
    };
  },
  authorizer: {
    async canDelegate(sourceManagerCode, destinationManagerCode) {
      const managers = await service.from("managers")
        .select("id,code,enabled")
        .in("code", [sourceManagerCode, destinationManagerCode]);
      if (managers.error || !managers.data || managers.data.length !== 2) {
        return false;
      }
      const managerIds = managers.data.map((manager) => manager.id);
      const capabilities = await service.from("manager_capabilities")
        .select("manager_id,permissions,enabled")
        .eq("capability_code", "inter_agent_requests")
        .in("manager_id", managerIds);
      if (capabilities.error || !capabilities.data) return false;
      const sourceManager = managers.data.find((manager) =>
        manager.code === sourceManagerCode
      );
      const destinationManager = managers.data.find((manager) =>
        manager.code === destinationManagerCode
      );
      const sourceCapability = capabilities.data.find((capability) =>
        capability.manager_id === sourceManager?.id
      );
      const destinationCapability = capabilities.data.find((capability) =>
        capability.manager_id === destinationManager?.id
      );
      return sourceManager?.enabled === true &&
        destinationManager?.enabled === true &&
        sourceCapability?.enabled === true &&
        Array.isArray(sourceCapability.permissions) &&
        sourceCapability.permissions.includes("write") &&
        sourceCapability.permissions.includes("enqueue") &&
        destinationCapability?.enabled === true &&
        Array.isArray(destinationCapability.permissions) &&
        destinationCapability.permissions.includes("read");
    },
  },
  persistence: createInterAgentDelegationPersistence({
    rpc: async (functionName, parameters) =>
      await service.rpc(functionName, parameters),
  }),
  dispatchRun,
  waitUntil: edgeRuntime?.waitUntil.bind(edgeRuntime),
  logDispatchEvent(event: WorkflowLaunchDispatchEvent) {
    console.warn(JSON.stringify(event));
  },
}));
