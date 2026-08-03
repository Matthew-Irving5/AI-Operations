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
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const canonical = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
Deno.serve(async (request) => {
  if (
    request.method !== "POST" ||
    request.headers.get("x-worker-secret") !== Deno.env.get("WORKER_SECRET")
  ) return json({ code: "unauthorised" }, 401);
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
      !item.pathToken || !item.filename ||
      !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 0
    )
  ) {
    return json({ code: "invalid_result" }, 400);
  }
  const signaturePayload = {
    deviceId: body.deviceId,
    scanId: body.scanId,
    inventory: body.inventory,
  };
  const device = await service.from("worker_devices").select(
    "id,public_key_b64,state,revoked_at",
  ).eq("id", body.deviceId).maybeSingle();
  if (
    !device.data || device.data.state === "revoked" || device.data.revoked_at
  ) {
    return json({ code: "device_revoked" }, 403);
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytes(device.data.public_key_b64),
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
      return json({ code: "result_signature_invalid" }, 403);
    }
  } catch {
    return json({ code: "result_signature_invalid" }, 403);
  }
  const scan = await service.from("digital_scans").select(
    "id,user_id,device_id,status",
  ).eq("id", body.scanId).eq("device_id", body.deviceId).in("status", [
    "queued",
    "waiting_for_device",
    "running",
  ]).maybeSingle();
  if (!scan.data) {
    return json({ code: "scan_unavailable" }, 404);
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
    const stored = await service.from("digital_inventory_items").upsert(rows, {
      onConflict: "scan_id,path_token",
    });
    if (stored.error) {
      return json({ code: "inventory_store_failed" }, 500);
    }
  }
  await service.from("digital_scans").update({
    status: "complete",
    progress: 100,
    completed_at: new Date().toISOString(),
  }).eq("id", scan.data.id);
  if (scan.data) {
    const run = await service.from("digital_scans").select("run_id").eq(
      "id",
      scan.data.id,
    ).single();
    await service.from("workflow_runs").update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
    }).eq("id", run.data?.run_id).eq("status", "queued");
    await service.from("job_queue").update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
    }).eq("run_id", run.data?.run_id).eq("status", "queued");
  }
  return json({ accepted: rows.length });
});
