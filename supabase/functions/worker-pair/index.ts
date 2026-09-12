import { createWorkerSecret, workerService } from "../_shared/worker-auth.ts";

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
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return json(
      { code: "method_not_allowed", stage: "pairing" },
      405,
      requestId,
    );
  }
  const body = await request.json().catch(() => null) as {
    deviceId?: string;
    pairingCode?: string;
  } | null;
  if (
    !body?.deviceId || !body.pairingCode ||
    !/^[a-f0-9]{32}$/i.test(body.pairingCode)
  ) {
    return json({ code: "invalid_pairing", stage: "pairing" }, 400, requestId);
  }
  const secret = await createWorkerSecret();
  const { data, error } = await workerService.from("worker_devices").update({
    state: "paired",
    paired_at: new Date().toISOString(),
    pairing_hash: null,
    pairing_expires_at: null,
    worker_secret_hash: secret.hash,
  }).eq("id", body.deviceId).eq("state", "pending").is(
    "worker_secret_hash",
    null,
  ).eq(
    "pairing_hash",
    await digest(body.pairingCode),
  ).gt("pairing_expires_at", new Date().toISOString()).select("id")
    .maybeSingle();
  if (error || !data) {
    return json({ code: "pairing_rejected", stage: "pairing" }, 422, requestId);
  }
  return json(
    {
      paired: true,
      deviceId: data.id,
      workerSecret: secret.raw,
      stage: "paired",
    },
    200,
    requestId,
  );
});
