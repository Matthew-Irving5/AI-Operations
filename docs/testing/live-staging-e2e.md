# Live staging E2E

The hosted acceptance suite runs from the Luna/Codex session on the operator desktop so the real staging MFA prompt remains visible and user-controlled. Playwright opens headed Chromium, automates only safe navigation and optional password entry, and waits on the real redirect to `/overview`. The test then continues in that same authenticated browser context. A copy of the valid session is held in memory only and used for a WebKit check; it is never written to disk or attached as an artifact.

The suite exercises one bounded Travel request with a `$0.01` hard cap and zero searches, idempotent replay, the normal cancellation UI, persisted run/budget/queue/trace evidence, the AAL2 probe, unauthenticated rejection, and cleanup of explicitly marked queued fixtures. It crosses the deployed Worker, authenticated app routes, staging Edge Functions, database RPCs and staging database. It does not call a model, search provider or travel provider.

## Local operator session

The runner reads `.env` values into its process environment only. It uses `STAGING_PROJECT_URL` and `STAGING_SERVICE_ROLE_KEY` for staging-only identity and persisted-row reads; no value is printed or copied into artifacts. The default staging Worker URL and Supabase project ref are fixed in `live-e2e-safety.ts`. A configured `LIVE_E2E_EMAIL` and `LIVE_E2E_PASSWORD` may automate password entry; otherwise sign in directly in the visible browser. No MFA seed, code, factor ID or MFA-specific CI secret is accepted or needed.

In PowerShell, run:

```powershell
$env:LIVE_E2E_MANUAL_MFA = 'true'
pnpm test:e2e:live
Remove-Item Env:LIVE_E2E_MANUAL_MFA
```

If the managed worktree has no `.env` file, pass the operator checkout's existing file to Node without copying it into the worktree:

```powershell
$env:LIVE_E2E_MANUAL_MFA = 'true'
node '--env-file-if-exists=C:\path\to\operator-checkout\.env' --import tsx infrastructure/scripts/run-live-e2e.ts suite
Remove-Item Env:LIVE_E2E_MANUAL_MFA
```

Complete the real challenge in the open staging Chromium browser. The suite resumes automatically after the app reaches Overview, then reuses that session for its remaining Chromium checks and the in-memory WebKit acceptance. The visible user action never asks for an MFA code or seed in chat. If the authentication session expires before the WebKit check, the suite fails and can be rerun; it does not create a replacement session by bypassing MFA.

The preflight command reads the single enabled staging app profile and discovers only queued workflow runs with the harness purpose marker and idempotency prefix. It rejects ambiguous identity, unknown workflow definition, more than eight fixtures, non-staging URL/project bindings, and any unmarked record before attempting reset. Reset calls use the authenticated `/api/workflows/cancel` route and verify the resulting database state.

## Network-free safety checks

```powershell
pnpm test:e2e:live:mismatch
pnpm --filter @ai-operations/web exec vitest run lib/live-e2e-safety.test.ts
```

These checks prove a non-staging origin/project is rejected before network access and that the runner's config contains no automated MFA inputs. The GitHub `Live staging E2E safety guard` workflow runs only these network-free checks; a hosted headless runner cannot receive manual MFA and must not claim the user's live sign-off.

Failure output contains a redacted screenshot and a bounded trace of API paths/statuses and safe validation diagnostics. Screenshots mask editable fields, app navigation/content regions, and the account email. The runner never records request bodies, auth cookies, session state, entered codes, seeds or service-role values.
