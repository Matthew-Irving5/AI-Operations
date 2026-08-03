# Pass 06 evidence — Digital Estate worker and archival lifecycle

## Delivered scope

- Outbound-only Python worker with local SQLite replay state, DPAPI-protected Ed25519 identity, signed inventory results, signed one-action manifests, strict reversible executor, quarantine-only deletion boundary, Parquet/Zstandard archive read-back verification, and Windows packaging/CI.
- Fresh-MFA device registration, one-time pairing, heartbeat, offline scan queueing, signed result ingestion, immutable plan approval, and per-manifest result recording Edge Functions.
- Digital Estate dashboard and bounded scan launcher, RLS-protected operational/archive/recovery/storage forecast tables, and staging deployment of Edge Functions.

## Validation performed

- `corepack pnpm exec supabase db reset --local` followed by `corepack pnpm test:db` — passed, 44 pgTAP assertions.
- `python -m ruff check src tests` and `python -m pytest -p no:cacheprovider` in `apps/windows-worker` — passed, 9 tests, including signature, expiry, replay, traversal, reparse-point, changed-file, exclusion, signed-result, and Parquet round-trip coverage.
- `corepack pnpm verify:ci` — passed: format, lint, TypeScript, workspace unit tests, production build, local database reset/RLS, Edge Function checks, security audit/gitleaks, and 18 Playwright Chromium/WebKit tests (including the Digital Estate safe state).

The interactive in-app browser connector was unavailable in this session; the repository-owned Playwright suite performed the browser validation instead.

## Deployment impact

The staging workflow now deploys every checked-in Supabase Edge Function after migrations. Deployment requires the existing staging Supabase secrets and validates on merge to `main`.
