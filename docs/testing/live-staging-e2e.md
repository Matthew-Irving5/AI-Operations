# Live staging E2E

`pnpm test:e2e:live` targets only the fixed staging Worker and Supabase project. It signs in through the deployed login page, completes the existing Microsoft Authenticator TOTP challenge, queues one synthetic Travel request capped at `$0.01` with zero searches, verifies idempotent replay and the persisted run, budget, queue job, and correlated trace, then cancels the queued work through the Operations UI and verifies the persisted cancellation. The app request crosses the deployed Worker, authenticated Next route, staging Edge Function, database RPC, RLS-backed browser reads, and cancellation Edge Function. It never calls a model, search provider, or travel provider.

## Protected staging settings

The GitHub Environment `staging` requires these additional protected values before the manual workflow can run:

- Secret `LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY`: service-role key for the fixed staging Supabase project, used only by the Node test process for read-only backend assertions and fixture ownership discovery. It is never sent to the browser and performs no writes.
- Secret `LIVE_E2E_EMAIL`: the repository’s locked application identity.
- Secret `LIVE_E2E_PASSWORD`: operator-created staging sign-in credential for that account.
- Secret `LIVE_E2E_TOTP_SECRET`: the account’s operator-enrolled Microsoft Authenticator TOTP seed, stored only in the protected staging environment.
- Variable `LIVE_E2E_TOTP_FACTOR_ID`: the UUID of the dedicated verified factor named `AI Operations staging live E2E`. The browser harness explicitly selects this ID; it never chooses by provider array order.
- Existing secret `STAGING_SUPABASE_URL`: must identify the pinned staging Supabase project.

The staging app account must exist in Auth, have a verified TOTP factor, and have an enabled `app_users` row matching the repository’s locked identity. The test runs the actual password and fresh TOTP flow; it does not forge sessions, bypass MFA, or add an alternate test account. Configure these values only in the GitHub `staging` environment (or provide equivalent process environment values for a controlled local run). Do not put them in `.env`, shell history, source, test fixtures, logs, screenshots, or artifacts.

### Separate E2E factor enrollment

After the staging-only factor setup page is deployed, an operator with the locked account and a current AAL2 session opens `https://ai-operations-staging.ai-operations.workers.dev/mfa/staging-e2e-factor`. Choose **Add staging E2E factor**, scan the one-time QR code using a separate authenticator entry, and enter a current code to verify it. This adds a second TOTP factor; it does not remove or replace the operator’s existing factor. Copy the seed directly into the GitHub `staging` environment secret `LIVE_E2E_TOTP_SECRET` and the displayed UUID into the staging environment variable `LIVE_E2E_TOTP_FACTOR_ID`. Never send either value in chat or place them in logs. The setup response is no-store and the page keeps setup material only in memory until verification or cancellation. Normal `/mfa` defaults to the existing non-E2E verified factor, while the live harness explicitly selects the configured E2E factor ID. See AI-13 for the follow-up auth-factor ownership contract.

## Safe live AAL2 probe

After the probe route is deployed to staging, an operator can verify the Edge Function bearer-JWT AAL2 gate without creating or changing a workflow, schedule, or provider call:

1. Sign in at `https://ai-operations-staging.ai-operations.workers.dev/login` and complete the existing six-digit TOTP challenge at `/mfa`.
2. In the same authenticated staging tab, run:

   ```js
   await fetch('/api/auth/mfa/aal2-probe', {
     method: 'POST',
     headers: { 'content-type': 'application/json' },
     body: '{}',
   }).then((response) => response.json());
   ```

3. Expect `{ status: 400, code: 'invalid_plan', probeId: '<uuid>' }`. The probe forwards a fixed empty object to the existing `digital-plan-approve` Edge Function. That function authenticates the forwarded session and returns `invalid_plan` before any database access or mutation. The pre-fix stateless assurance check returns `403`, so this status/code pair distinguishes the deployed fix. The app route requires the exact staging app origin, exact staging Supabase URL, same-origin request, and a validated cookie-backed session; it never accepts an arbitrary Edge URL/body or returns/logs the bearer token. The route returns 404 outside the pinned staging target.

## Run modes

- `suite`: validates the profile prerequisite, then runs desktop Chromium and iPhone-sized WebKit browser scenarios against deployed staging.
- `fixtures`: verifies the enabled locked app profile and discovers queued on-demand Travel runs that match the `a17e` UUID namespace and exact `AI7-LIVE-E2E-FIXTURE-v1` job payload marker. The fixed staging target, owner UUID, workflow definition, trigger, queue job type, status, namespace, and payload marker must all match. The test then signs in with password and fresh MFA and cancels only those IDs through the authenticated app route/Edge Function. No service-role write or unmarked app-data mutation is performed.
- `mismatch`: proves the fixed target guard rejects swapped app and Supabase origins before any network request.

Run manually from `main` with workflow **Live staging E2E**. On failure, tests on explicitly safe routes attach a masked screenshot and a sanitized route/status trace without request bodies, headers, cookies, response bodies, or query strings; GitHub retains those artifacts for two days. Inputs, navigation, headers, cards, and the locked email are masked before screenshot capture; no screenshots are retained from other routes. Raw Playwright traces and video are disabled because they can capture authenticated session material or transient MFA codes. The tests print only non-personal test output.

## Scope limitation

The canonical conversation state/API contract is tracked by AI-14 and is not present on the current staging build. This harness does not create a shadow conversation table or claim conversation persistence/streaming acceptance. That branch remains unverified until AI-14’s canonical contract is implemented and deployed to staging; do not post `LIVE E2E SIGN-OFF: PASS` for all of AI-7 until that dependency is resolved and tested in this hosted suite.
