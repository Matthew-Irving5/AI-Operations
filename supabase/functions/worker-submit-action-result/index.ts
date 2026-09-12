import { authenticateWorker, workerService } from "../_shared/worker-auth.ts";

const service = workerService;
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

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return json(
      { code: "method_not_allowed", stage: "action_result" },
      405,
      requestId,
    );
  }
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
  ) {
    return json(
      { code: "invalid_action_result", stage: "action_result" },
      400,
      requestId,
    );
  }
  const auth = await authenticateWorker(request, body.deviceId);
  if ("code" in auth) {
    return json(
      { code: auth.code, stage: "action_result" },
      auth.code === "device_revoked" ? 403 : 401,
      requestId,
    );
  }
  const result = await service.from("worker_action_manifests").update({
    consumed_at: new Date().toISOString(),
    execution_result: { success: body.success, detail: body.detail ?? null },
  }).eq("id", body.manifestId).eq("device_id", body.deviceId).is(
    "consumed_at",
    null,
  ).gt("expires_at", new Date().toISOString()).select("plan_id").maybeSingle();
  if (result.error || !result.data) {
    return json(
      { code: "manifest_unavailable", stage: "action_result" },
      409,
      requestId,
    );
  }
  if (!body.success) {
    await service.from("digital_plans").update({ status: "expired" }).eq(
      "id",
      result.data.plan_id,
    ).eq("status", "approved");
  }
  return json({ accepted: true, stage: "action_result" }, 200, requestId);
});
