import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  APPROVED_GOOGLE_SCOPES,
  hasExactGoogleScopes,
} from "../_shared/google-sync.ts";
import {
  type GoogleOAuthFailure,
  makeGoogleOAuthFailure,
  safeGoogleProviderCode,
} from "../_shared/google-oauth-diagnostics.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const allowedEmail = "matthewirving99@gmail.com";
const allowedOrigins = new Set([
  "ai-operations-production.ai-operations.workers.dev",
  "ai-operations-staging.ai-operations.workers.dev",
]);
const env = (preferred: string, compatibility: string) =>
  Deno.env.get(preferred) ?? Deno.env.get(compatibility);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
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

type FailureContext = Readonly<{
  userId?: string;
  stateId?: string;
}>;

function redirectOrigin(): URL | null {
  const raw = env("PUBLIC_APP_ORIGIN", "APP_PUBLIC_ORIGIN");
  if (!raw) return null;
  try {
    const origin = new URL(raw);
    if (origin.protocol !== "https:" || !allowedOrigins.has(origin.hostname)) {
      return null;
    }
    return origin;
  } catch {
    return null;
  }
}

function failurePayload(failure: GoogleOAuthFailure) {
  return {
    code: failure.code,
    stage: failure.stage,
    reason: failure.reason,
    message: failure.message,
    retryable: failure.retryable,
    correlation_id: failure.correlation_id,
    details: failure.details,
  };
}

async function recordFailure(
  failure: GoogleOAuthFailure,
  context: FailureContext,
): Promise<void> {
  if (!context.userId) return;
  try {
    await service.from("audit_events").insert({
      user_id: context.userId,
      actor_type: "user",
      action_type: "google_oauth_failed",
      target_type: "google_oauth_state",
      target_id: context.stateId ?? failure.correlation_id,
      aal: "aal2",
      correlation_id: failure.correlation_id,
      result: "failure",
      redacted_after: {
        code: failure.code,
        stage: failure.stage,
        reason: failure.reason,
        retryable: failure.retryable,
        details: failure.details,
      },
    });
  } catch {
    // Never replace the original OAuth diagnostic with an audit persistence error.
  }
}

async function respondFailure(
  failure: GoogleOAuthFailure,
  status: number,
  context: FailureContext = {},
): Promise<Response> {
  await recordFailure(failure, context);
  const origin = redirectOrigin();
  if (origin) {
    const target = new URL("/data-sources", origin);
    target.searchParams.set("google", "error");
    target.searchParams.set("code", failure.code);
    target.searchParams.set("stage", failure.stage);
    target.searchParams.set("reason", failure.reason);
    target.searchParams.set("requestId", failure.correlation_id);
    target.searchParams.set("status", String(status));
    return Response.redirect(target.toString(), 302);
  }
  return json(failurePayload(failure), status);
}

function failure(
  correlationId: string,
  input: Omit<Parameters<typeof makeGoogleOAuthFailure>[0], "correlationId">,
) {
  return makeGoogleOAuthFailure({ ...input, correlationId });
}

function databaseCode(value: unknown): string | undefined {
  return safeGoogleProviderCode(value);
}

async function revokeAccessToken(accessToken: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: accessToken }),
  }).catch(() => undefined);
}

