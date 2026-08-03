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
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

Deno.serve(async (request) => {
  if (request.method !== "GET") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const token = request.headers.get("authorization")?.replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return json({ code: "unauthorised" }, 401);
  const device = await service.from("apple_bridge_devices").select(
    "user_id,enabled_lists,revoked_at",
  ).eq("token_hash", await digest(token)).maybeSingle();
  if (
    device.error || !device.data || device.data.revoked_at ||
    !device.data.enabled_lists.includes("AI Actions")
  ) return json({ code: "unauthorised" }, 401);
  const { data, error } = await service.from("actions").select(
    "id,title,description,created_at",
  ).eq("user_id", device.data.user_id).eq("status", "approved").order(
    "created_at",
    { ascending: false },
  ).limit(100);
  return error
    ? json({ code: "action_lookup_failed" }, 500)
    : json({ actions: data ?? [] });
});
