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

## Release evidence pending

Hosted PR checks for PR #16 passed on 2026-08-03: CI verify run `30854634790`, database/RLS run `30854633069`, Playwright run `30854632890`, Edge Functions run `30854634439`, security run `30854632894`, and Windows worker run `30854633554`. These prove the hosted branch checks, not yet staging/production deployment or final traceability completion.

Staging deployment, production deployment, PR merge, and the requirement-by-requirement final traceability audit remain release gates. This file must be updated with their run URLs/identifiers only after they are observed; no hosted deployment assertion is inferred from local validation.
