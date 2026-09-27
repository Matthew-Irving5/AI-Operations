import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { z } from "https://esm.sh/zod@4.1.5";
import {
  GOOGLE_ACCOUNT_ROLES,
  googleAccountConfig,
  isGoogleRoleAvailableInEnvironment,
  scopesForGoogleRole,
} from "../_shared/google-account-config.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const allowedEmail = "matthewirving99@gmail.com";
const env = (preferred: string, compatibility: string) =>
  Deno.env.get(preferred) ?? Deno.env.get(compatibility);
const requestSchema = z.object({
  account_role: z.enum(GOOGLE_ACCOUNT_ROLES),
}).strict();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const sha = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const encrypt = async (value: string) => {
  const raw = Deno.env.get("APP_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("token_encryption_unconfigured");
  const keyBytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
  if (keyBytes.byteLength !== 32) {
    throw new Error("token_encryption_key_invalid");
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
  ]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(value),
    ),
  );
  return `${btoa(String.fromCharCode(...nonce))}.${
    btoa(String.fromCharCode(...ciphertext))
  }`;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return json({ code: "invalid_request" }, 400);
  const role = parsed.data.account_role;
  const config = googleAccountConfig(
    Deno.env.get("AI_OPERATIONS_ENVIRONMENT"),
    env("PUBLIC_APP_ORIGIN", "APP_PUBLIC_ORIGIN"),
  );
  if (!config) {
    return json({ code: "google_environment_configuration_invalid" }, 503);
  }
  if (!isGoogleRoleAvailableInEnvironment(role, config.environment)) {
    return json({ code: "google_account_role_unavailable" }, 403);
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return json({ code: "unauthorised" }, 401);
  const caller = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: token } } },
  );
  const { data: identity } = await caller.auth.getUser();
  if (!identity.user || identity.user.email?.toLowerCase() !== allowedEmail) {
    return json({ code: "forbidden" }, 403);
  }
  const { data: aal2 } = await caller.rpc("is_allowed_aal2");
  if (aal2 !== true) {
    return json({ code: "aal2_required" }, 403);
  }
  const scopes = scopesForGoogleRole(role);

  const clientId = env("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLOUD_CLIENT_ID"),
    redirectUri = env("GOOGLE_OAUTH_REDIRECT_URI", "GOOGLE_CLOUD_REDIRECT_URI");
  if (!clientId || !redirectUri) {
    return json({ code: "google_oauth_not_configured" }, 503);
  }
  if (!Deno.env.get("APP_TOKEN_ENCRYPTION_KEY")) {
    return json({ code: "token_encryption_unconfigured" }, 503);
  }
  const state = b64(crypto.getRandomValues(new Uint8Array(32))),
    verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
  const stateInsert = await service.from("oauth_states").insert({
    user_id: identity.user.id,
    provider: "google",
    state_hash: await sha(state),
    pkce_verifier_encrypted: await encrypt(verifier),
    requested_scopes: scopes,
    account_role: role,
    environment: config.environment,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  });
  if (stateInsert.error) {
    return json({
      code: "oauth_state_persist_failed",
      reason: stateInsert.error.code ?? "database_error",
    }, 500);
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    scope: scopes.join(" "),
    state,
    code_challenge: b64(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    ),
    code_challenge_method: "S256",
  }).toString();
  return json({ authorizationUrl: url.toString() }, 201);
});
