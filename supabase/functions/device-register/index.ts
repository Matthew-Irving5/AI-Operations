import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const route = "/functions/v1/device-register";
const remediationByCode: Record<string, string> = {
  method_not_allowed: "Call the device-register function with POST.",
  unauthorised:
    "Provide the authenticated AAL2 bearer session from the web registration flow.",
  auth_user_lookup_failed:
    "Sign in again so the registration request carries a valid Supabase access token.",
  authenticated_identity_missing:
    "Sign in again and complete fresh MFA before returning to Devices.",
  account_not_allowed:
    "Sign in as the allowlisted production account before registering a worker.",
  assurance_lookup_failed:
    "Refresh the session and complete fresh MFA again; the server could not inspect assurance.",
  assurance_not_aal2:
    "Complete fresh MFA in this same browser session, then return to Devices immediately.",
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
const authErrorMetadata = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return { providerStatus: "unknown", providerCode: "unknown" };
  }
  const record = error as Record<string, unknown>;
  const providerStatus = typeof record.status === "number"
    ? String(record.status)
    : "unknown";
  const rawCode = typeof record.code === "string" ? record.code : "unknown";
  const providerCode = /^[A-Za-z0-9_-]{1,80}$/.test(rawCode)
    ? rawCode
    : "unknown";
  return { providerStatus, providerCode };
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
  const { data: identity, error: identityError } = await caller.auth.getUser();
  if (identityError) {
    const { providerStatus, providerCode } = authErrorMetadata(identityError);
    return json(
      {
        code: "auth_user_lookup_failed",
        stage: "auth_user_lookup",
        detail:
          `Supabase Auth rejected the worker registration bearer (provider_status=${providerStatus}, provider_code=${providerCode}).`,
      },
      401,
      requestId,
    );
  }
  if (!identity.user) {
    return json(
      {
        code: "authenticated_identity_missing",
        stage: "auth_user_lookup",
        detail:
          "Supabase Auth accepted the request shape but returned no authenticated user.",
      },
      401,
      requestId,
    );
  }
  if (identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com") {
    return json(
      {
        code: "account_not_allowed",
        stage: "allowlist_authorization",
        detail:
          "The authenticated identity is not the allowlisted production application account.",
      },
      403,
      requestId,
    );
  }
  const { data: assurance, error: assuranceError } = await caller.auth.mfa
    .getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    const { providerStatus, providerCode } = authErrorMetadata(assuranceError);
    return json(
      {
        code: "assurance_lookup_failed",
        stage: "aal2_lookup",
        detail:
          `Supabase Auth could not inspect MFA assurance (provider_status=${providerStatus}, provider_code=${providerCode}).`,
      },
      502,
      requestId,
    );
  }
  if (assurance?.currentLevel !== "aal2") {
    const currentLevel = assurance?.currentLevel === "aal1"
      ? "aal1"
      : "unknown";
    return json(
      {
        code: "assurance_not_aal2",
        stage: "aal2_authorization",
        detail:
          `The authenticated token has current assurance ${currentLevel}; aal2 is required for worker registration.`,
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
