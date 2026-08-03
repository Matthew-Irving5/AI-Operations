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
  const device = await service.from("worker_devices").select(
    "id,state,revoked_at",
  ).eq("id", body.deviceId).maybeSingle();
  if (
    !device.data || device.data.state === "revoked" || device.data.revoked_at
  ) return json({ code: "device_revoked" }, 403);
  const scan = await service.from("digital_scans").select(
    "id,scan_kind,approved_roots",
  ).eq("device_id", body.deviceId).in("status", [
    "queued",
    "waiting_for_device",
  ])
    .order("created_at").limit(1).maybeSingle();
  if (scan.data) {
    const updated = await service.from("digital_scans").update({
      status: "running",
      progress: 1,
      started_at: new Date().toISOString(),
    }).eq("id", scan.data.id).in("status", ["queued", "waiting_for_device"])
      .select("id,scan_kind,approved_roots").maybeSingle();
    if (updated.data) return json({ scan: updated.data, manifest: null });
  }
  const manifest = await service.from("worker_action_manifests").select(
    "id,payload,signature_b64,expires_at",
  ).eq("device_id", body.deviceId).is("consumed_at", null).gt(
    "expires_at",
    new Date().toISOString(),
  ).order("created_at").limit(1).maybeSingle();
  return manifest.error
    ? json({ code: "poll_failed" }, 500)
    : json({ scan: null, manifest: manifest.data });
});
