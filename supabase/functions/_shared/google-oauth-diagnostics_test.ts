import {
  googleOAuthMessage,
  makeGoogleOAuthFailure,
  safeGoogleProviderCode,
} from './google-oauth-diagnostics.ts';

Deno.test('Google OAuth failures contain a safe boundary and correlation id', () => {
  const failure = makeGoogleOAuthFailure({
    code: 'google_account_not_allowed',
    stage: 'google_account_validation',
    reason: 'account_mismatch',
    correlationId: '00000000-0000-4000-8000-000000000001',
    details: { account_match: false },
  });
  if (failure.message.includes('matthewirving99')) {
    throw new Error('allowlisted email must not be embedded in diagnostics');
  }
  if (
    failure.stage !== 'google_account_validation' ||
    failure.reason !== 'account_mismatch' ||
    failure.correlation_id !== '00000000-0000-4000-8000-000000000001'
  ) {
    throw new Error('OAuth diagnostic lost its boundary metadata');
  }
});

Deno.test('provider codes are restricted to safe bounded values', () => {
  if (safeGoogleProviderCode('invalid_grant') !== 'invalid_grant') {
    throw new Error('expected a normal provider error code to be retained');
  }
  if (safeGoogleProviderCode('client_secret=do-not-expose')) {
    throw new Error('provider error details must not be copied into diagnostics');
  }
  if (googleOAuthMessage('unknown') === 'unknown') {
    throw new Error('unknown errors need a generic safe message');
  }
});
