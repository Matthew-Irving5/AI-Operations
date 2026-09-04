import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const allowedEmail = "matthewirving99@gmail.com";
const allowedLists = new Set([
  "Fitness Plan",
  "Household & Personal",
  "AI Actions",
]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const token = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

async function callerFor(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const caller = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: identity } = await caller.auth.getUser();
  if (!identity.user || identity.user.email?.toLowerCase() !== allowedEmail) {
    return null;
  }
  return {
    user: identity.user,
    database: caller,
  };
}

Deno.serve(async (request) => {
  const caller = await callerFor(request);
  if (!caller) return json({ code: "forbidden" }, 403);
  const user = caller.user;
  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      label?: string;
      enabledLists?: string[];
      mfaGateId?: string;
    } | null;
    if (
      !body?.label ||
      body.label.length > 80 ||
      !Array.isArray(body.enabledLists) ||
      !body.enabledLists.length ||
      body.enabledLists.some((list) =>
        typeof list !== "string" || !allowedLists.has(list)
      )
    ) {
      return json({ code: "invalid_device" }, 400);
    }
    const rawToken = token();
    const inserted = await caller.database.rpc(
      "create_apple_bridge_device_from_mfa_gate",
      {
        p_gate_id: body.mfaGateId,
        p_label: body.label,
        p_enabled_lists: [...new Set(body.enabledLists)],
        p_token_hash: await digest(rawToken),
        p_token_prefix: rawToken.slice(0, 8),
      },
    );
    if (inserted.error) {
      return json({ code: "device_create_failed" }, 500);
    }
    const device = Array.isArray(inserted.data)
      ? inserted.data[0]
      : inserted.data;
    if (!device) return json({ code: "fresh_mfa_required" }, 403);
    await service.from("audit_events").insert({
      user_id: user.id,
      actor_type: "user",
      action_type: "apple_bridge_device_created",
      target_type: "apple_bridge_device",
      target_id: device.id,
      aal: "mfa_gate",
      result: "success",
    });
    return json({ device, token: rawToken }, 201);
  }
  if (request.method === "DELETE") {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const gateId = params.get("mfaGateId");
    if (!id) return json({ code: "device_id_required" }, 400);
    if (!gateId) return json({ code: "fresh_mfa_required" }, 403);
    const revoked = await caller.database.rpc("revoke_apple_bridge_device", {
      p_device_id: id,
      p_gate_id: gateId,
    });
    if (revoked.error) {
      return json({ code: "apple_revoke_transaction_failed" }, 500);
    }
    const outcome = Array.isArray(revoked.data)
      ? revoked.data[0]
      : revoked.data;
    const gateCode = outcome?.code as string | undefined;
    if (gateCode === "fresh_mfa_required") return json({ code: gateCode }, 403);
    if (gateCode === "invalid_mfa_gate") return json({ code: gateCode }, 400);
    if (
      gateCode === "mfa_gate_wrong_user" ||
      gateCode === "mfa_gate_invalid_action" ||
      gateCode === "mfa_gate_expired" ||
      gateCode === "mfa_gate_replayed"
    ) return json({ code: gateCode }, 403);
    if (outcome?.code === "device_not_found") {
      return json({ code: "device_not_found" }, 404);
    }
    if (outcome?.status !== "revoked") {
      return json({ code: "apple_revoke_transaction_failed" }, 500);
    }
    return new Response(null, { status: 204 });
  }
  return json({ code: "method_not_allowed" }, 405);
});
