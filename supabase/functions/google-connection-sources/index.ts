import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { z } from "https://esm.sh/zod@4.1.5";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import {
  discoverGoogleSources,
  isGoogleSyncError,
} from "../_shared/google-sync.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const sourceId = z.string().min(1).max(320).refine(
  (value) =>
    [...value].every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    }),
  "source id contains control characters",
);
const selection = z.array(sourceId).max(100).refine(
  (values) => new Set(values).size === values.length,
  "duplicate source id",
);
const inputSchema = z.object({
  connectionId: z.string().uuid(),
  mfaGateId: z.string().uuid(),
  selected_calendar_ids: selection,
  selected_drive_file_ids: selection,
}).strict();
const json = (body: unknown, status = 200, requestId?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });

function diagnostic(error: unknown) {
  if (!isGoogleSyncError(error)) {
    return {
      code: "source_discovery_failed",
      stage: "source_discovery",
      reason: "unexpected_internal_error",
      retryable: true,
      status: 502,
      details: {},
    };
  }
  const providerStatus = error.status;
  const isConnectionUnavailable = error.message === "connection_unavailable";
  return {
    code: error.message,
    stage: error.stage,
    reason: error.providerError ?? error.message,
    retryable: !isConnectionUnavailable &&
      (providerStatus === undefined || providerStatus >= 500),
    status: isConnectionUnavailable ? 404 : 502,
    details: {
      ...(providerStatus === undefined
        ? {}
        : { provider_status: providerStatus }),
      ...(error.providerError ? { provider_error: error.providerError } : {}),
    },
  };
}

async function recordDiscoveryFailure(
  userId: string,
  connectionId: string,
  requestId: string,
  failure: ReturnType<typeof diagnostic>,
) {
  try {
    await service.from("audit_events").insert({
      user_id: userId,
      actor_type: "user",
      action_type: "google_source_discovery_failed",
      target_type: "connection",
      target_id: connectionId,
      aal: "aal2",
      correlation_id: requestId,
      result: "failure",
      redacted_after: {
        code: failure.code,
        stage: failure.stage,
        reason: failure.reason,
        retryable: failure.retryable,
        details: failure.details,
      },
    });
  } catch {
    // Keep the original diagnostic visible even if audit persistence is unavailable.
  }
}

async function authenticate(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.match(/^Bearer\s+\S+$/i)) return null;
  const caller = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );
  const identity = await caller.auth.getUser();
  if (
    !identity.data.user ||
    identity.data.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) return null;
  const aal2 = await caller.rpc("is_allowed_aal2");
  if (aal2.error || aal2.data !== true) return null;
  return { user: identity.data.user, database: caller };
}

async function ownedConnection(connectionId: string, userId: string) {
  const result = await service.from("connections").select(
    "id,provider,status,sync_enabled,configuration",
  ).eq("id", connectionId).eq("user_id", userId).eq("provider", "google")
    .maybeSingle().returns<{
    id: string;
    provider: string;
    status: string;
    sync_enabled: boolean;
    configuration: Record<string, unknown>;
  }>();
  return result.error || !result.data ? null : result.data;
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const caller = await authenticate(request);
  if (!caller) return json({ code: "aal2_required" }, 403);
  const { user } = caller;
  if (!await consumeRateLimit(user.id, "google_connection_sources", 10)) {
    return json({ code: "rate_limited" }, 429);
  }
  const url = new URL(request.url);
  const requestBody = request.method === "POST"
    ? await request.json().catch(() => null)
    : null;
  const connectionId = request.method === "GET"
    ? url.searchParams.get("connectionId")
    : (requestBody as { connectionId?: string } | null)?.connectionId;
  if (!connectionId || !z.string().uuid().safeParse(connectionId).success) {
    return json({ code: "invalid_request" }, 400);
  }
  const connection = await ownedConnection(connectionId, user.id);
  if (!connection) return json({ code: "connection_unavailable" }, 404);
  if (request.method === "GET") {
    try {
      const discovered = await discoverGoogleSources(service, connectionId);
      const configuration = connection.configuration ?? {};
      const selectedCalendarIds =
        Array.isArray(configuration.selected_calendar_ids)
          ? configuration.selected_calendar_ids.filter((
            value,
          ): value is string => typeof value === "string")
          : [];
      const selectedDriveFileIds =
        Array.isArray(configuration.selected_drive_file_ids)
          ? configuration.selected_drive_file_ids.filter((
            value,
          ): value is string => typeof value === "string")
          : [];
      return json({
        connectionId,
        requestId,
        calendars: discovered.calendars,
        driveFiles: discovered.driveFiles,
        selected_calendar_ids: selectedCalendarIds,
        selected_drive_file_ids: selectedDriveFileIds,
      }, 200, requestId);
    } catch (error) {
      const failure = diagnostic(error);
      await recordDiscoveryFailure(user.id, connectionId, requestId, failure);
      return json({
        code: failure.code,
        stage: failure.stage,
        reason: failure.reason,
        retryable: failure.retryable,
        requestId,
        details: failure.details,
      }, failure.status, requestId);
    }
  }
  const parsed = inputSchema.safeParse(requestBody);
  if (!parsed.success) return json({ code: "invalid_request" }, 400);
  if (parsed.data.connectionId !== connectionId) {
    return json({ code: "invalid_request" }, 400);
  }
  const updated = await caller.database.rpc("update_google_source_selection", {
    p_connection_id: connectionId,
    p_selected_calendar_ids: parsed.data.selected_calendar_ids,
    p_selected_drive_file_ids: parsed.data.selected_drive_file_ids,
    p_gate_id: parsed.data.mfaGateId,
  });
  if (updated.error) {
    return json({ code: "connection_scope_change_failed" }, 500);
  }
  const outcome = Array.isArray(updated.data) ? updated.data[0] : updated.data;
  const gateCode = outcome?.code as string | undefined;
  if (gateCode === "connection_unavailable") {
    return json({ code: gateCode }, 404);
  }
  if (gateCode === "invalid_source_selection") {
    return json({ code: gateCode }, 400);
  }
  if (gateCode === "invalid_mfa_gate") return json({ code: gateCode }, 400);
  if (
    gateCode === "fresh_mfa_required" || gateCode === "mfa_gate_wrong_user" ||
    gateCode === "mfa_gate_invalid_action" || gateCode === "mfa_gate_expired" ||
    gateCode === "mfa_gate_replayed"
  ) return json({ code: gateCode }, 403);
  if (outcome?.status !== "updated") {
    return json({ code: "connection_scope_change_failed" }, 500);
  }
  return json({
    connectionId,
    configuration: outcome.configuration,
  });
});
