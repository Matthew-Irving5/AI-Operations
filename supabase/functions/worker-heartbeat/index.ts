import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
Deno.serve(async (request) => {
  if (
    request.method !== "POST" ||
    request.headers.get("x-worker-secret") !== Deno.env.get("WORKER_SECRET")
  ) return json({ code: "unauthorised" }, 401);
  const body = await request.json().catch(() => null) as
    | { deviceId?: string }
    | null;
  if (!body?.deviceId) return json({ code: "device_required" }, 400);
  const { data, error } = await service.from("worker_devices").update({
    state: "online",
    last_heartbeat_at: new Date().toISOString(),
  }).eq("id", body.deviceId).in("state", ["paired", "online", "offline"])
    .select("id");
  if (error || !data?.length) return json({ code: "heartbeat_rejected" }, 422);
  const { error: heartbeatError } = await service.from("worker_heartbeats")
    .insert({
      device_id: body.deviceId,
    });
  if (heartbeatError) return json({ code: "heartbeat_record_failed" }, 500);
  const { error: queuedError } = await service.from("digital_scans").update({
    status: "queued",
  }).eq("device_id", body.deviceId).eq("status", "waiting_for_device");
  return queuedError
    ? json({ code: "scan_queue_failed" }, 500)
    : json({ ok: true });
});
