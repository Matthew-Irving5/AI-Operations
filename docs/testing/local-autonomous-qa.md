# Local-first transition notice

The v2 source of truth is [local-first-ticket-contract-v2.md](local-first-ticket-contract-v2.md). Where historical text below conflicts, the six-section ticket and changed-boundary test selection supersede it. Protected GitHub staging checks still apply until migrated; do not fake them.

# Local autonomous QA

Every implementation session starts with the six-section ticket, not a universal environment bootstrap. Start only the services required by the ticket's exact testing list. Use `pnpm qa:doctor --fix` to diagnose or repair a proven environment fault; do not start Docker, Supabase, browsers or WebKit for logic-only work.

`pnpm qa:local` remains the **full isolated browser regression** command. It creates a private Supabase project with a unique project ID and ports, starts a loopback Next.js app on a free port, and runs the requested Playwright projects (Chromium and WebKit when no project filter is supplied). Use it when the impact router selects browser proof, for explicit full regression, or when debugging genuinely crosses the browser/application boundary. It is no longer a mandatory pre-PR tax for backend, release-script, DB-only or other unrelated changes.

The ticket's exact focused test commands are the required local acceptance. `pnpm verify:changed` is an optional broader diagnostic when a shared boundary or unknown dependency is modified, not a universal final gate. It combines the committed branch diff with staged, unstaged and untracked work, classifies the changed surface, and runs only the static/package/DB/Edge/worker/browser/security checks capable of detecting regressions in that surface. Changes to central build/test routing fail safe to broader verification. Routine PR CI runs only the independent changed-surface core lane and security workflows. Boundary suites belong to ticket-directed local proof or scheduled/manual regression. The old strict staging ruleset still applies until AI-70/AI-71 transition is verified.

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

Before the single ticket PR, execute the listed local tests for changed behaviour, direct consumers, role identity and negative cases. Run `pnpm verify:changed` only if the ticket requires a shared-boundary impact check. Browser proof is required only for changed visual/interactive behaviour. WebKit/full regression belongs to explicit compatibility acceptance or the scheduled suite. Required GitHub PR CI stays lightweight and independent.

Staging is reserved for boundaries localhost cannot faithfully prove: hosted Auth/AAL2, deployment/provenance behaviour, real provider callbacks/credentials, and similarly hosted-only contracts. A ticket should usually contain no live-only scenarios. When needed, move hosted-only acceptance into a specifically dependent release ticket. Manual MFA remains a parked human gate rather than blocking unrelated development throughput. For the current transition, preserve all existing release provenance gates. After AI-70/AI-71 are verified, promote integrated-main releases through the new protected gate and bounded smoke.

Every deterministic defect first found in CI, staging or production must leave a cheaper regression or invariant below that layer before the ticket completes. The same deterministic failure should not be able to escape to the same stage twice.
