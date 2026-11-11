---
name: ai-operations-integrate
description: Exact, low-context AI Operations integration and permission rules for Supabase, Cloudflare Workers, GitHub releases and provider boundaries.
---

# Integration rules — use only changed boundary

**Read the six-section Linear ticket first.** Inspect named producer, caller, consumer and active migrations. This page is the short default; load a historical incident ONLY when its code or symptom matches.

## Supabase: real caller, not assumed permissions

- **Prod:** `epmgvknrydadzitzupzx`. **Staging:** `jqtssfrfocnibffdkqch`. Both Postgres 17 (eu-west-2). The catalog is an observation from 2026-11-11, **not** authority for later changes.
- **Lookup one object:** `node infrastructure/scripts/platform-role-lookup.mjs production table workflow_runs`; change `production` to `staging`, `table` to `rpc`, and name as needed. The dated catalog has 121 table/view entries and 150 RPC signatures per environment. Never paste the whole JSON into context.
- **Direct table grants are NOT universal:** `service_role` cannot `INSERT workflow_runs` or `job_queue`, nor `SELECT actions` or `trace_events`. Use the **existing restricted RPC** / approved event writer and check `docs/security/rpc-execution-matrix.md`. `anon` cannot directly SELECT these protected tables. RLS and column grants still apply independently.
- **Edge auth:** use `supabase/functions/_shared/auth-manifest.json` *and* `supabase/config.toml`. `verify_jwt=true` only validates the token; check owner, allowlist and required AAL2/MFA gate. `verify_jwt=false` can mean internal worker secret, device token, signed webhook or manual validated JWT: **never assume public access**.
- **RPC:** check exact signature and actual `EXECUTE` for intended role. New `SECURITY DEFINER` needs fixed `search_path`, scoped ownership validation, explicit `REVOKE EXECUTE FROM PUBLIC/anon/authenticated` followed by only intentional `GRANT`; do not create a definer function merely to overcome a denied write. Some existing public token-ingest RPCs are deliberate: test token scopes before changing them.
- **RLS:** owner predicates must be checked for `SELECT` and `UPDATE` (`USING` + `WITH CHECK`), including wrong owner. Never use editable `user_metadata` for authorisation or expose service secrets to Next/browser.
- **Schema:** add forward migration with a collision-free version, never rewrite deployed history; update `packages/db/src/database.types.ts` and associated callers. Before touching AI-39 model pricing: **staging has migration 20261106134300 absent from prod/main**, and a different `add_model_pricing` signature.
- **Local proof:** isolated `corepack pnpm exec supabase test db <specific-file>` (confirm CLI flags with `--help`); run `supabase/tests/local_required_role_permissions.sql` for sampled grants, `rpc_security.sql` for callable RPCs, and `corepack pnpm environment:drift -- repo-local` for schema changes. Simulated DB ≠ hosted credentials.

## Cloudflare: configured bindings vs live permissions

- Worker source is `apps/web` OpenNext; `wrangler.jsonc` = staging `ai-operations-staging`, `wrangler.production.jsonc` = production `ai-operations-production`. Both use `WORKER_SELF_REFERENCE`, `ASSETS`, and private `ARCHIVE_BUCKET` R2 bound to matching environment bucket.
- Use `APP_ENV` and `PUBLIC_APP_ORIGIN` from the actual config; Cloudflare API credentials and archive gateway secret are protected GitHub environment secrets. **Names in workflows prove required configuration, not that a secret is populated or effective.**
- For changed Worker route, cookie, self-binding or R2 handler, run local `workerd`/OpenNext preview with local-only bindings; `next dev` alone is not Cloudflare runtime proof. No remote binding or production R2 write during tests.
- Wrangler pinned to `4.148.0`. Worker Previews are *not configured in this repo*. Do not invent isolated Supabase/R2/secret resources: even a Preview can point at shared resources. Real hosted OAuth, Cloudflare Access, provider API scopes and deployment permissions require a dedicated release-owned check.
- Supabase Edge deployment uses `supabase/config.toml`, auth manifest and per-function import-map closure. Run focused `deno test --no-config <file>` and existing Edge import-map check. Do not assume local Deno config equals hosted bundle resolution.

## GitHub / release: fast merge, protected promotion

- PRs: one branch/conversation/ticket, only direct affected local tests, plus `corepack pnpm verify:changed --lane=pr` independent critical contracts. Do **not** run broad staging for feature tickets.
- Ruleset `20477648` protects branch creation/deletion/force push and PR route; preserve it. Ruleset `24213001` **currently** requires strict `AI Operations / Staging capability acceptance`; repository settings must remove that requirement and make fast status checks loose **only after** PR #194's integrated-main release gate is verified.
- Staging deploys merged `main` sequentially; not each feature PR. Production is manual operator promotion of successful **exact main SHA/tree/run/attempt** staging evidence, with protected environment, migration/source drift and bounded smoke. GitHub connector cannot change rulesets; never fake a status or bypass environment approval.
- CI workflow token permissions differ per job; use explicit `permissions:` and protected environment secrets. Validate release SHA, repo and runner origin before any mutating provider command. Never expose tokens or use outside `Matthew-Irving5` repositories.

## When an integration failure happens

- First evidence: actual caller identity → target role/GRANT → exact RPC/schema → deployment manifest/bindings → direct consumer. Run one narrow negative and positive reproduction.
- Look up only relevant rule ID in `references/integration-rules.md`; consult matching incident in `references/failure-ledger.md` if still needed. No exhaustive reading.
- After fixing a *confirmed* recurring integration fault: add a targeted failing-then-passing test/invariant, then append or de-duplicate one concise rule/incident. Never add broad tests or grant new rights just to turn CI green.