Deno.serve(async (request) => {
  const correlationId = crypto.randomUUID();
  let context: FailureContext = {};
  try {
    if (request.method !== "GET") {
      return respondFailure(
        failure(correlationId, {
          code: "method_not_allowed",
          stage: "callback_input",
          reason: "method_not_get",
        }),
        405,
      );
    }
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = safeGoogleProviderCode(url.searchParams.get("error"));
    if (!state) {
      return respondFailure(
        failure(correlationId, {
          code: "invalid_callback",
          stage: "callback_input",
          reason: "state_missing",
        }),
        400,
      );
    }
    if (!code && !providerError) {
      return respondFailure(
        failure(correlationId, {
          code: "invalid_callback",
          stage: "callback_input",
          reason: "authorization_code_missing",
        }),
        400,
      );
    }
    const result = await service
      .from("oauth_states")
      .select(
        "id,user_id,pkce_verifier_encrypted,requested_scopes,redirect_uri,expires_at,consumed_at",
      )
      .eq("state_hash", await sha(state))
      .maybeSingle();
    if (result.error) {
      return respondFailure(
        failure(correlationId, {
          code: "oauth_state_invalid",
          stage: "oauth_state_lookup",
          reason: "database_lookup_failed",
          retryable: true,
          details: {
            database_error: databaseCode(result.error.code) ?? "unknown",
          },
        }),
        503,
      );
    }
    if (!result.data) {
      return respondFailure(
        failure(correlationId, {
          code: "oauth_state_invalid",
          stage: "oauth_state_lookup",
          reason: "state_not_found",
        }),
        403,
      );
    }
    context = { userId: result.data.user_id, stateId: result.data.id };
    if (result.data.consumed_at) {
      return respondFailure(
        failure(correlationId, {
          code: "oauth_state_invalid",
          stage: "oauth_state_validation",
          reason: "state_already_used",
        }),
        403,
        context,
      );
    }
    if (new Date(result.data.expires_at) <= new Date()) {
      return respondFailure(
        failure(correlationId, {
          code: "oauth_state_invalid",
          stage: "oauth_state_validation",
          reason: "state_expired",
        }),
        403,
        context,
      );
    }
    const claim = await service
      .from("oauth_states")
      .update({
        consumed_at: new Date().toISOString(),
      })
      .eq("id", result.data.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (claim.error || !claim.data) {
      return respondFailure(
        failure(correlationId, {
          code: "oauth_state_invalid",
          stage: "oauth_state_claim",
          reason: claim.error ? "database_claim_failed" : "state_already_used",
          retryable: Boolean(claim.error),
          details: claim.error
            ? { database_error: databaseCode(claim.error.code) ?? "unknown" }
            : {},
        }),
        claim.error ? 503 : 403,
        context,
      );
    }
    if (providerError) {
      return respondFailure(
        failure(correlationId, {
          code: "google_consent_denied",
          stage: "callback_input",
          reason: providerError === "access_denied"
            ? "user_denied_consent"
            : "provider_returned_error",
          retryable: providerError !== "access_denied",
          details: { provider_error: providerError },
        }),
        providerError === "access_denied" ? 403 : 422,
        context,
      );
    }
    if (!code) {
      return respondFailure(
        failure(correlationId, {
          code: "invalid_callback",
          stage: "callback_input",
          reason: "authorization_code_missing",
        }),
        400,
        context,
      );
    }
    const appOrigin = redirectOrigin();
    if (!appOrigin) {
      const configured = env("PUBLIC_APP_ORIGIN", "APP_PUBLIC_ORIGIN");
      return respondFailure(
        failure(correlationId, {
          code: configured ? "app_origin_invalid" : "app_origin_unconfigured",
          stage: "application_redirect",
          reason: configured ? "origin_not_allowlisted" : "origin_missing",
        }),
        503,
        context,
      );
    }
    const clientId = env("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLOUD_CLIENT_ID");
    const clientSecret = env(
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_CLOUD_CLIENT_SECRET",
    );
    if (!clientId || !clientSecret) {
      return respondFailure(
        failure(correlationId, {
          code: "google_oauth_not_configured",
          stage: "configuration",
          reason: "client_credentials_missing",
        }),
        503,
        context,
      );
    }
    let verifier: string;
    try {
      verifier = await decrypt(result.data.pkce_verifier_encrypted);
    } catch (error) {
      const code = error instanceof Error &&
          ["token_encryption_unconfigured", "token_encryption_key_invalid"]
            .includes(error.message)
        ? error.message
        : "token_decryption_failed";
      return respondFailure(
        failure(correlationId, {
          code,
          stage: "oauth_state_decryption",
          reason: code === "token_decryption_failed"
            ? "verifier_decryption_failed"
            : "encryption_configuration_invalid",
        }),
        503,
        context,
      );
    }
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: result.data.redirect_uri,
          grant_type: "authorization_code",
          code_verifier: verifier,
        }),
      });
    } catch {
      return respondFailure(
        failure(correlationId, {
          code: "google_token_exchange_failed",
          stage: "google_token_exchange",
          reason: "provider_unreachable",
          retryable: true,
          details: { provider_status: "network_error" },
        }),
        502,
        context,
      );
    }
    const tokens = (await tokenResponse.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
    };
    const providerTokenError = safeGoogleProviderCode(tokens.error);
    if (!tokenResponse.ok) {
      return respondFailure(
        failure(correlationId, {
          code: "google_token_exchange_failed",
          stage: "google_token_exchange",
          reason: "provider_rejected_code",
          retryable: tokenResponse.status >= 500,
          details: {
            provider_status: tokenResponse.status,
            ...(providerTokenError
              ? { provider_error: providerTokenError }
              : {}),
          },
        }),
        422,
        context,
      );
    }
    const missingTokens = [
      !tokens.access_token ? "access_token" : null,
      !tokens.refresh_token ? "refresh_token" : null,
    ].filter((value): value is string => value !== null);
    if (missingTokens.length) {
      return respondFailure(
        failure(correlationId, {
          code: "google_token_response_incomplete",
          stage: "google_token_exchange",
          reason: "required_token_missing",
          details: { missing_tokens: missingTokens },
        }),
        422,
        context,
      );
    }
    const grantedScopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? [];
    const approvedScopeSet = new Set<string>(APPROVED_GOOGLE_SCOPES);
    if (!hasExactGoogleScopes(grantedScopes)) {
      await revokeAccessToken(tokens.access_token!);
      return respondFailure(
        failure(correlationId, {
          code: "google_scopes_invalid",
          stage: "google_scope_validation",
          reason: "scope_set_mismatch",
          details: {
            missing_scopes: APPROVED_GOOGLE_SCOPES.filter(
              (scope) => !grantedScopes.includes(scope),
            ),
            unexpected_scopes: grantedScopes.filter((scope) =>
              !approvedScopeSet.has(scope)
            ),
          },
        }),
        422,
        context,
      );
    }
    let account: Response;
    try {
      account = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
    } catch {
      await revokeAccessToken(tokens.access_token!);
      return respondFailure(
        failure(correlationId, {
          code: "google_profile_request_failed",
          stage: "google_profile_fetch",
          reason: "provider_unreachable",
          retryable: true,
          details: { provider_status: "network_error" },
        }),
        502,
        context,
      );
    }
    const profileBody = (await account.json().catch(() => ({}))) as {
      email?: unknown;
      verified_email?: unknown;
      error?: unknown;
    };
    const providerProfileError = safeGoogleProviderCode(profileBody.error);
    if (!account.ok) {
      await revokeAccessToken(tokens.access_token!);
      return respondFailure(
        failure(correlationId, {
          code: "google_profile_request_failed",
          stage: "google_profile_fetch",
          reason: "provider_rejected_profile_request",
          retryable: account.status >= 500,
          details: {
            provider_status: account.status,
            ...(providerProfileError
              ? { provider_error: providerProfileError }
              : {}),
          },
        }),
        502,
        context,
      );
    }
    const profileEmail = typeof profileBody.email === "string"
      ? profileBody.email.toLowerCase()
      : null;
    if (!profileEmail) {
      await revokeAccessToken(tokens.access_token!);
      return respondFailure(
        failure(correlationId, {
          code: "google_profile_incomplete",
          stage: "google_account_validation",
          reason: "email_missing",
          details: {
            profile_verified_email: profileBody.verified_email === true,
          },
        }),
        403,
        context,
      );
    }
    if (profileBody.verified_email !== true) {
      await revokeAccessToken(tokens.access_token!);
      return respondFailure(
        failure(correlationId, {
          code: "google_account_not_verified",
          stage: "google_account_validation",
          reason: "email_unverified",
          details: { profile_verified_email: false },
        }),
        403,
        context,
      );
    }
    if (profileEmail !== allowedEmail) {
      await revokeAccessToken(tokens.access_token!);
      return respondFailure(
        failure(correlationId, {
          code: "google_account_not_allowed",
          stage: "google_account_validation",
          reason: "account_mismatch",
          details: {
            profile_verified_email: true,
            allowlisted_account_match: false,
          },
        }),
        403,
        context,
      );
    }
    const connection = await service
      .from("connections")
      .upsert(
        {
          user_id: result.data.user_id,
          provider: "google",
          account_label: profileEmail,
          status: "connected",
          sync_enabled: true,
          scopes: [...APPROVED_GOOGLE_SCOPES],
          encrypted_credential_reference: "connection_credentials",
        },
        { onConflict: "user_id,provider" },
      )
      .select("id")
      .single();
    if (connection.error || !connection.data) {
      return respondFailure(
        failure(correlationId, {
          code: "connection_store_failed",
          stage: "connection_persist",
          reason: "database_write_failed",
          retryable: true,
          details: {
            database_error: databaseCode(connection.error?.code) ?? "unknown",
          },
        }),
        500,
        context,
      );
    }
    let encryptedRefreshToken: string;
    try {
      encryptedRefreshToken = await encrypt(tokens.refresh_token!);
    } catch (error) {
      const code = error instanceof Error &&
          ["token_encryption_unconfigured", "token_encryption_key_invalid"]
            .includes(error.message)
        ? error.message
        : "credential_store_failed";
      return respondFailure(
        failure(correlationId, {
          code,
          stage: "credential_encryption",
          reason: code === "credential_store_failed"
            ? "refresh_token_encryption_failed"
            : "encryption_configuration_invalid",
        }),
        503,
        context,
      );
    }
    const credential = await service
      .from("connection_credentials")
      .upsert(
        {
          connection_id: connection.data.id,
          encrypted_refresh_token: encryptedRefreshToken,
          token_expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
        },
        { onConflict: "connection_id" },
      )
      .select("connection_id")
      .single();
    if (credential.error || !credential.data) {
      await service
        .from("connections")
        .update({
          status: "disconnected",
          sync_enabled: false,
        })
        .eq("id", connection.data.id);
      return respondFailure(
        failure(correlationId, {
          code: "credential_store_failed",
          stage: "credential_persist",
          reason: "database_write_failed",
          retryable: true,
          details: {
            database_error: databaseCode(credential.error?.code) ?? "unknown",
          },
        }),
        500,
        context,
      );
    }
    await service.from("audit_events").insert({
      user_id: result.data.user_id,
      actor_type: "user",
      action_type: "google_oauth_connected",
      target_type: "connection",
      target_id: connection.data.id,
      aal: "aal2",
      correlation_id: correlationId,
      result: "success",
    });
    const target = new URL("/data-sources", appOrigin);
    target.searchParams.set("google", "connected");
    target.searchParams.set("requestId", correlationId);
    return Response.redirect(target.toString(), 302);
  } catch {
    return respondFailure(
      failure(correlationId, {
        code: "google_oauth_callback_failed",
        stage: "callback",
        reason: "unexpected_internal_error",
        retryable: true,
      }),
      500,
      context,
    );
  }
});
