import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return json({ code: "unauthorised" }, 401);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: token } },
  });
  const [{ data: user }, { data: assurance }] = await Promise.all([
    caller.auth.getUser(),
    caller.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (
    !user.user ||
    user.user.email?.toLowerCase() !== "matthewirving99@gmail.com" ||
    assurance?.currentLevel !== "aal2"
  ) return json({ code: "forbidden" }, 403);
  if (!await consumeRateLimit(user.user.id, "workflow_launch", 10)) {
    return json({ code: "rate_limited" }, 429);
  }
  const body = await request.json() as {
    workflowCode?: string;
    managerCode?: string;
    hardCapUsd?: number;
    modelCeiling?: string;
    searchCeiling?: number;
    idempotencyKey?: string;
    request?: Record<string, unknown>;
  };
  if (
    !body.workflowCode || !body.managerCode || !body.idempotencyKey ||
    !Number.isFinite(body.hardCapUsd) ||
    !Number.isInteger(body.searchCeiling) ||
    !body.request || Array.isArray(body.request) ||
    Object.keys(body.request).length === 0
  ) return json({ code: "invalid_request" }, 400);
  const definition = await service.from("workflow_definitions").select("id").eq(
    "code",
    body.workflowCode,
  ).eq("active", true).maybeSingle();
  if (definition.error || !definition.data) {
    return json({ code: "workflow_unavailable" }, 404);
  }
  const { data: runId, error } = await service.rpc(
    "create_on_demand_run_request",
    {
      p_user_id: user.user.id,
      p_workflow_id: definition.data.id,
      p_manager_code: body.managerCode,
      p_hard_cap: body.hardCapUsd,
      p_model_ceiling: body.modelCeiling ?? "gpt-5.6-terra",
      p_search_ceiling: body.searchCeiling,
      p_idempotency_key: body.idempotencyKey,
      p_request: body.request,
    },
  );
  if (error) return json({ code: "launch_rejected" }, 422);
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
      request_keys: Object.keys(body.request),
    },
  });
  return json({ runId }, 201);
});
