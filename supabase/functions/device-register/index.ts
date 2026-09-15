import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const route = "/functions/v1/device-register";
const remediationByCode: Record<string, string> = {
  method_not_allowed: "Call the device-register function with POST.",
  unauthorised:
    "Provide the authenticated AAL2 bearer session from the web registration flow.",
  fresh_mfa_required:
    "Complete fresh MFA immediately before registering the worker.",
  invalid_device:
    "Provide a non-empty label, a base64 Ed25519 public key, and a valid MFA gate.",
  invalid_mfa_gate:
    "Start a new worker registration; the previous one-time gate is not usable.",
  mfa_gate_wrong_user:
    "Start registration while signed in as the allowlisted production user.",
  mfa_gate_invalid_action:
    "Start a new Windows worker registration from Devices.",
  mfa_gate_expired:
    "Start a new worker registration and submit it before the gate expires.",
  mfa_gate_replayed:
    "Start a new worker registration; one-time gates cannot be reused.",
  device_registration_conflict:
    "A worker with this identity already exists; use Devices to inspect or revoke it.",
};
const json = (
  body: unknown,
  status = 200,
  requestId: string = crypto.randomUUID(),
) => {
  const payload = body as Record<string, unknown>;
  const code = typeof payload.code === "string" ? payload.code : undefined;
  const stage = typeof payload.stage === "string"
    ? payload.stage
    : "device_registration";
  const diagnostic = payload.diagnostic ??
    (code
      ? {
        code,
        stage,
        httpStatus: status,
        requestId,
        route,
        method: "POST",
        detail:
          "The device-register control-plane boundary rejected the request.",
        remediation: remediationByCode[code] ??
          "Use the request ID to inspect the device-register control-plane logs before retrying.",
      }
      : undefined);
  return new Response(
    JSON.stringify({
      ...payload,
      requestId,
      ...(diagnostic ? { diagnostic } : {}),
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
      },
    },
  );
};
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405, requestId);
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) {
    return json(
      {
        code: "unauthorised",
        stage: "authorization",
        detail: "The device-register function did not receive a bearer token.",
      },
      401,
      requestId,
    );
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
      {
        code: "fresh_mfa_required",
        stage: "aal2_authorization",
        detail:
          "The bearer token was absent, not allowlisted, or did not contain AAL2 assurance.",
      },
      403,
      requestId,
    );
  }
  const body = await request.json().catch(() => null) as {
    label?: string;
    publicKeyB64?: string;
    mfaGateId?: string;
  } | null;
  if (
    !body?.label || body.label.trim().length > 100 || !body.mfaGateId ||
    !/^[A-Za-z0-9+/=]{40,100}$/.test(body.publicKeyB64 ?? "")
  ) {
    return json(
      {
        code: "invalid_device",
        stage: "request_validation",
        detail:
          "The label, public key, or MFA gate did not match the device registration contract.",
      },
      400,
      requestId,
    );
  }
  const pairingCode = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { data, error } = await caller.rpc(
    "create_worker_device_from_mfa_gate",
    {
      p_gate_id: body.mfaGateId,
      p_label: body.label.trim(),
      p_public_key_b64: body.publicKeyB64,
      p_pairing_hash: await digest(pairingCode),
      p_pairing_expires_at: expiresAt,
    },
  );
  const device = Array.isArray(data) ? data[0] : data;
  if (error || !device?.device_id) {
    const message = error?.message ?? "device_registration_failed";
    const code = [
      "fresh_mfa_required",
      "invalid_mfa_gate",
      "mfa_gate_wrong_user",
      "mfa_gate_invalid_action",
      "mfa_gate_expired",
      "mfa_gate_replayed",
      "device_registration_conflict",
      "invalid_device",
    ].find((candidate) => message.includes(candidate)) ??
      "device_registration_failed";
    return json(
      {
        code,
        stage: "database_gate_consume",
        detail:
          "The create_worker_device_from_mfa_gate database boundary rejected the one-time registration gate.",
      },
      code === "fresh_mfa_required" ? 403 : 422,
      requestId,
    );
  }
  return json(
    {
      device: {
        id: device.device_id,
        pairingExpiresAt: device.pairing_expires_at,
      },
      pairingCode,
      stage: "pairing",
    },
    201,
    requestId,
  );
});
