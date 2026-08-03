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
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const canonicalise = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b)
      ).map(([key, child]) => [key, canonicalise(child)]),
    );
  }
  return value;
};
const canonical = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(canonicalise(value)));
const sha256 = async (value: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
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
  const body = await request.json().catch(() => null) as {
    planId?: string;
    expectedPayloadSha256?: string;
  } | null;
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com" ||
    assurance?.currentLevel !== "aal2"
  ) return json({ code: "fresh_mfa_required" }, 403);
  if (
    !body?.planId || !/^[a-f0-9]{64}$/.test(body.expectedPayloadSha256 ?? "")
  ) return json({ code: "invalid_plan" }, 400);
  const plan = await service.from("digital_plans").select(
    "id,user_id,device_id,payload,payload_sha256,status",
  ).eq("id", body.planId).eq("user_id", identity.user.id).eq(
    "status",
    "proposed",
  ).maybeSingle();
  if (!plan.data || plan.data.payload_sha256 !== body.expectedPayloadSha256) {
    return json({ code: "immutable_plan_mismatch" }, 422);
  }
  if (
    !Array.isArray(plan.data.payload) || !plan.data.payload.length ||
    !plan.data.payload.every((action) => {
      const item = action as Record<string, unknown>;
      return ["move", "rename", "archive", "quarantine", "purge_quarantine"]
        .includes(String(item.action)) &&
        typeof item.source === "string" &&
        (String(item.action) === "purge_quarantine" ||
          typeof item.destination === "string") &&
        !!item.precondition && typeof item.precondition === "object";
    })
  ) return json({ code: "plan_actions_invalid" }, 422);
  const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();
  const privateKey = Deno.env.get("WORKER_MANIFEST_PRIVATE_KEY_B64");
  if (!privateKey) return json({ code: "manifest_signing_unavailable" }, 503);
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    bytes(privateKey),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const manifests = [];
  for (const action of plan.data.payload as Record<string, unknown>[]) {
    const payload = {
      manifest_id: crypto.randomUUID(),
      device_id: plan.data.device_id,
      expires_at,
      ...action,
    };
    const encoded = canonical(payload);
    const signature_b64 = btoa(String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign("Ed25519", signingKey, encoded),
      ),
    ));
    manifests.push({
      plan_id: plan.data.id,
      device_id: plan.data.device_id,
      payload,
      payload_sha256: await sha256(encoded),
      signature_b64,
      expires_at,
    });
  }
  const manifest = await service.from("worker_action_manifests").insert(
    manifests,
  )
    .select("id,expires_at");
  if (manifest.error || !manifest.data?.length) {
    return json({ code: "manifest_create_failed" }, 500);
  }
  await service.from("digital_plans").update({
    status: "approved",
    approved_at: new Date().toISOString(),
  }).eq("id", plan.data.id).eq("status", "proposed");
  await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "approve_digital_plan",
    target_type: "digital_plan",
    target_id: plan.data.id,
    aal: "aal2_fresh",
    result: "success",
    redacted_after: {
      payload_sha256: plan.data.payload_sha256,
      manifest_count: manifest.data.length,
    },
  });
  return json({ manifests: manifest.data });
});
