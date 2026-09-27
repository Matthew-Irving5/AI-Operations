# External Runtime Prerequisite Manifest

**Audit date:** 2026-09-27  
**Ticket:** AI-65  
**Repository:** `Matthew-Irving5/AI-Operations`  
**Manifest status:** Partial pass; provider hard limits and a production runtime credential remain unresolved.

This redacted manifest records provider identities and verification results for later implementation sessions. Secret values, API keys, passwords, tokens, user IDs, and personal payloads are intentionally excluded. Presence of a GitHub secret name does not prove that its value is correct or belongs to the expected environment.

## Verification summary

| Boundary                                                       | Result                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repository and deployment flow                          | Pass                                             | Owner is `Matthew-Irving5`. After AI-6 merged, staging run `36311239207` and production run `36311382811` both succeeded on main at `3208ecc`. Earlier staging/production runs also succeeded on `a5e069d`.                                                                                                                                                                                                                                                                                                                                                                |
| GitHub environment names                                       | Pass for name presence                           | `staging` and `production` environments exist. Workflow-referenced secret and variable names are present in their respective environments. Values were not read.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Supabase project separation and health                         | Pass                                             | Production `AI-Operations-Production` ref `epmgvknrydadzitzupzx` and staging `AI-Operations-Staging` ref `jqtssfrfocnibffdkqch` are distinct and `ACTIVE_HEALTHY` in `eu-west-2`. Unauthenticated `/auth/v1/health` requests returned 401, so no health conclusion was drawn from those requests.                                                                                                                                                                                                                                                                          |
| Supabase schema and Edge Function inventory                    | Pass                                             | Both projects have the same 57 applied migrations as the repository and all 39 expected Edge Functions active. Deployed function hashes and `verify_jwt` settings match across the two projects. Public table-name inventories also match.                                                                                                                                                                                                                                                                                                                                 |
| Staging AAL2 Edge Function authorization                       | Fix pending staging deployment                   | MFA TOTP verification returned HTTP 200, the audit event was recorded for the allowlisted account, and the app profile is allowed. A bounded staging launch still returned 403 before a run was created. The deployed function called `getAuthenticatorAssuranceLevel()` without its JWT; Supabase's JavaScript reference says Edge Functions with no stored Auth session must pass the JWT. The fix validates that same JWT with Auth before checking its signed `aal`/`sub` claims; targeted Deno tests and all Edge-function CI checks pass. No provider call was made. |
| Cloudflare Worker/environment mapping                          | Pass                                             | Latest deployed versions (staging 138 at 10:03 UTC; production 114 at 10:05 UTC) confirm the matching `APP_ENV`, origin, self-reference, and R2 bucket binding in each environment. Secret binding values were not read.                                                                                                                                                                                                                                                                                                                                                   |
| Cloudflare origins                                             | Pass                                             | `https://ai-operations-staging.ai-operations.workers.dev/login` and `https://ai-operations-production.ai-operations.workers.dev/login` each returned HTTP 200. Their configured Worker origins are distinct.                                                                                                                                                                                                                                                                                                                                                               |
| R2 privacy and direct canary access                            | Pass                                             | Both buckets are in `WEUR`, with managed `r2.dev` access disabled and no custom domains. A synthetic object was put, read, SHA-256 checked, deleted, and confirmed absent in each bucket using the authenticated Cloudflare API credential loaded into process environment only. No personal data was used.                                                                                                                                                                                                                                                                |
| R2 application/archive path                                    | Not exercised                                    | The deployed finance archive route is a one-way archive write. It requires authenticated user-bound finance import metadata and has no safe delete operation. Using it for a disposable canary would create retained finance archive data, so the direct isolated R2 API canary was used instead.                                                                                                                                                                                                                                                                          |
| OpenAI staging/production credentials and isolation             | Pass for credential health and environment mapping; provider hard limits pending | Environment-specific staging and production keys each returned HTTP 200 from read-only `GET /v1/models`; `gpt-5.6-luna` is available in both. SHA-256 comparisons performed in process confirm each local key matches the corresponding Supabase Edge Function secret digest, and staging/prod secrets differ. No key or digest was printed or recorded. No inference was run. |
| Supabase Edge Function runtime credentials                      | Partial pass; production worker credential missing | Both projects have their expected Supabase URL, app origin, finance archive gateway, and OpenAI secret mapping. Staging has `WORKER_SECRET`; production does not. Deployed `job-worker` and `job-complete` require this secret for authenticated requests. No value was read or changed. The production worker credential must be configured with its future caller before these runtime functions can operate. |
| Cross-environment fail-closed validation                       | Follow-up needed                                 | Deployed Worker marker/origin/bucket values are correctly separated. Application URL validation checks only URL shape; `google-oauth-callback` allows both environment hosts in one static allowlist and does not bind the configured callback/origin to the expected Supabase project. AI-9 tracks automated configuration-drift checks and is in Backlog; its current acceptance has not been confirmed to cover this boundary. Request that AI-9 acceptance explicitly prove swapped staging/production callback, origin, and project-ref values fail closed.           |
| Recurring cost policy                                          | Code contract pass; provider backstop unverified | The repository defaults monthly recurring target/hard cap to `$5.00` / `$10.00`; reservation logic creates the monthly row on first use and rejects reservations above the hard cap. Both live model catalogs contain the three enabled models (`gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`). Neither project currently has a monthly budget row, so no live spend history exists. OpenAI project hard limits remain unverified.                                                                                                                                        |

