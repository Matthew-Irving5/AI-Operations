import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { z } from "https://esm.sh/zod@4.1.5";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import { consumeMfaActionGate } from "../_shared/mfa-action-gate.ts";
import {
  isGoogleSyncError,
  revokeGoogleConnection,
} from "../_shared/google-sync.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const inputSchema = z.object({
  connectionId: z.string().uuid(),
  mfaGateId: z.string().uuid(),
}).strict();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

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
  return {
    user: identity.data.user,
    accessToken: authorization.replace(/^Bearer\s+/i, ""),
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: "invalid_request" }, 400);
  const caller = await authenticate(request);
  if (!caller) return json({ code: "fresh_mfa_required" }, 403);
  const { user } = caller;
  if (!await consumeRateLimit(user.id, "google_connection_revoke", 3)) {
    return json({ code: "rate_limited" }, 429);
  }
  if (
    !await consumeMfaActionGate(
      parsed.data.mfaGateId,
      caller.accessToken,
      "connection_revoke",
    )
  ) return json({ code: "fresh_mfa_required" }, 403);
  try {
    const result = await revokeGoogleConnection(
      service,
      parsed.data.connectionId,
      user.id,
    );
    const audit = await service.from("audit_events").insert({
      user_id: user.id,
      actor_type: "user",
      action_type: "google_connection_revoked",
      target_type: "connection",
      target_id: parsed.data.connectionId,
      aal: "aal2_fresh",
      result: result.provider_revoked
        ? "success"
        : "provider_revoke_failed_db_disabled",
      redacted_after: {
        provider_revoked: result.provider_revoked,
        credential_deleted: result.credential_deleted,
        sync_enabled: false,
      },
    });
    if (audit.error) return json({ code: "audit_persistence_failed" }, 500);
    return json(result, result.status === "revoked" ? 200 : 207);
  } catch (error) {
    const code = isGoogleSyncError(error)
      ? error.message
      : "google_revoke_failed";
    await service.from("audit_events").insert({
      user_id: user.id,
      actor_type: "user",
      action_type: "google_connection_revoked",
      target_type: "connection",
      target_id: parsed.data.connectionId,
      aal: "aal2_fresh",
      result: "failed",
      redacted_after: { error_code: code },
    });
    return json({ code }, code === "connection_unavailable" ? 404 : 500);
  }
});
