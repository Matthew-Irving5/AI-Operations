# Pass 07 evidence — final hardening

## Scope delivered so far

- Added server-enforced production onboarding and acceptance records, fresh-MFA Edge Function controls, and a schedule-enable gate that cannot be bypassed by browser state.
- Added Settings, Devices, and Systems & Automation authenticated surfaces, including safe empty/error states and mobile browser coverage.
- Replaced the Overview placeholder cards with authenticated operations, spend, approval, freshness, and report data plus safe empty/error states.
- Wired Travel and Procurement bounded on-demand launch forms through validated Next routes, the Edge Function, retained queue briefs, per-run caps/search ceilings, traces, and audit events.
- Hardened worker archive restore to verify the persisted SHA-256 and record count, with a tamper failure-path test.
- Hardened state-changing API routes by authenticating with `getUser` before relaying a session token to JWT-verified Edge Functions.
- Added HSTS, complete production deployment ordering (successful staging deployment first), production migration/Edge Function deployment, and login smoke verification.
- Made local E2E self-contained: it starts Supabase and obtains the local runtime JWT secret rather than relying on an operator shell.
- Added Deno type checking to the Edge Function workflow and corrected all defects it identified in Apple, Google, digital-plan, worker-pair, and GitHub function paths.

## Verification evidence

Executed on the Pass 07 branch against a clean local Supabase database:

- `corepack pnpm verify` — passed: Prettier, ESLint, TypeScript, 29 workspace unit tests, and production Next build.
- `corepack pnpm exec supabase db reset --local && corepack pnpm test:db` — passed: 55 pgTAP/database/RLS assertions, including bounded on-demand request and rate-limit rejection cases.
- `deno fmt --check supabase/functions && deno lint --rules-exclude=no-import-prefix supabase/functions && deno check supabase/functions/*/index.ts` — passed after correcting nine real strict-type findings.
- `python -m ruff check src tests && python -m pytest -p no:cacheprovider` in `apps/windows-worker` — passed: 9 tests.
- `corepack pnpm security` — passed its high-severity dependency gate and Gitleaks scan. The package manager reports one low and one moderate dependency advisory, below the configured high threshold; these must remain visible in routine dependency maintenance.
- `corepack pnpm test:e2e` — passed: 22 Chromium/WebKit tests, including authenticated control surfaces, iPhone-width checks, and axe critical/serious accessibility scans.

## Hosted release evidence

Hosted PR checks for PR #16 passed on 2026-08-03. Follow-up PR #17 (`6acabf3`) corrected deployment iteration over `_shared` modules; its CI, database/RLS, Playwright, Edge, security, and Windows checks all passed before merge.

- Staging deployment run `30856616441` passed on `main` after the fix: Worker, migrations, all Edge Functions, and `/login` smoke test succeeded. Independent HTTPS verification returned `200` from both staging and production login endpoints.
- Production run `30856819135` deployed the Worker, then stopped at migrations because the production environment has no `PRODUCTION_SUPABASE_ACCESS_TOKEN`, `PRODUCTION_SUPABASE_PROJECT_REF`, or `PRODUCTION_SUPABASE_DB_PASSWORD` secrets. Edge Function deployment and production acceptance therefore remain blocked by missing provider credentials; no production schema or functions were claimed as deployed.
- The production workflow now validates those three secrets before deploying the Worker, preventing a partial deployment on the next approved run.
