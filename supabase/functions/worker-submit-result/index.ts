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
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const canonical = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return json(
      { code: "method_not_allowed", stage: "result" },
      405,
      requestId,
    );
  }
  const body = await request.json().catch(() => null) as {
    deviceId?: string;
    scanId?: string;
    signatureB64?: string;
    inventory?: Array<
      {
        pathToken: string;
        filename: string;
        sizeBytes: number;
        sha256?: string;
      }
    >;
  } | null;
  if (
    !body?.deviceId || !body.scanId || !Array.isArray(body.inventory) ||
    !body.signatureB64 ||
    body.inventory.length > 10_000 || body.inventory.some((item) =>
      !/^[a-f0-9]{64}$/.test(item.pathToken) || !item.filename ||
      item.filename.includes("/") || item.filename.includes("\\") ||
      !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 0 ||
      (item.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(item.sha256))
    )
  ) {
    return json({ code: "invalid_result", stage: "result" }, 400, requestId);
  }
  const auth = await authenticateWorker(request, body.deviceId);
  if ("code" in auth) {
    return json(
      { code: auth.code, stage: "result" },
      auth.code === "device_revoked" ? 403 : 401,
      requestId,
    );
  }
  const signaturePayload = {
    deviceId: body.deviceId,
    scanId: body.scanId,
    inventory: body.inventory,
  };
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytes(auth.device.public_key_b64),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    if (
      !await crypto.subtle.verify(
        "Ed25519",
        key,
        bytes(body.signatureB64),
        canonical(signaturePayload),
      )
    ) {
      return json(
        { code: "result_signature_invalid", stage: "result" },
        403,
        requestId,
      );
    }
  } catch {
    return json(
      { code: "result_signature_invalid", stage: "result" },
      403,
      requestId,
    );
  }
  const scan = await workerService.from("digital_scans").select(
    "id,user_id,device_id,run_id,status",
  ).eq("id", body.scanId).eq("device_id", auth.device.id).in("status", [
    "queued",
    "waiting_for_device",
    "running",
    "complete",
  ]).maybeSingle();
  if (!scan.data) {
    return json(
      { code: "scan_unavailable", stage: "result" },
      404,
      requestId,
    );
  }
  const rows = body.inventory.map((item) => ({
    scan_id: scan.data!.id,
    user_id: scan.data!.user_id,
    path_token: item.pathToken,
    filename: item.filename,
    size_bytes: item.sizeBytes,
    sha256: item.sha256 ?? null,
  }));
  if (rows.length) {
    const stored = await workerService.from("digital_inventory_items").upsert(
      rows,
      {
        onConflict: "scan_id,path_token",
      },
    );
    if (stored.error) {
      return json(
        { code: "inventory_store_failed", stage: "result" },
        500,
        requestId,
      );
    }
  }
  const completedAt = new Date().toISOString();
  const updated = await workerService.from("digital_scans").update({
    status: "complete",
    progress: 100,
    completed_at: completedAt,
    result_verified_at: completedAt,
  }).eq("id", scan.data.id).in("status", [
    "queued",
    "waiting_for_device",
    "running",
    "complete",
  ])
    .select("id").maybeSingle();
  if (updated.error || !updated.data) {
    return json(
      { code: "scan_completion_failed", stage: "result" },
      500,
      requestId,
    );
  }
  await workerService.from("audit_events").insert({
    user_id: scan.data.user_id,
    actor_type: "worker",
    action_type: "worker_scan_result_verified",
    target_type: "digital_scan",
    target_id: scan.data.id,
    aal: "worker_key",
    result: "success",
    redacted_after: { inventoryCount: rows.length, requestId },
  });
  if (scan.data.run_id) {
    const completed = await workerService.rpc(
      "complete_deterministic_workflow_run",
      {
        p_run_id: scan.data.run_id,
      },
    );
    if (completed.error) {
      return json(
        { code: "scan_completion_failed", stage: "workflow" },
        500,
        requestId,
      );
    }
  }
  return json(
    { accepted: rows.length, verifiedAt: completedAt, stage: "result" },
    200,
    requestId,
  );
});
