# Local autonomous QA

Every implementation session starts with `pnpm qa:doctor --fix`. The doctor verifies the repository and developer runtimes, starts Docker Desktop when possible, repairs/restarts a stale local Supabase stack, warms the required Supabase Docker images, and verifies Chromium/WebKit, Deno and Python before feature investigation begins. A warm healthy session is intentionally cheap; recovery work happens once at ticket start rather than during debugging.

`pnpm qa:local` remains the **full isolated browser regression** command. It creates a private Supabase project with a unique project ID and ports, starts a loopback Next.js app on a free port, and runs the requested Playwright projects (Chromium and WebKit when no project filter is supplied). Use it when the impact router selects browser proof, for explicit full regression, or when debugging genuinely crosses the browser/application boundary. It is no longer a mandatory pre-PR tax for backend, release-script, DB-only or other unrelated changes.

`pnpm verify:changed` is the normal final local gate. It combines the committed branch diff with staged, unstaged and untracked work, classifies the changed surface, and runs only the static/package/DB/Edge/worker/browser/security checks capable of detecting regressions in that surface. Changes to central build/test routing fail safe to broader verification. CI runs independent core and boundary lanes from the same impact plan; scheduled workflows retain the full Chromium/WebKit and Edge regression sweeps.

`pnpm qa:debug -- <narrow reproduction command>` captures a sanitized failure bundle under ignored `.qa/debug/` with the failure class, changed files, diff summary, extracted source locations and the required next debugging action. Use it when a failure is not already obvious from the test output; do not use a broad suite as a search tool.
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

Use the cheapest proof capable of detecting each changed behaviour. During implementation, rerun only the failing/affected unit, contract or component test. Add one real boundary proof for the boundary actually changed. Do not run a broad suite while a narrow reproducer is still red, and stop speculative patching after two unsupported fix hypotheses.

Before the single ticket PR, run `pnpm verify:changed`. Browser changes normally receive Chromium proof on the PR path; WebKit/full browser regression is reserved for explicit compatibility/auth/design-system acceptance and the scheduled regression. DB, Edge, worker and security checks are selected only when their surfaces changed. CI is independent verification, not the primary debugging environment, and superseded CI runs are cancelled.

Staging is reserved for boundaries localhost cannot faithfully prove: hosted Auth/AAL2, deployment/provenance behaviour, real provider callbacks/credentials, and similarly hosted-only contracts. A ticket should normally declare at most one or two live-only scenarios. Manual MFA remains a parked human gate rather than blocking unrelated development throughput. After staging acceptance, promote through the existing release provenance gates and perform only the bounded affected-capability production smoke.

Every deterministic defect first found in CI, staging or production must leave a cheaper regression or invariant below that layer before the ticket completes. The same deterministic failure should not be able to escape to the same stage twice.
