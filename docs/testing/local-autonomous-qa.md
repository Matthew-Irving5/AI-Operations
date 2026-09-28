# Local autonomous QA

Run `pnpm qa:local` from the repository root before opening a ticket PR. It runs
`pnpm qa:preflight`, creates a private Supabase project with a unique project ID
and ports, starts a loopback Next.js app on a free port, and runs the normal
Chromium and WebKit E2E projects. The seeded database, Next build output,
Playwright result directory and browser contexts are isolated to that run.
Supabase and app processes are stopped and temporary services/build output are
removed when Playwright exits; failure artifacts remain under
`test-results/local/<session-id>`.

`pnpm qa:preflight` checks the Node/pnpm versions, Docker engine, Supabase CLI,
and Chromium/WebKit installations before starting services. The integrated
`pnpm qa:local` command then checks the local Supabase Auth health endpoint
before it launches Playwright. A stopped Docker engine, missing browser, bad
authentication configuration, failed database startup, or unhealthy Auth
endpoint returns a short actionable diagnostic before the feature journey.

The test runner creates a random local password for the locked application
identity when `LOCAL_TEST_PASSWORD` is not set. This value exists only in the
process environment for the run. The browser sends it to the local-only
`/api/auth/local-test-session` route, which sets a short-lived AAL2-equivalent
JWT signed with that run's local Supabase JWT secret. The route never accepts a
user ID, signing key, session, or AAL value from the request. It keeps the
application email allowlist, same-origin check, server-side session validation,
database RLS and downstream capability/ownership checks active. TOTP seeds and
codes are not part of local auth configuration.

The endpoint is available only when all of these are true: `LOCAL_TEST_AUTH`
is explicitly `true` or `1`, `APP_ENV=local`, Next runs in development mode,
the app origin and Supabase URL are HTTP loopback URLs, and local credentials
plus the local signing key exist. Next startup and middleware both check this
contract. Any non-empty local-auth flag in a staging/production configuration,
or an invalid local configuration, fails closed. The app never treats a
staging or production Supabase URL as local.

## Optional staging Auth credential check

To verify local test credentials against the staging Auth service, put these
values in the local process environment or the ignored root `.env` file:

```text
LOCAL_TEST_AUTH_VALIDATE_STAGING=true
LOCAL_TEST_STAGING_EMAIL=<operator-managed staging test email>
LOCAL_TEST_STAGING_PASSWORD=<operator-managed staging password>
LOCAL_TEST_STAGING_ANON_KEY=<staging anon key>
```

The server posts the credentials only to the fixed staging Supabase Auth
password-token endpoint. It discards the response body and remote session; a
successful response permits creation of the separate local session. Failed
credentials, transport errors and redirects fail closed. This path performs no
staging application, database, Edge Function or fixture mutation. The staging
anon key and password are never sent to browser code or logged. No service-role
key or TOTP secret is needed.

## Ticket QA and live acceptance

Use the local database and seeded synthetic fixtures for feature debugging,
including writes. Each `pnpm qa:local` run owns a separate ephemeral Supabase
project, so parallel sessions do not share fixture rows or ports. Keep tests
idempotent within one run and use the generated session ID when naming any
additional artifacts. Browser tests use isolated Playwright contexts and do
not persist browser profiles.

Before the single ticket PR, exercise the acceptance happy path plus ownership,
permission, validation, empty/degraded, retry/recovery and responsive states
that apply to the ticket. CI runs the same isolated local E2E command. Keep the
PR open while its candidate is deployed to staging. Staging is reserved for
real hosted Auth/AAL2, Supabase/RLS/function and provider boundaries, with one
manual user MFA checkpoint in the same visible browser where needed. Never
automate staging TOTP or reuse the local JWT against a hosted environment.
After staging acceptance, merge that PR and perform only the bounded production
smoke required by the project QA standard.
