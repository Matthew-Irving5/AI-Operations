import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (
  body: unknown,
  status = 200,
  requestId: string = crypto.randomUUID(),
) =>
  new Response(
    JSON.stringify({ ...(body as Record<string, unknown>), requestId }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
      },
    },
  );
Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return json(
      { code: "method_not_allowed", stage: "scan_create" },
      405,
      requestId,
    );
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) {
    return json({ code: "unauthorised", stage: "scan_create" }, 401, requestId);
  }
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
  ) {
    return json(
      { code: "fresh_mfa_required", stage: "scan_create" },
      403,
      requestId,
    );
  }
  if (!await consumeRateLimit(identity.user.id, "digital_scan_create", 10)) {
    return json({ code: "rate_limited", stage: "scan_create" }, 429, requestId);
  }
  if (
    !body?.deviceId || !Array.isArray(body.roots) || !body.roots.length ||
    body.roots.some((root) =>
      typeof root !== "string" || root.includes("..")
    ) || !["lightweight", "deep"].includes(body.scanKind ?? "") ||
    !Number.isFinite(body.hardCapUsd) ||
    !Number.isInteger(body.searchCeiling) || !body.idempotencyKey
  ) {
    return json(
      { code: "invalid_scan_request", stage: "scan_create" },
      400,
      requestId,
    );
  }
  const device = await service.from("worker_devices").select("id,state").eq(
    "id",
    body.deviceId,
  ).eq("user_id", identity.user.id).maybeSingle();
  if (!device.data || device.data.state === "revoked") {
    return json(
      { code: "device_unavailable", stage: "scan_create" },
      422,
      requestId,
    );
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
  if (runError || !runId) {
    return json(
      { code: "scan_budget_rejected", stage: "budget" },
      422,
      requestId,
    );
  }
  const existing = await service.from("digital_scans").select("id,status").eq(
    "run_id",
    runId,
  ).maybeSingle();
  if (existing.data) {
    return json({ scan: existing.data, runId, replay: true }, 200, requestId);
  }
  // Device workers own these workflow runs. Prevent the generic job worker from
  // treating a local scan as an AI/synthetic job while retaining the run ledger.
  const { error: queueError } = await service.from("job_queue").update({
    status: "cancelled",
    completed_at: new Date().toISOString(),
  }).eq("run_id", runId).eq("status", "queued");
  if (queueError) {
    return json(
      { code: "scan_queue_initialisation_failed", stage: "queue" },
      500,
      requestId,
    );
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
    ? json({ code: "scan_create_failed", stage: "persistence" }, 500, requestId)
    : json({ scan, runId, stage: "scan_create" }, 201, requestId);
});
