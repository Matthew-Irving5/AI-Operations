import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const allowedEmail = "matthewirving99@gmail.com";
const env = (preferred: string, compatibility: string) =>
  Deno.env.get(preferred) ?? Deno.env.get(compatibility);
const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];
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

  // The dashboard route is already protected by the authenticated AAL2 app
  // layout. This function only needs to verify that the relayed Supabase
  // session is still valid and belongs to the sole production identity. A
  // five-minute reauthentication lookup here is incorrect: the session can
  // remain valid while the short-lived MFA event expires, and OAuth start is
  // then rejected even though the user is actively signed in.
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
  await service.from("oauth_states").insert({
    user_id: identity.user.id,
    provider: "google",
    state_hash: await sha(state),
    pkce_verifier_encrypted: await encrypt(verifier),
    requested_scopes: scopes,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
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
