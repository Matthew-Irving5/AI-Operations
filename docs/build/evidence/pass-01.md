# Pass 01 evidence

Status: READY_FOR_REVIEW.

## Verified infrastructure

- Local Supabase reset applied all three foundation migrations successfully.
- Local pgTAP RLS suite passed, including a synthetic second-user isolation check and AAL1/AAL2 access checks.
- Staging Supabase migrations `202608020001` through `202608020003` are applied and match the repository history.
- Staging `manager-list` Edge Function version 2 is active with JWT verification enabled.
- Cloudflare account token verified; the private `ai-operations-staging` and `ai-operations-production` R2 buckets exist.
- Workspace format, lint, strict type checks, unit tests, production build, and Playwright Chromium/WebKit smoke tests pass.
- `pnpm audit --audit-level=high` reports no high or critical findings after upgrades to Next.js 16.2.11, Playwright 1.61.1, and Vitest 3.2.6.
- Windows-worker HTTPS-only endpoint test and Ruff checks pass. Pytest cache creation is disabled in local verification because this Windows workspace inherited an inaccessible generated cache directory; CI uses a clean Windows runner.
- Final Cloudflare runtime validation was completed from PR #7 (`pass-01-final-cloudflare-runtime-fix`). The supported OpenNext adapter was updated to 1.20.2, the required Worker self-reference and strict public-fetch bindings were configured, and the staging workflow now waits for deployment propagation before accepting a health result.
- GitHub Actions staging deployment run [30813395507](https://github.com/Matthew-Irving5/AI-Operations/actions/runs/30813395507) completed successfully for commit `d5f6cf4`, including Worker deployment, migration application, and the `/login` smoke test.
- Independent HTTPS verification of `https://ai-operations-staging.ai-operations.workers.dev` confirmed `/login` returns `200`, `/` returns `307` to `/login`, and the expected CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer` headers are present.

## Delivery exception

The repository remains private on GitHub Free at the user's instruction. GitHub Free does not provide the private-repository branch-protection and auto-merge features required by the original pass protocol. The delivery procedure is therefore: complete checks, create the PR, request the user's manual squash merge, then verify `origin/main`. This exception does not relax test, security, or review requirements.
