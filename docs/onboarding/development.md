# Development environment

Use Node 22.18+, pnpm 10.18+, Docker, Supabase CLI, Wrangler, Python 3.12, and MinIO. Copy `.env.example` to `.env.local`, using only development credentials. Run `pnpm install`, `supabase start`, then `pnpm dev`. Synthetic data only is permitted.

Run `pnpm verify:ci` from a clean feature branch before opening a PR. It mirrors the repository's required checks: workspace verification, local migration reset and pgTAP/RLS tests, Deno checks, worker Ruff/Pytest, dependency/secret scans, and Chromium/WebKit Playwright tests against a synthetic local Supabase stack. It starts the local Supabase stack and resets only that local database. Native Windows skips the OpenNext Cloudflare dry-run because that adapter does not support Windows; GitHub's Ubuntu CI runs the required `pnpm cloudflare:check` validation.

During implementation, run the smallest affected test first. Treat GitHub Actions as confirmation of a locally passing commit: push only after `pnpm verify:ci` succeeds, then investigate any failure from its exact job output and add a deterministic regression test before retrying CI. Edge Function source is LF-enforced in `.gitattributes` because Deno's formatter rejects CRLF checkouts. The initial Windows-worker package is outbound-only and validates its control-plane URL as HTTPS; its executable local-operation implementation is delivered in Pass 6.
