# Pass 03 evidence

Status: IN_PROGRESS.

## Delivery hardening baseline

- Added `pnpm verify:ci`, a local CI-equivalent gate covering workspace checks, local Supabase reset and pgTAP/RLS tests, Deno checks, Windows worker Ruff/Pytest, dependency and secret scans, and Chromium/WebKit Playwright tests.
- Added a PR CI Cloudflare OpenNext dry-run on Ubuntu. Native Windows documents and explicitly skips that adapter-only check because OpenNext does not support Windows.
- Enforced LF checkout for Supabase Edge Functions so Deno formatting detects source defects rather than Windows line-ending conversion.
- Verified `pnpm verify:ci` locally: all static, database, security, worker, Chromium, and WebKit checks passed. The existing lint warning for the MFA QR-code image remains non-failing.

## Pass scope status

Personal Operations feature implementation has not started. This opening change exists to prevent avoidable CI retry cycles during the remaining Pass 3 work.
