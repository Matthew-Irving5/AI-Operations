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
  if (body.code === "finance_mapping" && body.complete) {
    const account = service.from("finance_accounts").select(
      "id,currency,active,created_at",
    ).eq("user_id", identity.user.id).eq("active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const categories = service.from("finance_categories").select(
      "id",
    ).eq("user_id", identity.user.id).eq("active", true);
    const statement = service.from("finance_statements").select(
      "id,account_id,status,created_at,currency",
    ).eq("user_id", identity.user.id).eq("status", "parsed")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const transactions = service.from("finance_transactions").select(
      "id",
      { count: "exact", head: true },
    ).eq("user_id", identity.user.id);
    const close = service.from("finance_close_periods").select(
      "id,readiness,reconciled,created_at",
    ).eq("user_id", identity.user.id).eq("readiness", "ready")
      .eq("reconciled", true).order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    const results = await Promise.all([
      account,
      categories,
      statement,
      transactions,
      close,
    ]);
    const [
      accountResult,
      categoryResult,
      statementResult,
      transactionResult,
      closeResult,
    ] = results;
    const failedTable = accountResult.error
      ? "accounts"
      : categoryResult.error
      ? "categories"
      : statementResult.error
      ? "statements"
      : transactionResult.error
      ? "transactions"
      : closeResult.error
      ? "close_periods"
      : null;
    const failedError = accountResult.error ?? categoryResult.error ??
      statementResult.error ?? transactionResult.error ?? closeResult.error;
    if (failedTable && failedError) {
      const table = failedTable;
      const errorCode = failedError.code ?? "database_error";
      return json({
        code: "finance_mapping_evidence_check_failed",
        stage: `checklist.finance_${table}_read`,
        httpStatus: 500,
        detail:
          `The finance checklist validator could not read ${table} (${errorCode}).`,
        remediation:
          "Retry once; if it repeats, provide the request ID. The checklist was not changed.",
        requestId,
        diagnostic: {
          code: "finance_mapping_evidence_check_failed",
          stage: `checklist.finance_${table}_read`,
          httpStatus: 500,
          requestId,
          detail:
            `The finance checklist validator could not read ${table} (${errorCode}).`,
          remediation:
            "Retry once; if it repeats, provide the request ID. The checklist was not changed.",
        },
      }, 500);
    }
    const missing: string[] = [];
    if (!accountResult.data) missing.push("active_finance_account");
    if ((categoryResult.data?.length ?? 0) < 1) {
      missing.push("category_mapping");
    }
    if (!statementResult.data) missing.push("parsed_statement");
    if ((transactionResult.count ?? 0) < 1) missing.push("stored_transactions");
    if (!closeResult.data) missing.push("reconciled_close");
    if (
      statementResult.data && accountResult.data &&
      statementResult.data.account_id !== accountResult.data.id
    ) missing.push("statement_account_match");
    if (missing.length) {
      return json({
        code: "finance_mapping_evidence_required",
        stage: "checklist.finance_evidence",
        httpStatus: 422,
        reason: "finance_mapping_not_complete",
        missing,
        detail:
          "The server cannot verify a configured, imported, deduplicated, and reconciled finance source yet.",
        remediation:
          "Configure an account and categories, import a controlled statement, verify a reconciled close, then retry.",
        requestId,
        diagnostic: {
          code: "finance_mapping_evidence_required",
          stage: "checklist.finance_evidence",
          httpStatus: 422,
          requestId,
          detail: `Missing finance evidence: ${missing.join(", ")}.`,
          remediation:
            "Configure an account and categories, import a controlled statement, verify a reconciled close, then retry.",
        },
      }, 422);
    }
    metadata = {
      verifiedAt: completed_at,
      accountId: accountResult.data!.id,
      categoryCount: categoryResult.data?.length ?? 0,
      statementId: statementResult.data!.id,
      transactionCount: transactionResult.count ?? 0,
      closePeriodId: closeResult.data!.id,
      evidence: "server_verified_finance_mapping",
    };
  }
  if (body.code === "personal_profile" && body.complete) {
    const profile = await service.from("personal_profiles").select(
      "updated_at,planning_preferences,home_location_id,work_location_id",
    ).eq("user_id", identity.user.id).maybeSingle();
    if (profile.error) {
      return json({
        code: "personal_profile_evidence_check_failed",
        stage: "checklist.profile_read",
        httpStatus: 500,
        detail: `The profile evidence query failed (${
          profile.error.code ?? "database_error"
        }).`,
        remediation:
          "Retry once; if it repeats, provide the request ID to support.",
        requestId,
      }, 500);
    }
    const locations = await service.from("personal_locations").select(
      "id,location_kind,encrypted_address",
    ).eq("user_id", identity.user.id);
    const preferences = await service.from("time_preferences").select(
      "weekday",
    ).eq("user_id", identity.user.id);
    const user = await service.from("app_users").select("timezone").eq(
      "id",
      identity.user.id,
    ).single();
    const failed = [locations, preferences, user].find((result) =>
      result.error
    );
    if (failed?.error) {
      return json({
        code: "personal_profile_evidence_check_failed",
        stage: "checklist.profile_dependencies",
        httpStatus: 500,
        detail: `A profile dependency query failed (${
          failed.error.code ?? "database_error"
        }).`,
        remediation:
          "Retry once; if it repeats, provide the request ID to support.",
        requestId,
      }, 500);
    }
    const planning = (profile.data?.planning_preferences ?? {}) as Record<
      string,
      unknown
    >;
    const missing: string[] = [];
    if (!profile.data) missing.push("profile_record");
    if (!user.data || user.data.timezone !== "Europe/London") {
      missing.push("timezone_europe_london");
    }
    if (!locations.data?.length) missing.push("approved_location");
    if (!profile.data?.updated_at) missing.push("profile_updated_at");
    for (
      const field of [
        "normalWorkStart",
        "normalWorkEnd",
        "quietStart",
        "quietEnd",
        "maximumFocusDurationMinutes",
        "minimumUnscheduledBufferMinutes",
        "minimumEveningBufferMinutes",
        "preparationBufferMinutes",
        "travelBufferPercent",
        "minimumTravelBufferMinutes",
        "transportPreferences",
      ]
    ) {
      if (
        planning[field] === undefined || planning[field] === null ||
        planning[field] === ""
      ) missing.push(`planning_preferences.${field}`);
    }
    const weekdays = new Set(
      (preferences.data ?? []).map((item) => item.weekday),
    );
    if (weekdays.size !== 7) missing.push("seven_weekday_preferences");
    if (missing.length) {
      return json({
        code: "personal_profile_evidence_required",
        stage: "checklist.evidence",
        httpStatus: 422,
        reason: "profile_not_complete",
        missing,
        detail:
          "The server cannot verify a complete Personal Operating Profile yet.",
        remediation:
          "Open Personal, complete the listed fields, save successfully, then retry the checklist item.",
        requestId,
      }, 422);
    }
    metadata = {
      verifiedAt: completed_at,
      profileUpdatedAt: profile.data?.updated_at,
      locationCount: locations.data?.length ?? 0,
      locationKinds: [
        ...new Set(
          (locations.data ?? []).map((location) => location.location_kind),
        ),
      ],
      timePreferenceDays: weekdays.size,
      evidence: "server_verified_personal_profile",
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
