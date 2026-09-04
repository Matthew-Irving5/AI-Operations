import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  APPROVED_GOOGLE_SCOPES,
  hasExactGoogleScopes,
} from "../_shared/google-sync.ts";
const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const env = (preferred: string, compatibility: string) =>
  Deno.env.get(preferred) ?? Deno.env.get(compatibility);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"],
  );
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
const decrypt = async (value: string) => {
  const raw = Deno.env.get("APP_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("token_encryption_unconfigured");
  const [noncePart, cipherPart] = value.split(".");
  if (!noncePart || !cipherPart) throw new Error("encrypted_value_invalid");
  const keyBytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
  if (keyBytes.byteLength !== 32) {
    throw new Error("token_encryption_key_invalid");
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Uint8Array.from(atob(noncePart), (char) => char.charCodeAt(0)),
    },
    await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
      "decrypt",
    ]),
    Uint8Array.from(atob(cipherPart), (char) => char.charCodeAt(0)),
  );
  return new TextDecoder().decode(plaintext);
};
Deno.serve(async (request) => {
  if (request.method !== "GET") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    state = url.searchParams.get("state");
  if (!code || !state) return json({ code: "invalid_callback" }, 400);
  const result = await service.from("oauth_states").select(
    "id,user_id,pkce_verifier_encrypted,requested_scopes,redirect_uri,expires_at,consumed_at",
  ).eq("state_hash", await sha(state)).maybeSingle();
  if (
    result.error || !result.data || result.data.consumed_at ||
    new Date(result.data.expires_at) <= new Date()
  ) return json({ code: "oauth_state_invalid" }, 403);
  const claim = await service.from("oauth_states").update({
    consumed_at: new Date().toISOString(),
  }).eq("id", result.data.id).is("consumed_at", null).select("id")
    .maybeSingle();
  if (claim.error || !claim.data) {
    return json({ code: "oauth_state_invalid" }, 403);
  }
  const clientId = env("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLOUD_CLIENT_ID"),
    clientSecret = env(
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_CLOUD_CLIENT_SECRET",
    );
  if (!clientId || !clientSecret) {
    return json({ code: "google_oauth_not_configured" }, 503);
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: result.data.redirect_uri,
      grant_type: "authorization_code",
      code_verifier: await decrypt(result.data.pkce_verifier_encrypted),
    }),
  });
  const tokens = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!tokenResponse.ok || !tokens.refresh_token || !tokens.access_token) {
    return json({ code: "token_exchange_failed" }, 422);
  }
  const grantedScopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? [];
  if (!hasExactGoogleScopes(grantedScopes)) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokens.access_token }),
    }).catch(() => undefined);
    return json({ code: "google_scopes_invalid" }, 422);
  }
  const account = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await account.json().catch(() => ({})) as {
    email?: string;
    verified_email?: boolean;
  };
  if (
    !account.ok ||
    profile.email?.toLowerCase() !== "matthewirving99@gmail.com" ||
    profile.verified_email !== true
  ) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokens.access_token }),
    }).catch(() => undefined);
    return json({ code: "google_account_not_allowed" }, 403);
  }
  const connection = await service.from("connections").upsert({
    user_id: result.data.user_id,
    provider: "google",
    account_label: profile.email ?? "Google account",
    status: "connected",
    sync_enabled: true,
    scopes: [...APPROVED_GOOGLE_SCOPES],
    encrypted_credential_reference: "connection_credentials",
  }, { onConflict: "user_id,provider" }).select("id").single();
  if (connection.error || !connection.data) {
    return json({ code: "connection_store_failed" }, 500);
  }
  const credential = await service.from("connection_credentials").upsert({
    connection_id: connection.data.id,
    encrypted_refresh_token: await encrypt(tokens.refresh_token),
    token_expires_at: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null,
  }, { onConflict: "connection_id" }).select("connection_id").single();
  if (credential.error || !credential.data) {
    await service.from("connections").update({
      status: "disconnected",
      sync_enabled: false,
    })
      .eq("id", connection.data.id);
    return json({ code: "credential_store_failed" }, 500);
  }
  await service.from("audit_events").insert({
    user_id: result.data.user_id,
    actor_type: "user",
    action_type: "google_oauth_connected",
    target_type: "connection",
    target_id: connection.data.id,
    aal: "aal2",
    result: "success",
  });
  const appOrigin = Deno.env.get("PUBLIC_APP_ORIGIN") ??
    Deno.env.get("APP_PUBLIC_ORIGIN");
  if (!appOrigin) return json({ code: "app_origin_unconfigured" }, 503);
  let redirectOrigin: URL;
  try {
    redirectOrigin = new URL(appOrigin);
  } catch {
    return json({ code: "app_origin_invalid" }, 503);
  }
  if (
    redirectOrigin.protocol !== "https:" ||
    !new Set([
      "ai-operations-production.ai-operations.workers.dev",
      "ai-operations-staging.ai-operations.workers.dev",
    ]).has(redirectOrigin.hostname)
  ) return json({ code: "app_origin_invalid" }, 503);
  return Response.redirect(
    new URL("/data-sources?google=connected", redirectOrigin).toString(),
    302,
  );
});
