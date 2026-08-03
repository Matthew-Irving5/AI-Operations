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
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
Deno.serve(async (request) => {
  if (
    request.method !== "POST" ||
    request.headers.get("x-worker-secret") !== Deno.env.get("WORKER_SECRET")
  ) return json({ code: "unauthorised" }, 401);
  const body = await request.json().catch(() => null) as {
    deviceId?: string;
    pairingCode?: string;
  } | null;
  const pairingCode = body?.pairingCode;
  if (!body?.deviceId || !pairingCode || !/^[a-f0-9]{32}$/i.test(pairingCode)) {
    return json({ code: "invalid_pairing" }, 400);
  }
  const { data, error } = await service.from("worker_devices").update({
    state: "paired",
    paired_at: new Date().toISOString(),
    pairing_hash: null,
    pairing_expires_at: null,
  }).eq("id", body.deviceId).eq("state", "pending").eq(
    "pairing_hash",
    await hash(pairingCode),
  ).gt("pairing_expires_at", new Date().toISOString()).select("id")
    .maybeSingle();
  return error || !data
    ? json({ code: "pairing_rejected" }, 422)
    : json({ paired: true });
});
