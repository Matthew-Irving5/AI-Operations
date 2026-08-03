import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return json({ code: "unauthorised" }, 401);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: token } },
  });
  const [{ data: identity }, { data: assurance }] = await Promise.all([
    caller.auth.getUser(),
    caller.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com" ||
    assurance?.currentLevel !== "aal2"
  ) return json({ code: "fresh_mfa_required" }, 403);
  const body = await request.json().catch(() => null) as {
    label?: string;
    publicKeyB64?: string;
  } | null;
  if (
    !body?.label || body.label.length > 100 ||
    !/^[A-Za-z0-9+/=]{40,200}$/.test(body.publicKeyB64 ?? "")
  ) return json({ code: "invalid_device" }, 400);
  const pairingCode = crypto.randomUUID().replaceAll("-", "");
  const { data, error } = await service.from("worker_devices").insert({
    user_id: identity.user.id,
    label: body.label.trim(),
    public_key_b64: body.publicKeyB64,
    pairing_hash: await digest(pairingCode),
    pairing_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).select("id,pairing_expires_at").single();
  return error
    ? json({ code: "device_registration_failed" }, 422)
    : json({ device: data, pairingCode }, 201);
});
