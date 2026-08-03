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
  const [{ data: identity }, { data: assurance }] = await Promise.all([
    caller.auth.getUser(),
    caller.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const body = await request.json().catch(() => null) as {
    deviceId?: string;
    roots?: string[];
    scanKind?: string;
    hardCapUsd?: number;
    searchCeiling?: number;
    idempotencyKey?: string;
  } | null;
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com" ||
    assurance?.currentLevel !== "aal2"
  ) return json({ code: "fresh_mfa_required" }, 403);
  if (!await consumeRateLimit(identity.user.id, "digital_scan_create", 10)) {
    return json({ code: "rate_limited" }, 429);
  }
  if (
    !body?.deviceId || !Array.isArray(body.roots) || !body.roots.length ||
    body.roots.some((root) =>
      typeof root !== "string" || root.includes("..")
    ) || !["lightweight", "deep"].includes(body.scanKind ?? "") ||
    !Number.isFinite(body.hardCapUsd) ||
    !Number.isInteger(body.searchCeiling) || !body.idempotencyKey
  ) return json({ code: "invalid_scan_request" }, 400);
  const device = await service.from("worker_devices").select("id,state").eq(
    "id",
    body.deviceId,
  ).eq("user_id", identity.user.id).maybeSingle();
  if (!device.data || device.data.state === "revoked") {
    return json({ code: "device_unavailable" }, 422);
  }
  const workflow = await service.from("workflow_definitions").select("id").eq(
    "code",
    body.scanKind === "deep"
      ? "digital-estate-deep-scan"
      : "digital-estate-lightweight",
  ).single();
  const { data: runId, error: runError } = await service.rpc(
    "create_on_demand_run",
    {
      p_user_id: identity.user.id,
      p_workflow_id: workflow.data?.id,
      p_manager_code: "digital_estate",
      p_hard_cap: body.hardCapUsd,
      p_model_ceiling: "gpt-5.6-terra",
      p_search_ceiling: body.searchCeiling,
      p_idempotency_key: body.idempotencyKey,
    },
  );
  if (runError || !runId) return json({ code: "scan_budget_rejected" }, 422);
  // Device workers own these workflow runs. Prevent the generic job worker from
  // treating a local scan as an AI/synthetic job while retaining the run ledger.
  const { error: queueError } = await service.from("job_queue").update({
    status: "cancelled",
    completed_at: new Date().toISOString(),
  }).eq("run_id", runId).eq("status", "queued");
  if (queueError) {
    return json({ code: "scan_queue_initialisation_failed" }, 500);
  }
  const { data: scan, error } = await service.from("digital_scans").insert({
    user_id: identity.user.id,
    device_id: body.deviceId,
    run_id: runId,
    scan_kind: body.scanKind,
    approved_roots: body.roots,
    status: device.data.state === "online" ? "queued" : "waiting_for_device",
  }).select("id,status").single();
  return error
    ? json({ code: "scan_create_failed" }, 500)
    : json({ scan, runId }, 201);
});
