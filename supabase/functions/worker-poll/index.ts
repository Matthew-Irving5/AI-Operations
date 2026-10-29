import { authenticateWorker, workerService } from "../_shared/worker-auth.ts";
import {
  assessWorkerCompatibility,
  MINIMUM_WORKER_VERSION,
  WORKER_CAPABILITIES,
  workerPollSchema,
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
    return json({ code: "method_not_allowed", stage: "poll" }, 405, requestId);
  }
  const parsed = workerPollSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return json(
      {
        code: "worker_protocol_invalid",
        stage: "worker_compatibility",
        expectedVersion: MINIMUM_WORKER_VERSION,
        expectedCapabilities: [WORKER_CAPABILITIES.inventory],
      },
      400,
      requestId,
    );
  }
  const report = parsed.data;
  const auth = await authenticateWorker(request, report.deviceId);
  if ("code" in auth) {
    return json(
      { code: auth.code, stage: "poll" },
      auth.code === "device_revoked" ? 403 : 401,
      requestId,
    );
  }
  if (auth.device.state !== "active" || auth.device.desired_state !== "active") {
    return json(
      { code: "worker_not_active", stage: "poll", state: auth.device.state },
      409,
      requestId,
    );
  }
  const compatibility = assessWorkerCompatibility(
    report.workerVersion,
    report.capabilities,
  );
  if (!compatibility.compatible) {
    return json(
      {
        code: compatibility.code,
        stage: "worker_compatibility",
        expectedVersion: compatibility.minimumVersion,
        actualVersion: compatibility.actualVersion,
        expectedCapabilities: compatibility.requiredCapabilities,
        actualCapabilities: compatibility.actualCapabilities,
      },
      426,
      requestId,
    );
  }
  const { error: pollStampError } = await workerService.from("worker_devices")
    .update({ last_poll_at: new Date().toISOString(), observed_mode: "active" })
    .eq("id", auth.device.id)
    .eq("state", "active")
    .eq("desired_state", "active");
  if (pollStampError) {
    return json({ code: "poll_state_update_failed", stage: "poll" }, 500, requestId);
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
  const manifest = report.capabilities.includes(
      WORKER_CAPABILITIES.signedFileActions,
    )
    ? await workerService.from("worker_action_manifests").select(
      "id,payload,signature_b64,expires_at",
    ).eq("device_id", auth.device.id).is("consumed_at", null).gt(
      "expires_at",
      new Date().toISOString(),
    ).order("created_at").limit(1).maybeSingle()
    : { data: null, error: null };
  return manifest.error
    ? json({ code: "poll_failed", stage: "poll" }, 500, requestId)
    : json(
      { scan: null, manifest: manifest.data, stage: "poll" },
      200,
      requestId,
    );
});
