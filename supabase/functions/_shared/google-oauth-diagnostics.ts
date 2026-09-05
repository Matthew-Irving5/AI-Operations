export type GoogleOAuthFailure = Readonly<{
  code: string;
  stage: string;
  reason: string;
  message: string;
  retryable: boolean;
  correlation_id: string;
  details: Readonly<Record<string, unknown>>;
}>;

const messages: Readonly<Record<string, string>> = {
  invalid_callback:
    "Google did not return the required OAuth callback parameters.",
  google_consent_denied:
    "Google consent was not completed, so no access was stored.",
  oauth_state_invalid:
    "The Google OAuth session was expired, already used, or not recognised.",
  google_oauth_not_configured:
    "Google OAuth is not configured in this environment.",
  token_encryption_unconfigured:
    "The server token-encryption key is not configured.",
  token_encryption_key_invalid: "The server token-encryption key is invalid.",
  token_decryption_failed:
    "The server could not decrypt the short-lived OAuth verifier.",
  google_token_exchange_failed:
    "Google rejected the authorization code during token exchange.",
  google_token_response_incomplete:
    "Google returned a token response without the required tokens.",
  google_scopes_invalid:
    "Google did not grant exactly the permissions required by AI Operations.",
  google_profile_request_failed:
    "Google returned an error while identifying the authorised account.",
  google_profile_incomplete:
    "Google did not return a complete account profile.",
  google_account_not_verified:
    "Google returned an account whose email is not verified.",
  google_account_not_allowed:
    "Google returned a verified account that is not the production allowlisted account.",
  connection_store_failed:
    "The server could not save the Google connection record.",
  credential_store_failed:
    "The server could not save the encrypted Google credential.",
  app_origin_unconfigured:
    "The application callback destination is not configured.",
  app_origin_invalid: "The application callback destination is invalid.",
  google_oauth_callback_failed:
    "The Google callback failed before the connection could be completed.",
};

export function googleOAuthMessage(code: string): string {
  return messages[code] ?? messages.google_oauth_callback_failed;
}

export function safeGoogleProviderCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)
    ? normalized
    : undefined;
}

export function makeGoogleOAuthFailure(input: {
  code: string;
  stage: string;
  reason: string;
  correlationId: string;
  retryable?: boolean;
  details?: Readonly<Record<string, unknown>>;
}): GoogleOAuthFailure {
  return {
    code: input.code,
    stage: input.stage,
    reason: input.reason,
    message: googleOAuthMessage(input.code),
    retryable: input.retryable ?? false,
    correlation_id: input.correlationId,
    details: input.details ?? {},
  };
}
