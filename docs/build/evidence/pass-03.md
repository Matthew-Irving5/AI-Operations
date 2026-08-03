# Pass 03 evidence

Status: MERGED in PR #9 on 2026-08-03.

## Delivery hardening baseline

- Added `pnpm verify:ci`, a local CI-equivalent gate covering workspace checks, local Supabase reset and pgTAP/RLS tests, Deno checks, Windows worker Ruff/Pytest, dependency and secret scans, and Chromium/WebKit Playwright tests.
- Added a PR CI Cloudflare OpenNext dry-run on Ubuntu. Native Windows documents and explicitly skips that adapter-only check because OpenNext does not support Windows.
- Enforced LF checkout for Supabase Edge Functions so Deno formatting detects source defects rather than Windows line-ending conversion.
- Verified `pnpm verify:ci` locally: all static, database, security, worker, Chromium, and WebKit checks passed. The existing lint warning for the MFA QR-code image remains non-failing.

## Implemented Pass 3 foundation

- Added forward-safe Personal Operations, Google ingestion, Apple bridge, cursor, credential, planning,
  and RLS contracts. An empty-database reset and pgTAP tests prove the policies and the silent midday
  exception rule.
- Added encrypted Google OAuth PKCE state and refresh-token storage, callback state claiming, token
  refresh failure recovery, connection status persistence, and read-only Gmail/Calendar/Drive sync
  records.
- Added Apple device-token registration/revocation, scoped snapshot import, receipt idempotency, and
  approved-action pull contracts. Device tokens are one-time display values; only their hashes persist.
- Added deterministic Personal planning conflict/ranking primitives, four Personal workflow definitions,
  a deterministic report completion path, and a silent no-change midday result.
- Added Personal Operations and Data Sources authenticated pages with explicit empty/error handling,
  plus initial browser coverage for those states.

## Validation to date

- `pnpm verify`: passed (format, lint, strict type checks, unit tests, and production build).
- `supabase db reset --local` and `pnpm test:db`: passed, including 29 pgTAP/RLS tests.
- `deno fmt --check supabase/functions` and Deno lint with the repository's external-import exception:
  passed.
- Targeted manager-core and integrations tests: passed.

The full CI-equivalent command and browser matrix passed locally and again in GitHub Actions. Staging
configuration was validated through the Ubuntu OpenNext dry run in CI.

## Merge verification

- PR #9 was squash-merged as `e1e4d4a4e4bfb26aba70e300e0c680ebd5d67687`.
- GitHub CI, Database, Edge functions, E2E, Security, and Windows worker checks all completed
  successfully after merge.
