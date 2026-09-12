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
    return json(
      { code: "method_not_allowed", stage: "heartbeat" },
      405,
      requestId,
    );
  }
  const body = await request.json().catch(() => null) as {
    deviceId?: string;
    workerVersion?: string;
    status?: Record<string, unknown>;
  } | null;
  if (!body?.deviceId) {
    return json(
      { code: "device_required", stage: "heartbeat" },
      400,
      requestId,
    );
  }
  const auth = await authenticateWorker(request, body.deviceId);
  if ("code" in auth) {
    return json(
      { code: auth.code, stage: "heartbeat" },
      auth.code === "device_revoked" ? 403 : 401,
      requestId,
    );
  }
  const now = new Date().toISOString();
  const { data, error } = await workerService.from("worker_devices").update({
    state: "online",
    last_heartbeat_at: now,
  }).eq("id", auth.device.id).in("state", ["paired", "online", "offline"])
    .select("id").maybeSingle();
  if (error || !data) {
    return json(
      { code: "heartbeat_rejected", stage: "heartbeat" },
      422,
      requestId,
    );
  }
  const { error: heartbeatError } = await workerService.from(
    "worker_heartbeats",
  ).insert({
    device_id: auth.device.id,
    worker_version: body.workerVersion ?? null,
    status: body.status ?? {},
  });
  if (heartbeatError) {
    return json(
      { code: "heartbeat_record_failed", stage: "heartbeat" },
      500,
      requestId,
    );
  }
  const { error: queuedError } = await workerService.from("digital_scans")
    .update({
      status: "queued",
    }).eq("device_id", auth.device.id).eq("status", "waiting_for_device");
  return queuedError
    ? json({ code: "scan_queue_failed", stage: "heartbeat" }, 500, requestId)
    : json(
      { ok: true, lastHeartbeatAt: now, stage: "heartbeat" },
      200,
      requestId,
    );
});
