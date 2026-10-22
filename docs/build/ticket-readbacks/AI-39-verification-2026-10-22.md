# AI-39 verification checkpoint — 2026-10-22

Candidate under verification: `4db21e7f04aaef15d8cd1489283a07f7871a9009` (PR #176, `codex/ai-39-requirement-first-procurement`). Repository owner verified as `Matthew-Irving5`; dependencies AI-15, AI-16 and AI-19 are Done.

## Seven completed proof groups — passed

1. `corepack pnpm qa:doctor --fix` — passed. Node 24.18.0, pnpm 10.18.2, Docker 28.3.2, Supabase CLI 2.118, required local images, Chromium/WebKit, Deno 2.9.4 and Python 3.13.5 were ready.
2. Procurement acceptance producer/schema and live-auth harness tests — 14/14 passed with `corepack pnpm exec tsx --test infrastructure/scripts/procurement-live-acceptance.test.ts infrastructure/scripts/live-auth-acceptance-harness.test.ts`.
3. Procurement Edge contract — 2/2 passed with `corepack pnpm exec deno test --config supabase/functions/deno.json supabase/functions/openai-webhook/procurement_test.ts`.
4. Infrastructure contracts — 97/97 passed, including the release-gate dispatch harness, strict Procurement envelope and AI-39 profile routing.
5. Workspace formatting, lint, typecheck and package tests — passed. Lint emitted warnings in unrelated files and no errors.
6. Web production build — passed; `/procurement` was included in the generated route set.
7. Edge and isolated browser proofs — Edge format/lint/typecheck and 67/67 Edge contract tests passed; isolated Chromium E2E passed 18/18 using a separate test project.

Hosted PR evidence at the same SHA: CI run `39805395108`, CodeQL run `39805395556`, Dependency review run `39805395414` and Security run `39805395474` were green when checked. The PR remains open and unmerged; hosted checks do not replace the current local audit or DB proof.

## Two remaining release gates — blocked, not waived

1. **DB/backfill proof:** `verify:changed` attempted `supabase db reset --local`, but Docker reported that `/supabase_db_ai-operations-local` was already owned by container `428fd4…`. No reset completed and no container was removed. The parent currently owns the shared DB lease; rerun the narrow DB proof only after the parent grants it.
2. **High/critical dependency audit:** the AI-39 candidate still pins `next` and `eslint-config-next` at 16.3.8. The current audit flags Next.js advisories GHSA-2464-fhr4-w9w (critical), GHSA-p3m5-59mp-jv5r (high), and GHSA-673q-mjm6-r5xr (critical; documented in Vercel's 16.4.1 release). Verified patched minimum: 16.4.1. A separate minimal patch is prepared as local commit `ff10c2a5c9bf190b56aacc53cea0add1a7553ba7` on `codex/next-security-16-4-1`; `pnpm audit --audit-level=high` passes after it (two moderate findings remain), and the web production build passes. This patch is not yet integrated into PR #176.

Advisories: [GHSA-2464-fhr4-w9w](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9w), [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr).

## Staging and next action

The real staging Procurement journey has not run. It needs the shared release gate to consume the strict `procurement-acceptance` evidence profile and an operator-visible authenticated staging browser. Do not dispatch before the profile is supported and the parent grants the staging queue slot. Exact runner command after those gates: `node --env-file-if-exists=.env --import tsx infrastructure/scripts/run-live-e2e.ts procurement-acceptance`, with `LIVE_E2E_MANUAL_MFA=true` and exact candidate, deployment and staging metadata. Ask the parent for the operator MFA checkpoint only when the headed browser challenge is visible.

No new integration defect was confirmed in this checkpoint. The initial Deno invocation without `--config supabase/functions/deno.json` failed to resolve workspace aliases; this is already covered by integration rule `EDGE-01`, and the configured rerun passed. No integration-skill change is warranted for that command-selection error.
