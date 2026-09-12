import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const codes = new Set([
  "supabase",
  "cloudflare_r2",
  "openai",
  "google_oauth",
  "initial_login",
  "totp",
  "gmail_test",
  "apple_bridge",
  "health_export",
  "source_permissions",
  "windows_worker",
  "personal_profile",
  "finance_mapping",
  "github_connection",
  "schedule_review",
  "restore_test",
  "production_acceptance",
]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed", requestId }, 405);
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) {
    return json({ code: "unauthorised", requestId }, 401);
  }
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: token } },
  });
  const { data: identity } = await caller.auth.getUser();
  const body = await request.json().catch(() => null) as {
    code?: string;
    complete?: boolean;
  } | null;
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) return json({ code: "authenticated_session_required", requestId }, 403);
  if (!await consumeRateLimit(identity.user.id, "onboarding_update", 30)) {
    return json({ code: "rate_limited", requestId }, 429);
  }
  if (
    !body || !codes.has(body.code ?? "") || typeof body.complete !== "boolean"
  ) return json({ code: "invalid_checklist_item", requestId }, 400);
  if (body.code === "production_acceptance") {
    return json({ code: "acceptance_requires_finalise", requestId }, 422);
  }
  const completed_at = body.complete ? new Date().toISOString() : null;
  let metadata: Record<string, unknown> = {};
  if (body.code === "windows_worker" && body.complete) {
    const device = await service.from("worker_devices").select(
      "id,last_heartbeat_at,paired_at,state,revoked_at",
    ).eq("user_id", identity.user.id).in("state", ["paired", "online"])
      .is("revoked_at", null).not("paired_at", "is", null)
      .gte(
        "last_heartbeat_at",
        new Date(Date.now() - 30 * 60_000).toISOString(),
      )
      .order("last_heartbeat_at", { ascending: false }).limit(1).maybeSingle();
    if (device.error || !device.data) {
      return json({
        code: "windows_worker_evidence_required",
        stage: "checklist",
        reason: "recent_heartbeat_missing",
        requestId,
      }, 422);
    }
    const scan = await service.from("digital_scans").select(
      "id,completed_at,result_verified_at,scan_kind,status",
    ).eq("user_id", identity.user.id).eq("device_id", device.data.id)
      .eq("scan_kind", "lightweight").eq("status", "complete")
      .not("result_verified_at", "is", null)
      .gte(
        "completed_at",
        new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
      )
      .order("completed_at", { ascending: false }).limit(1).maybeSingle();
    if (scan.error || !scan.data) {
      return json({
        code: "windows_worker_evidence_required",
        stage: "checklist",
        reason: "verified_smoke_scan_missing",
        requestId,
      }, 422);
    }
    metadata = {
      verifiedAt: completed_at,
      deviceId: device.data.id,
      pairedAt: device.data.paired_at,
      heartbeatAt: device.data.last_heartbeat_at,
      smokeScanId: scan.data.id,
      smokeScanCompletedAt: scan.data.completed_at,
      resultVerifiedAt: scan.data.result_verified_at,
    };
  }
  const update = await service.rpc("update_onboarding_checklist_item", {
    p_user_id: identity.user.id,
    p_code: body.code,
    p_completed_at: completed_at,
    p_metadata: metadata,
  });
  if (update.error) {
    return json({
      code: "onboarding_update_failed",
      reason: update.error.code ?? "database_error",
      requestId,
    }, 500);
  }
  await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "onboarding_item_updated",
    target_type: "onboarding_checklist",
    target_id: body.code,
    aal: "aal2",
    result: "success",
    redacted_after: {
      complete: body.complete,
      ...(body.code === "windows_worker" ? metadata : {}),
    },
  });
  return json({
    code: body.code,
    completedAt: completed_at,
    metadata,
    requestId,
  });
});