## GitHub Actions configuration names

The following names are present in the corresponding GitHub environment, matching the deployment workflows:

**Staging secrets:**

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `FINANCE_ARCHIVE_GATEWAY_SECRET`
- `PERSONAL_READ_TOKEN`
- `STAGING_SUPABASE_ACCESS_TOKEN`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_DB_PASSWORD`
- `STAGING_SUPABASE_PROJECT_REF`
- `STAGING_SUPABASE_URL`

**Staging variable:**

- `FINANCE_ARCHIVE_GATEWAY_URL`

**Production secrets:**

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `FINANCE_ARCHIVE_GATEWAY_SECRET`
- `PERSONAL_READ_TOKEN`
- `PRODUCTION_SUPABASE_ACCESS_TOKEN`
- `PRODUCTION_SUPABASE_ANON_KEY`
- `PRODUCTION_SUPABASE_DB_PASSWORD`
- `PRODUCTION_SUPABASE_PROJECT_REF`
- `PRODUCTION_SUPABASE_URL`

**Production variable:**

- `FINANCE_ARCHIVE_GATEWAY_URL`

The existing GitHub deployment flows were left unchanged. The source uses environment-prefixed Supabase names and distinct Worker configuration files. A successful deployment and name inventory do not reveal or independently prove the secret values map to the expected project refs.

## Canary record

Each canary used an unpredictable key under `codex-ai-65-canary/` and the same fixed synthetic text payload. The API token and account ID were loaded from the operator's root `.env` into the PowerShell process; neither was printed, written to a file, or copied to this manifest.

| Bucket                     | PUT      | GET      | SHA-256 | DELETE   | Follow-up GET |
| -------------------------- | -------- | -------- | ------- | -------- | ------------- |
| `ai-operations-staging`    | HTTP 200 | HTTP 200 | Match   | HTTP 200 | HTTP 404      |
| `ai-operations-production` | HTTP 200 | HTTP 200 | Match   | HTTP 200 | HTTP 404      |

The scoped Cloudflare connector's write attempt returned authentication error `10000`; the process-environment credential was then used for the successful, isolated API canaries. No canary remains in either bucket. This proves direct R2 API access, but does not exercise the application's finance archive route.

## Operator actions required before `LIVE E2E SIGN-OFF: PASS`

1. In the OpenAI Platform, inspect the staging and production projects' monthly hard spend limits. Confirm each is compatible with the application policy (recurring target `$5`, recurring hard cap `$10`). Report only each limit and pass/fail; never share a key. No inference is needed.
2. Configure the missing production Supabase `WORKER_SECRET` when the production worker caller is ready, using the secret handoff defined by that caller's implementation. Do not reuse the staging value. No production worker caller exists yet, so do not invent or deploy a value solely for this audit.
3. Confirm the existing AI-9 configuration-drift acceptance covers fail-closed rejection of swapped staging/production callback, origin, and Supabase project-ref values. The current application validation does not bind those values together; this is a separate follow-up and is not claimed as passed here.

## Staging AAL2 verification (2026-09-27)

- PR #131's bearer-JWT AAL2 fix passed CI and deployed to staging from `codex/ai65-fix-edge-aal-validation` (deployment workflow run `36337281336`, successful). It was not merged to `main` as part of staging verification.
- After the operator completed staging sign-in and MFA, the authenticated `/api/workflows/launch` request returned HTTP 201 for synthetic run `a977c889-319c-4845-89b8-3316cb2bb86e`. This proves the AAL2-gated launch boundary now accepts the elevated session.
- The run is only queued: staging `workflow_runs.status=queued`; its `workflow_execute` job is queued with attempt count 0 and no lease. The matching correlation ID `4cf78701-e378-46ff-9b3c-eff60818d527` has an `on_demand_run_queued` trace. There is no budget reservation, `ai_calls` row, validated report, or execution-step evidence; no Responses API call or actual provider cost is claimed.
- The internal `ai-execute` call, trace, and cost reconciliation are owned by AI-15 and are not an AI-65 completion gate. It was not invoked directly because that would bypass the canonical queue lease/orchestration path. The observed HTTP 201 proves AAL2 launch acceptance only; it does not claim a model call or cost.

The AI-65 ticket remains In Progress until the OpenAI project hard limits are confirmed and the production worker credential prerequisite is resolved or explicitly accepted as deferred to its caller implementation. Do not dispatch or merge a production deployment as part of this staging verification. R2 direct canaries and infrastructure inventories already passed. AI-9 tracks broader automated configuration-drift enforcement; confirm or extend its acceptance for the callback/origin/project-ref binding described above.
