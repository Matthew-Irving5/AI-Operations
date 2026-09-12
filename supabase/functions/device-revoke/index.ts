import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL") ?? "";
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
      { code: "method_not_allowed", stage: "revocation" },
      405,
      requestId,
    );
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) {
    return json({ code: "unauthorised", stage: "revocation" }, 401, requestId);
  }
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
  ) {
    return json(
      { code: "fresh_mfa_required", stage: "revocation" },
      403,
      requestId,
    );
  }
  const body = await request.json().catch(() => null) as {
    deviceId?: string;
    mfaGateId?: string;
  } | null;
  if (!body?.deviceId || !body.mfaGateId) {
    return json(
      { code: "invalid_request", stage: "revocation" },
      400,
      requestId,
    );
  }
  const { data, error } = await caller.rpc(
    "revoke_worker_device_from_mfa_gate",
    {
      p_device_id: body.deviceId,
      p_gate_id: body.mfaGateId,
    },
  );
  if (error) {
    return json(
      { code: "worker_device_revoke_failed", stage: "revocation" },
      500,
      requestId,
    );
  }
  const outcome = Array.isArray(data) ? data[0] : data;
  const code = outcome?.code as string | undefined;
  if (code) {
    return json(
      { code, stage: "revocation" },
      code === "device_not_found" ? 404 : 422,
      requestId,
    );
  }
  return json(
    { status: "revoked", deviceId: body.deviceId, stage: "revocation" },
    200,
    requestId,
  );
});
