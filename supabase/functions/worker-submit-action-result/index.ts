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

Deno.serve(async (request) => {
  if (
    request.method !== "POST" ||
    request.headers.get("x-worker-secret") !== Deno.env.get("WORKER_SECRET")
  ) return json({ code: "unauthorised" }, 401);
  const body = await request.json().catch(() => null) as
    | {
      deviceId?: string;
      manifestId?: string;
      success?: boolean;
      detail?: string;
    }
    | null;
  if (
    !body?.deviceId || !body.manifestId || typeof body.success !== "boolean" ||
    (body.detail !== undefined && typeof body.detail !== "string")
  ) return json({ code: "invalid_action_result" }, 400);
  const result = await service.from("worker_action_manifests").update({
    consumed_at: new Date().toISOString(),
    execution_result: { success: body.success, detail: body.detail ?? null },
  }).eq("id", body.manifestId).eq("device_id", body.deviceId).is(
    "consumed_at",
    null,
  ).gt("expires_at", new Date().toISOString()).select("plan_id").maybeSingle();
  if (result.error || !result.data) {
    return json({ code: "manifest_unavailable" }, 409);
  }
  if (!body.success) {
    await service.from("digital_plans").update({ status: "expired" }).eq(
      "id",
      result.data.plan_id,
    ).eq("status", "approved");
  }
  return json({ accepted: true });
});
