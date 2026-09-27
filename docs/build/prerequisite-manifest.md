# External Runtime Prerequisite Manifest

**Audit date:** 2026-09-27  
**Ticket:** AI-65  
**Repository:** `Matthew-Irving5/AI-Operations`  
**Manifest status:** Partial pass; see operator actions below.

This redacted manifest records provider identities and verification results for later implementation sessions. Secret values, API keys, passwords, tokens, user IDs, and personal payloads are intentionally excluded. Presence of a GitHub secret name does not prove that its value is correct or belongs to the expected environment.

## Verification summary

| Boundary                                                       | Result                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repository and deployment flow                          | Pass                                             | Owner is `Matthew-Irving5`. After AI-6 merged, staging run `36311239207` and production run `36311382811` both succeeded on main at `3208ecc`. Earlier staging/production runs also succeeded on `a5e069d`.                                                                                                                                                                                                                                                                                                                                                      |
| GitHub environment names                                       | Pass for name presence                           | `staging` and `production` environments exist. Workflow-referenced secret and variable names are present in their respective environments. Values were not read.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Supabase project separation and health                         | Pass                                             | Production `AI-Operations-Production` ref `epmgvknrydadzitzupzx` and staging `AI-Operations-Staging` ref `jqtssfrfocnibffdkqch` are distinct and `ACTIVE_HEALTHY` in `eu-west-2`. Unauthenticated `/auth/v1/health` requests returned 401, so no health conclusion was drawn from those requests.                                                                                                                                                                                                                                                                |
| Supabase schema and Edge Function inventory                    | Pass                                             | Both projects have the same 57 applied migrations as the repository and all 39 expected Edge Functions active. Deployed function hashes and `verify_jwt` settings match across the two projects. Public table-name inventories also match.                                                                                                                                                                                                                                                                                                                       |
| Cloudflare Worker/environment mapping                          | Pass                                             | Latest deployed versions (staging 138 at 10:03 UTC; production 114 at 10:05 UTC) confirm the matching `APP_ENV`, origin, self-reference, and R2 bucket binding in each environment. Secret binding values were not read.                                                                                                                                                                                                                                                                                                                                         |
| Cloudflare origins                                             | Pass                                             | `https://ai-operations-staging.ai-operations.workers.dev/login` and `https://ai-operations-production.ai-operations.workers.dev/login` each returned HTTP 200. Their configured Worker origins are distinct.                                                                                                                                                                                                                                                                                                                                                     |
| R2 privacy and direct canary access                            | Pass                                             | Both buckets are in `WEUR`, with managed `r2.dev` access disabled and no custom domains. A synthetic object was put, read, SHA-256 checked, deleted, and confirmed absent in each bucket using the authenticated Cloudflare API credential loaded into process environment only. No personal data was used.                                                                                                                                                                                                                                                      |
| R2 application/archive path                                    | Not exercised                                    | The deployed finance archive route is a one-way archive write. It requires authenticated user-bound finance import metadata and has no safe delete operation. Using it for a disposable canary would create retained finance archive data, so the direct isolated R2 API canary was used instead.                                                                                                                                                                                                                                                                |
| OpenAI generic local credential                                | Partial pass                                     | The root `.env` contains the generic `OPENAI_API_KEY` name. A read-only `GET /v1/models` request returned HTTP 200 and three models. The key's project/environment identity was not established, so this does not verify staging or production credentials.                                                                                                                                                                                                                                                                                                      |
| OpenAI staging/production credentials and provider hard limits | Blocked on operator verification                 | Deployment workflows do not configure `OPENAI_API_KEY`; the Edge Functions read it from each Supabase project's runtime secrets. The available Supabase connector can list functions and database objects but does not provide a safe secret-name inventory. Separate staging/production key presence, project ownership, provider-side hard limits, and a bounded runtime Responses call remain unverified.                                                                                                                                                     |
| Cross-environment fail-closed validation                       | Follow-up needed                                 | Deployed Worker marker/origin/bucket values are correctly separated. Application URL validation checks only URL shape; `google-oauth-callback` allows both environment hosts in one static allowlist and does not bind the configured callback/origin to the expected Supabase project. AI-9 tracks automated configuration-drift checks and is in Backlog; its current acceptance has not been confirmed to cover this boundary. Request that AI-9 acceptance explicitly prove swapped staging/production callback, origin, and project-ref values fail closed. |
| Recurring cost policy                                          | Code contract pass; provider backstop unverified | The repository defaults monthly recurring target/hard cap to `$5.00` / `$10.00`; reservation logic creates the monthly row on first use and rejects reservations above the hard cap. Both live model catalogs contain the three enabled models (`gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`). Neither project currently has a monthly budget row, so no live spend history exists. OpenAI project hard limits remain unverified.                                                                                                                              |

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

1. In the Supabase dashboard, inspect Edge Function secrets for `AI-Operations-Staging` and `AI-Operations-Production`. Confirm each has its own `OPENAI_API_KEY`, and that each key belongs to the intended, separate OpenAI project. Do not paste or screenshot key values. If either is missing or mis-scoped, set it in that project's Edge Function secrets using the project's own key.
2. In the corresponding OpenAI project settings, confirm each project's hard monthly spend limit is compatible with the application policy (recurring target `$5`, recurring hard cap `$10`). Report only pass/fail and the configured limit, never the key.
3. After confirming staging configuration and that the target/cap is active, run one low-cost, deterministic request through the actual staging runtime path using the enabled `gpt-5.6-luna` model, with no web search or autonomous action and an aggregate bound below `$2`. Confirm the same correlation ID has a validated response, trace, and reserved/reconciled cost within the cap. Stop on any discrepancy.
4. Confirm the GitHub `STAGING_SUPABASE_PROJECT_REF` / `STAGING_SUPABASE_URL` values identify the staging project and the equivalent production names identify production. The expected non-secret refs are `jqtssfrfocnibffdkqch` (staging) and `epmgvknrydadzitzupzx` (production). Do not post secret values.
5. Once the staging production-like flow succeeds, use the live deployment smoke path and retain only status, deployment SHA, and redacted trace/cost evidence. Production OpenAI health verification may use a no-cost credential health request; do not make an unnecessary production inference.

The AI-65 ticket remains In Progress until the staging Responses request, cost/trace evidence, and any required production credential health check are verified and recorded. R2 direct canaries and infrastructure inventories already passed. AI-9 tracks broader automated configuration-drift enforcement; confirm or extend its acceptance for the callback/origin/project-ref binding described above.
