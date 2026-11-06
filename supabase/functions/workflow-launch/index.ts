import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import { getAal2Identity } from "../_shared/auth-assurance.ts";
import {
  isProcurementRevisionReference,
  isWorkflowLaunchRequest,
} from "./request-contract.ts";
import {
  acceptCreatedWorkflowRun,
  createWorkflowRunDispatcher,
} from "./worker-dispatch.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const dispatchRun = createWorkflowRunDispatcher(
  Deno.env.get("WORKER_SECRET"),
  ({ body, headers }) =>
    service.functions.invoke("job-worker", { body, headers }),
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return json({ code: "unauthorised" }, 401);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: token } },
  });
  const accessToken = token.slice("Bearer ".length);
  const user = await getAal2Identity(
    accessToken,
    (jwt) => caller.auth.getUser(jwt),
  );
  if (
    !user.user || user.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) {
    return json({ code: "forbidden" }, 403);
  }
  if (!(await consumeRateLimit(user.user.id, "workflow_launch", 10))) {
    return json({ code: "rate_limited" }, 429);
  }
  const decoded: unknown = await request.json().catch(() => null);
  if (!isRecord(decoded)) return json({ code: "invalid_request" }, 400);
  const body = decoded;
  if (
    typeof body.workflowCode !== "string" ||
    typeof body.managerCode !== "string" ||
    typeof body.idempotencyKey !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey) ||
    typeof body.hardCapUsd !== "number" || !Number.isFinite(body.hardCapUsd) ||
    body.hardCapUsd <= 0 || body.hardCapUsd > 1000 ||
    !["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"].includes(
      String(body.modelCeiling),
    ) ||
    typeof body.searchCeiling !== "number" ||
    !Number.isInteger(body.searchCeiling) ||
    body.searchCeiling < 0 || body.searchCeiling > 20 ||
    (body.workflowCode === "procurement-on-demand-research" &&
      body.searchCeiling < 1) ||
    !isProcurementRevisionReference(
      body.managerCode,
      body.revisionOfResearchRunId,
    ) ||
    !isWorkflowLaunchRequest(body.workflowCode, body.managerCode, body.request)
  ) {
    return json({ code: "invalid_request" }, 400);
  }
  const modelCeiling = String(body.modelCeiling);
  const definition = await service
    .from("workflow_definitions")
    .select("id")
    .eq("code", body.workflowCode)
    .eq("active", true)
    .maybeSingle();
  if (definition.error || !definition.data) {
    return json({ code: "workflow_unavailable" }, 404);
  }
  const revisionOfResearchRunId =
    typeof body.revisionOfResearchRunId === "string"
      ? body.revisionOfResearchRunId
      : null;
  const { data: runId, error } = await service.rpc(
    revisionOfResearchRunId
      ? "create_procurement_revision_request"
      : "create_on_demand_run_request",
    {
      p_user_id: user.user.id,
      p_workflow_id: definition.data.id,
      p_manager_code: body.managerCode,
      p_hard_cap: body.hardCapUsd,
      p_model_ceiling: modelCeiling,
      p_search_ceiling: body.searchCeiling,
      p_idempotency_key: body.idempotencyKey,
      p_request: body.request,
      ...(revisionOfResearchRunId
        ? { p_revises_research_run_id: revisionOfResearchRunId }
        : {}),
    },
  );
  if (error) return json({ code: "launch_rejected" }, 422);
  if (typeof runId !== "string") {
    return json({ code: "launch_rejected" }, 422);
  }
  await service.from("audit_events").insert({
    user_id: user.user.id,
    actor_type: "user",
    action_type: "launch_on_demand_workflow",
    target_type: "workflow_run",
    target_id: runId,
    aal: "aal2",
    result: "success",
    redacted_after: {
      workflow: body.workflowCode,
      manager: body.managerCode,
      hard_cap: body.hardCapUsd,
      search_ceiling: body.searchCeiling,
      has_revision_source: revisionOfResearchRunId !== null,
      request_keys: Object.keys(body.request),
    },
  });
  const edgeRuntime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void };
    }
  ).EdgeRuntime;
  const accepted = acceptCreatedWorkflowRun(
    runId,
    dispatchRun,
    edgeRuntime?.waitUntil.bind(edgeRuntime),
    (event) => console.warn(JSON.stringify(event)),
  );
  return json(accepted.body, accepted.status);
});
