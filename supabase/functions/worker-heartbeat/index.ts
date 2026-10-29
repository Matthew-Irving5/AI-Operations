import { authenticateWorker, workerService } from "../_shared/worker-auth.ts";
import {
  assessWorkerCompatibility,
  MINIMUM_WORKER_VERSION,
  WORKER_CAPABILITIES,
  workerHeartbeatSchema,
} from "../_shared/worker-protocol.ts";

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
  const parsed = workerHeartbeatSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return json(
      {
        code: "worker_protocol_invalid",
        stage: "heartbeat",
        expectedVersion: MINIMUM_WORKER_VERSION,
        expectedCapabilities: [WORKER_CAPABILITIES.inventory],
      },
      400,
      requestId,
    );
  }
  const report = parsed.data;
  const compatibility = assessWorkerCompatibility(
    report.workerVersion,
    report.capabilities,
  );
  const auth = await authenticateWorker(request, report.deviceId);
  if ("code" in auth) {
    return json(
      { code: auth.code, stage: "heartbeat" },
      auth.code === "device_revoked" ? 403 : 401,
      requestId,
    );
  }
  const now = new Date().toISOString();
  const effectiveMode = auth.device.desired_state;
  const { data, error } = await workerService.from("worker_devices").update({
    state: effectiveMode,
    last_heartbeat_at: now,
    observed_mode: effectiveMode,
    acknowledged_generation: auth.device.control_generation,
  }).eq("id", auth.device.id).in("state", ["paired", "active", "online", "offline"])
    .select("id,desired_state,control_generation,acknowledged_generation,state")
    .maybeSingle();
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
    worker_version: report.workerVersion ?? null,
    status: {
      ...report.status,
      capabilities: report.capabilities,
      compatibility,
      desiredState: effectiveMode,
      controlGeneration: auth.device.control_generation,
    },
  });
  if (heartbeatError) {
    return json(
      { code: "heartbeat_record_failed", stage: "heartbeat" },
      500,
      requestId,
    );
  }
  const { error: queuedError } = effectiveMode === "active"
    ? await workerService.from("digital_scans")
      .update({ status: "queued" })
      .eq("device_id", auth.device.id)
      .eq("status", "waiting_for_device")
    : null;
  return queuedError
    ? json({ code: "scan_queue_failed", stage: "heartbeat" }, 500, requestId)
    : json(
      {
        ok: true,
        lastHeartbeatAt: now,
        compatibility,
        control: {
          desiredState: effectiveMode,
          generation: auth.device.control_generation,
          acknowledgedGeneration: auth.device.control_generation,
          mode: effectiveMode,
          stop: effectiveMode === "offline",
        },
        stage: "heartbeat",
      },
      200,
      requestId,
    );
});
