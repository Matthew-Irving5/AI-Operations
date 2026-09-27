# Live staging E2E

`pnpm test:e2e:live` targets only the fixed staging Worker and Supabase project. It signs in through the deployed login page, completes the existing Microsoft Authenticator TOTP challenge, queues one synthetic Travel request capped at `$0.01` with zero searches, verifies idempotent replay and the persisted run, budget, queue job, and correlated trace, then cancels the queued work through the Operations UI and verifies the persisted cancellation. The app request crosses the deployed Worker, authenticated Next route, staging Edge Function, database RPC, RLS-backed browser reads, and cancellation Edge Function. It never calls a model, search provider, or travel provider.

## Protected staging settings

The GitHub Environment `staging` requires these additional protected values before the manual workflow can run:

- Secret `LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY`: service-role key for the fixed staging Supabase project, used only by the Node test process for read-only backend assertions and fixture ownership discovery. It is never sent to the browser and performs no writes.
- Secret `LIVE_E2E_EMAIL`: the repository’s locked application identity.
- Secret `LIVE_E2E_PASSWORD`: operator-created staging sign-in credential for that account.
- Secret `LIVE_E2E_TOTP_SECRET`: the account’s operator-enrolled Microsoft Authenticator TOTP seed, stored only in the protected staging environment.
- Existing secret `STAGING_SUPABASE_URL`: must identify the pinned staging Supabase project.

The staging app account must exist in Auth, have a verified TOTP factor, and have an enabled `app_users` row matching the repository’s locked identity. The test runs the actual password and fresh TOTP flow; it does not forge sessions, bypass MFA, or add an alternate test account. Configure these values only in the GitHub `staging` environment (or provide equivalent process environment values for a controlled local run). Do not put them in `.env`, shell history, source, test fixtures, logs, screenshots, or artifacts.

## Run modes

- `suite`: validates the profile prerequisite, then runs desktop Chromium and iPhone-sized WebKit browser scenarios against deployed staging.
- `fixtures`: verifies the enabled locked app profile and discovers queued on-demand Travel runs that match the `a17e` UUID namespace and exact `AI7-LIVE-E2E-FIXTURE-v1` job payload marker. The fixed staging target, owner UUID, workflow definition, trigger, queue job type, status, namespace, and payload marker must all match. The test then signs in with password and fresh MFA and cancels only those IDs through the authenticated app route/Edge Function. No service-role write or unmarked app-data mutation is performed.
- `mismatch`: proves the fixed target guard rejects swapped app and Supabase origins before any network request.

Run manually from `main` with workflow **Live staging E2E**. On failure, tests on explicitly safe routes attach a masked screenshot and a sanitized route/status trace without request bodies, headers, cookies, response bodies, or query strings; GitHub retains those artifacts for two days. Inputs, navigation, headers, cards, and the locked email are masked before screenshot capture; no screenshots are retained from other routes. Raw Playwright traces and video are disabled because they can capture authenticated session material or transient MFA codes. The tests print only non-personal test output.

## Scope limitation

The canonical conversation state/API contract is tracked by AI-14 and is not present on the current staging build. This harness does not create a shadow conversation table or claim conversation persistence/streaming acceptance. That branch remains unverified until AI-14’s canonical contract is implemented and deployed to staging; do not post `LIVE E2E SIGN-OFF: PASS` for all of AI-7 until that dependency is resolved and tested in this hosted suite.
