# Authentication configuration

The application uses one allowlisted Supabase Auth identity. Password sign-in is followed by
TOTP verification, and protected routes require an AAL2 session. Sensitive website actions require
a separate, action-bound MFA gate that expires after five minutes. Verified Gmail commands keep
their own authority contract and do not receive a second content-based MFA challenge.

## Local Supabase

The repository's `supabase/config.toml` is the source for local Auth behavior. Global
`auth.enable_signup = false` disables new accounts while
`auth.email.enable_signup = true` keeps password sign-in available to the existing synthetic user;
anonymous signup is disabled. It enables TOTP enrollment and verification, restricts enrollment to
one TOTP factor, uses a 12-character password minimum with letters, numbers, and symbols, keeps
access tokens at Supabase's recommended one-hour default, and enables refresh-token rotation with
the recommended 10-second reuse interval. It also allows the local application callback URL and
limits sign-in and recovery-email requests.

After changing local Auth settings, restart the local Supabase stack before relying on them. The
seeded local account is synthetic and must not contain production personal data. Recovery emails
are delivered to the local Inbucket service.

## Staging and production

Configure and verify each Supabase project independently in **Authentication → Sign In / Providers**
and **Authentication → MFA**:

- Disable new user signups and anonymous sign-ins while keeping the email/password provider enabled
  for the existing allowlisted user.
- Require TOTP for application access; enable both TOTP enrollment and verification.
- Set minimum password length to 12 and require letters, numbers, and symbols.
- Enable leaked-password protection.
- Enable secure password changes and email confirmation.
- Keep access-token expiry at 3600 seconds and refresh-token rotation on with a 10-second reuse
  interval.
- Limit recovery-email requests and use the project's configured email provider.
- Allow the environment's exact `PUBLIC_APP_ORIGIN/auth/callback` URL for recovery redirects.

The hosted dashboard is authoritative for leaked-password protection because the Supabase CLI local
configuration does not expose the Have I Been Pwned check. Verify that setting in both hosted
projects; a local password-policy pass does not prove the hosted breach check. Record the check in
the environment acceptance evidence without copying credentials or recovery material.

Do not run a broad `supabase config push` to apply these settings. It can overwrite unrelated hosted
Auth/security configuration from a local file. Apply or verify only the named settings through the
project's authenticated dashboard or a reviewed, field-specific Management API update.

## Password recovery flow

The public recovery form returns the same status and message for valid addresses and routes them
through Supabase Auth's documented non-enumerating `resetPasswordForEmail` API. Supabase reports no
error and sends no email when no account exists; disabled signup and the application allowlist
preserve the single-user boundary. A response-time floor removes the handler's fast path, while
provider latency can still vary. The PKCE callback validates the Supabase session and identity,
then issues a ten-minute HttpOnly recovery marker bound to that session. Password update requires
that marker, enforces the minimum length, updates the password through Supabase Auth, and revokes all
sessions before reporting success. See [Supabase password recovery behavior](https://supabase.com/docs/guides/auth/passwords#resetting-a-password).

`PUBLIC_APP_ORIGIN` must be set to the exact HTTPS application origin in hosted environments. It is
already declared for staging and production in the Wrangler environment configuration. Local
development can use `http://127.0.0.1:3000`.
