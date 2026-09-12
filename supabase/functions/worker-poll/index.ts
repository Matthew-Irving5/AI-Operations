import { authenticateWorker, workerService } from "../_shared/worker-auth.ts";

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
    return json({ code: "method_not_allowed", stage: "poll" }, 405, requestId);
  }
  const body = await request.json().catch(() => null) as
    | { deviceId?: string }
    | null;
  if (!body?.deviceId) {
    return json({ code: "device_required", stage: "poll" }, 400, requestId);
  }
  const auth = await authenticateWorker(request, body.deviceId);
  if ("code" in auth) {
    return json(
      { code: auth.code, stage: "poll" },
      auth.code === "device_revoked" ? 403 : 401,
      requestId,
    );
  }
  const scan = await workerService.from("digital_scans").select(
    "id,scan_kind,approved_roots",
  ).eq("device_id", auth.device.id).in("status", [
    "queued",
    "waiting_for_device",
  ])
    .order("created_at").limit(1).maybeSingle();
  if (scan.data) {
    const updated = await workerService.from("digital_scans").update({
      status: "running",
      progress: 1,
      started_at: new Date().toISOString(),
    }).eq("id", scan.data.id).in("status", ["queued", "waiting_for_device"])
      .select("id,scan_kind,approved_roots").maybeSingle();
    if (updated.data) {
      return json(
        { scan: updated.data, manifest: null, stage: "poll" },
        200,
        requestId,
      );
    }
  }
  const manifest = await workerService.from("worker_action_manifests").select(
    "id,payload,signature_b64,expires_at",
  ).eq("device_id", auth.device.id).is("consumed_at", null).gt(
    "expires_at",
    new Date().toISOString(),
  ).order("created_at").limit(1).maybeSingle();
  return manifest.error
    ? json({ code: "poll_failed", stage: "poll" }, 500, requestId)
    : json(
      { scan: null, manifest: manifest.data, stage: "poll" },
      200,
      requestId,
    );
});
