import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

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
  const body = await request.json() as {
    workflowCode?: string;
    managerCode?: string;
    hardCapUsd?: number;
    modelCeiling?: string;
    searchCeiling?: number;
    idempotencyKey?: string;
  };
  if (
    !body.workflowCode || !body.managerCode || !body.idempotencyKey ||
    !Number.isFinite(body.hardCapUsd) || !Number.isInteger(body.searchCeiling)
  ) return json({ code: "invalid_request" }, 400);
  const definition = await service.from("workflow_definitions").select("id").eq(
    "code",
    body.workflowCode,
  ).eq("active", true).maybeSingle();
  if (definition.error || !definition.data) {
    return json({ code: "workflow_unavailable" }, 404);
  }
  const { data: runId, error } = await service.rpc("create_on_demand_run", {
    p_user_id: user.user.id,
    p_workflow_id: definition.data.id,
    p_manager_code: body.managerCode,
    p_hard_cap: body.hardCapUsd,
    p_model_ceiling: body.modelCeiling ?? "gpt-5.6-terra",
    p_search_ceiling: body.searchCeiling,
    p_idempotency_key: body.idempotencyKey,
  });
  return error ? json({ code: "launch_rejected" }, 422) : json({ runId }, 201);
});
