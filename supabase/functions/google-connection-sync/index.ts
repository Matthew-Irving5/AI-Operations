import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { z } from "https://esm.sh/zod@4.1.5";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import {
  type GoogleSyncResult,
  isGoogleSyncError,
  syncGoogleConnection,
} from "../_shared/google-sync.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const requestSchema = z.object({
  connectionId: z.string().uuid(),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
}).strict();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
};

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
  return identity.data.user;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const user = await authenticate(request);
  if (!user) return json({ code: "aal2_required" }, 403);
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return json({ code: "invalid_request" }, 400);
  const body = parsed.data;
  const connection = await service.from("connections").select("id")
    .eq("id", body.connectionId).eq("user_id", user.id).eq("provider", "google")
    .maybeSingle();
  if (connection.error || !connection.data) {
    return json({ code: "connection_unavailable" }, 404);
  }
  if (!await consumeRateLimit(user.id, "google_connection_sync", 3)) {
    return json({ code: "rate_limited" }, 429);
  }
  const requestHash = await digest(JSON.stringify(body));
  const inserted = await service.from("google_sync_requests").insert({
    user_id: user.id,
    connection_id: body.connectionId,
    idempotency_key: body.idempotencyKey,
    request_hash: requestHash,
    status: "running",
  }).select("status,response,error_code,request_hash").maybeSingle();
  if (inserted.error) {
    const existing = await service.from("google_sync_requests").select(
      "status,response,error_code,request_hash",
    ).eq("user_id", user.id).eq("connection_id", body.connectionId)
      .eq("idempotency_key", body.idempotencyKey).maybeSingle().returns<{
      status: "running" | "succeeded" | "failed";
      response: GoogleSyncResult | null;
      error_code: string | null;
      request_hash: string;
    }>();
    if (existing.error || !existing.data) {
      return json({ code: "request_claim_failed" }, 500);
    }
    if (existing.data.request_hash !== requestHash) {
      return json({ code: "idempotency_payload_mismatch" }, 409);
    }
    if (existing.data.status === "running") {
      return json({ code: "sync_in_progress" }, 202);
    }
    if (existing.data.status === "succeeded" && existing.data.response) {
      return json(existing.data.response);
    }
    return json(
      { code: existing.data.error_code ?? "google_sync_failed" },
      502,
    );
  }

  try {
    const result = await syncGoogleConnection({
      database: service,
      connectionId: body.connectionId,
    });
    const settled = await service.from("google_sync_requests").update({
      status: "succeeded",
      response: result,
      completed_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("connection_id", body.connectionId)
      .eq("idempotency_key", body.idempotencyKey).eq("status", "running")
      .select("id").maybeSingle();
    if (settled.error || !settled.data) {
      return json({ code: "sync_settlement_failed" }, 500);
    }
    return json(result, result.ok ? 200 : 207);
  } catch (error) {
    const code = isGoogleSyncError(error)
      ? error.message
      : "google_sync_failed";
    const settled = await service.from("google_sync_requests").update({
      status: "failed",
      error_code: code,
      completed_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("connection_id", body.connectionId)
      .eq("idempotency_key", body.idempotencyKey)
      .eq("status", "running").select("id").maybeSingle();
    if (settled.error || !settled.data) {
      return json({ code: "sync_settlement_failed" }, 500);
    }
    return json({ code }, code === "connection_unavailable" ? 404 : 502);
  }
});
