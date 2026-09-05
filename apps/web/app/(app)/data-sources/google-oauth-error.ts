export type GoogleOAuthErrorParams = Readonly<{
  code?: string | undefined;
  detail?: string | undefined;
  requestId?: string | undefined;
}>;

export type GoogleOAuthErrorView = Readonly<{
  title: string;
  message: string;
  action: string;
  code: string;
  requestId: string | null;
}>;

const knownMessages: Readonly<
  Record<string, Pick<GoogleOAuthErrorView, 'title' | 'message' | 'action'>>
> = {
  google_account_not_allowed: {
    title: 'The Google account is not approved',
    message:
      'Google authorised an account that is different from the approved AI Operations account.',
    action:
      'Restart Google authorisation and choose matthewirving99@gmail.com. If more than one account is signed in, use a private browser window or sign out of the other Google accounts first.',
  },
  google_account_not_verified: {
    title: 'Google could not verify the account email',
    message:
      'Google returned the selected account, but did not confirm that its email address is verified.',
    action:
      'Verify the email address in Google, then restart authorisation using matthewirving99@gmail.com.',
  },
  google_profile_incomplete: {
    title: 'Google returned an incomplete account profile',
    message:
      'The account profile did not contain the email information required to validate the connection.',
    action:
      'Restart Google authorisation using matthewirving99@gmail.com. If it repeats, provide the reference below to support.',
  },
  google_profile_request_failed: {
    title: 'Google account verification failed',
    message:
      'Google rejected or could not complete the request used to identify the authorised account.',
    action: 'Retry once. If it fails again, provide the reference below to support.',
  },
  google_scopes_invalid: {
    title: 'Google permissions were incomplete',
    message: 'Google did not grant the complete set of permissions required by AI Operations.',
    action:
      'Restart Google authorisation and approve every requested permission. No Google credential was retained.',
  },
  google_token_exchange_failed: {
    title: 'Google did not issue a usable credential',
    message: 'Google accepted the consent step, but the authorization code could not be exchanged.',
    action:
      'Restart Google authorisation. If it fails again, provide the reference below to support.',
  },
  oauth_state_invalid: {
    title: 'The Google authorisation session expired',
    message: 'The one-time Google authorisation session was missing, already used, or expired.',
    action: 'Start Google authorisation again from this page; do not reuse an old browser tab.',
  },
  invalid_callback: {
    title: 'Google returned an incomplete response',
    message: 'The Google callback did not contain the required one-time authorisation values.',
    action: 'Start Google authorisation again from this page.',
  },
  google_oauth_not_configured: {
    title: 'Google authorisation is not configured',
    message: 'The server is missing the Google OAuth configuration required to connect an account.',
    action: 'Contact the system administrator and provide the reference below.',
  },
  token_encryption_unconfigured: {
    title: 'Credential encryption is not configured',
    message:
      'AI Operations cannot safely store the Google credential because its encryption configuration is missing.',
    action: 'Do not retry. Provide the reference below to support.',
  },
  token_encryption_key_invalid: {
    title: 'Credential encryption configuration is invalid',
    message:
      'AI Operations refused to store the Google credential because its encryption key configuration failed validation.',
    action: 'Do not retry. Provide the reference below to support.',
  },
  token_decryption_failed: {
    title: 'The authorisation session could not be decrypted',
    message:
      'AI Operations could not read the protected one-time verifier for this authorisation attempt.',
    action: 'Restart authorisation. If it repeats, provide the reference below to support.',
  },
  app_origin_unconfigured: {
    title: 'The application return address is not configured',
    message: 'Google completed its step, but AI Operations has no configured return destination.',
    action: 'Do not retry. Provide the reference below to support.',
  },
  app_origin_invalid: {
    title: 'The application return address was rejected',
    message: 'AI Operations refused to redirect to an unapproved or invalid destination.',
    action: 'Do not retry. Provide the reference below to support.',
  },
  connection_store_failed: {
    title: 'Google connected, but setup was not saved',
    message: 'Google consent completed, but AI Operations could not save the connection record.',
    action: 'Do not retry repeatedly; provide the reference below to support.',
  },
  credential_store_failed: {
    title: 'Google connected, but the credential was not saved',
    message: 'Google consent completed, but the encrypted credential could not be stored.',
    action: 'The connection was disabled for safety. Provide the reference below to support.',
  },
};

function bounded(value: string | undefined, maximum: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximum ? trimmed : null;
}

/**
 * Convert callback query values into a safe, actionable view.
 * Provider response bodies, authorization codes, email addresses, and tokens
 * are deliberately never rendered from the query string.
 */
export function googleOAuthErrorView(params: GoogleOAuthErrorParams): GoogleOAuthErrorView | null {
  const code = bounded(params.code, 80);
  if (!code) return null;
  const known = knownMessages[code];
  const requestId = bounded(params.requestId, 128);
  if (known) return { ...known, code, requestId };
  return {
    title: 'Google authorisation failed',
    message: 'AI Operations could not complete Google authorisation.',
    action:
      'Start Google authorisation again. If it fails again, provide the reference below to support.',
    code,
    requestId,
  };
}
