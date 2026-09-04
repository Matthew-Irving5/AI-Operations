import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { z } from "https://esm.sh/zod@4.1.5";
import {
  isGoogleSyncError,
  syncGoogleConnection,
} from "../_shared/google-sync.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const internalRequestSchema = z.object({
  connectionId: z.string().uuid(),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/).optional(),
}).strict();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

Deno.serve(async (request) => {
  const syncSecret = Deno.env.get("GOOGLE_SYNC_SECRET");
  if (
    request.method !== "POST" ||
    !syncSecret || request.headers.get("x-google-sync-secret") !== syncSecret
  ) {
    return json({ code: "unauthorised" }, 401);
  }
  const parsed = internalRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return json({ code: "invalid_request" }, 400);
  try {
    const result = await syncGoogleConnection({
      database: service,
      connectionId: parsed.data.connectionId,
    });
    return json(result, result.ok ? 200 : 207);
  } catch (error) {
    const code = isGoogleSyncError(error)
      ? error.message
      : "google_sync_failed";
    return json({ code }, code === "connection_unavailable" ? 404 : 502);
  }
});
