import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeMfaActionGate } from "../_shared/mfa-action-gate.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const allowedEmail = "matthewirving99@gmail.com";
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
    accessToken: authorization.slice("Bearer ".length),
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
      body.enabledLists.some((list) => !/^[\w &-]{1,80}$/.test(list))
    ) {
      return json({ code: "invalid_device" }, 400);
    }
    if (
      !(await consumeMfaActionGate(
        body.mfaGateId,
        caller.accessToken,
        "apple_bridge_create",
      ))
    ) {
      return json({ code: "fresh_mfa_required" }, 403);
    }
    const rawToken = token();
    const inserted = await service
      .from("apple_bridge_devices")
      .insert({
        user_id: user.id,
        label: body.label,
        enabled_lists: [...new Set(body.enabledLists)],
        token_hash: await digest(rawToken),
        token_prefix: rawToken.slice(0, 8),
      })
      .select("id,label,enabled_lists,created_at")
      .single();
    if (inserted.error || !inserted.data) {
      return json({ code: "device_create_failed" }, 500);
    }
    await service.from("audit_events").insert({
      user_id: user.id,
      actor_type: "user",
      action_type: "apple_bridge_device_created",
      target_type: "apple_bridge_device",
      target_id: inserted.data.id,
      aal: "mfa_gate",
      result: "success",
    });
    return json({ device: inserted.data, token: rawToken }, 201);
  }
  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return json({ code: "device_id_required" }, 400);
    const revoked = await service
      .from("apple_bridge_devices")
      .update({
        revoked_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (revoked.error || !revoked.data) {
      return json({ code: "device_not_found" }, 404);
    }
    return new Response(null, { status: 204 });
  }
  return json({ code: "method_not_allowed" }, 405);
});
