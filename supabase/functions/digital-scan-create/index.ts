import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const remediationByCode: Record<string, string> = {
  method_not_allowed: "Call the digital-scan-create function with POST.",
  unauthorised:
    "Sign in as the allowlisted account and resume the scan in the same browser.",
  account_not_allowed:
    "Sign in as the allowlisted production account before requesting a scan.",
  fresh_mfa_required:
    "Complete fresh MFA for the read-only scan, then return to Digital Estate immediately.",
  invalid_scan_request:
    "Start the scan again from Digital Estate with the synthetic safe folder and the displayed device.",
  device_unavailable:
    "Refresh Devices and wait for a recent worker heartbeat before scanning.",
  rate_limited:
    "Wait briefly before requesting another scan; no scan was created.",
  scan_budget_rejected:
    "Use the bounded lightweight scan settings; no scan was created.",
  scan_queue_initialisation_failed:
    "The scan queue could not be initialised. Use the request ID to inspect the queue boundary.",
  workflow_definition_missing:
    "The Digital Estate workflow definition is missing from the control plane deployment.",
  device_lookup_failed:
    "The control plane could not read the paired device record. Use the request ID to inspect Supabase.",
  scan_create_failed:
    "The control plane could not persist the scan. Use the request ID to inspect Supabase.",
};
const json = (
  body: unknown,
  status = 200,
  requestId: string = crypto.randomUUID(),
) => {
  const payload = body as Record<string, unknown>;
  const code = typeof payload.code === "string" ? payload.code : undefined;
  const stage = typeof payload.stage === "string"
    ? payload.stage
    : "scan_create";
  const diagnostic = payload.diagnostic ?? (code
    ? {
      code,
      stage,
      httpStatus: status,
      requestId,
      route: "/functions/v1/digital-scan-create",
      method: "POST",
      detail:
        "The digital-scan-create control-plane boundary rejected the request.",
      remediation: remediationByCode[code] ??
        "Use the request ID to inspect the digital-scan-create control-plane logs.",
    }
    : undefined);
  return new Response(
    JSON.stringify({
      ...payload,
      requestId,
      ...(diagnostic ? { diagnostic } : {}),
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
      },
    },
  );
};
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
  const { data: identity, error: identityError } = await caller.auth.getUser();
  if (identityError || !identity.user) {
    return json(
      {
        code: "unauthorised",
        stage: "auth_user_lookup",
        detail:
          "Supabase Auth did not return an authenticated user for the scan request.",
      },
      401,
      requestId,
    );
  }
  if (identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com") {
    return json(
      {
        code: "account_not_allowed",
        stage: "allowlist_authorization",
        detail:
          "The authenticated identity is not the allowlisted production account.",
      },
      403,
      requestId,
    );
  }
  const body = await request.json().catch(() => null) as {
    deviceId?: string;
    roots?: string[];
    scanKind?: string;
    hardCapUsd?: number;
    searchCeiling?: number;
    idempotencyKey?: string;
    mfaGateId?: string;
  } | null;
  if (
    !body?.deviceId || !Array.isArray(body.roots) || !body.roots.length ||
    body.roots.some((root) =>
      typeof root !== "string" || root.includes("..")
    ) ||
    !["lightweight", "deep"].includes(body.scanKind ?? "") ||
    !Number.isFinite(body.hardCapUsd) ||
    !Number.isInteger(body.searchCeiling) ||
    !body.idempotencyKey || !/^[0-9a-f-]{36}$/i.test(body.mfaGateId ?? "")
  ) {
    return json(
      {
        code: "invalid_scan_request",
        stage: "request_validation",
        detail:
          "The device, roots, scan kind, budget, idempotency key, or MFA gate is invalid.",
      },
      400,
      requestId,
    );
  }
  if (!await consumeRateLimit(identity.user.id, "digital_scan_create", 10)) {
    return json({ code: "rate_limited", stage: "scan_create" }, 429, requestId);
  }
  const device = await service.from("worker_devices").select("id,state").eq(
    "id",
    body.deviceId,
  ).eq("user_id", identity.user.id).maybeSingle();
  if (device.error) {
    return json(
      { code: "device_lookup_failed", stage: "device_lookup" },
      500,
      requestId,
    );
  }
  if (!device.data || device.data.state === "revoked") {
    return json(
      { code: "device_unavailable", stage: "scan_create" },
      422,
      requestId,
    );
  }
  const workflowCode = body.scanKind === "deep"
    ? "digital-estate-deep-scan"
    : "digital-estate-lightweight";
  const workflow = await service.from("workflow_definitions").select("id").eq(
    "code",
    workflowCode,
  ).single();
  if (workflow.error || !workflow.data?.id) {
    return json(
      {
        code: "workflow_definition_missing",
        stage: "workflow_lookup",
        detail: workflow.error
          ? `Database lookup for workflow definition "${workflowCode}" failed (${
            workflow.error.code ?? "unknown"
          }).`
          : `No workflow definition named "${workflowCode}" exists in the control plane.`,
      },
      500,
      requestId,
    );
  }
  const { data: gateConsumed, error: gateError } = await caller.rpc(
    "consume_mfa_action_gate",
    { p_gate_id: body.mfaGateId, p_action_key: "digital_scan_create" },
  );
  if (gateError || gateConsumed !== true) {
    return json(
      {
        code: "fresh_mfa_required",
        stage: "mfa_gate_consume",
        detail: gateError
          ? "The one-time scan MFA gate could not be validated by the database boundary."
          : "The one-time scan MFA gate was missing, expired, replayed, or bound to another user.",
      },
      403,
      requestId,
    );
  }
  const { data: runId, error: runError } = await service.rpc(
    "create_on_demand_run",
    {
      p_user_id: identity.user.id,
      p_workflow_id: workflow.data.id,
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
      {
        code: "scan_queue_initialisation_failed",
        stage: "queue",
        detail: `Database queue initialisation failed (${
          queueError.code ?? "unknown"
        }).`,
      },
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
