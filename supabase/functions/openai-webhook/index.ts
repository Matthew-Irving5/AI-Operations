import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const encoder = new TextEncoder();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const toHex = (bytes: ArrayBuffer) =>
  Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};
async function verifySignature(
  payload: string,
  signature: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("OPENAI_WEBHOOK_SECRET");
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = `sha256=${
    toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)))
  }`;
  return timingSafeEqual(expected, signature);
}

Deno.serve(async (request) => {
  const payload = await request.text();
  if (
    !(await verifySignature(payload, request.headers.get("webhook-signature")))
  ) return json({ code: "invalid_signature" }, 401);
  let body: { id?: string; type?: string };
  try {
    body = JSON.parse(payload) as { id?: string; type?: string };
  } catch {
    return json({ code: "invalid_event" }, 400);
  }
  if (!body.id || !body.type) return json({ code: "invalid_event" }, 400);
  const event = await service.from("webhook_events").insert({
    provider: "openai",
    external_id: body.id,
    signature_verified: true,
    status: "received",
  }).select("id").maybeSingle();
  if (event.error?.code === "23505") return json({ duplicate: true });
  if (event.error) return json({ code: "event_store_failed" }, 500);
  return json({ accepted: true });
});
