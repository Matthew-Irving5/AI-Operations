# Pass 08 evidence — completion and controlled agent activation

This file is completed during Pass 8. It must contain implementation scope,
migrations, security decisions, test commands/results, CI links, Playwright and
performance artifacts, traceability links, live-agent cost evidence, and the
operator acceptance record.

## Required evidence sections

- deterministic workflow and manager execution;
- database/API/RLS/AAL2 contracts;
- integrations, worker, archive, backup, and restore;
- frontend and accessibility coverage;
- CI, security, performance, and AI evaluation results;
- instrumentation proof with agents disabled;
- bounded live-agent smoke test and aggregate spend;
- manager-by-manager agent rollout evidence;
- operator-owned onboarding and production acceptance;
- unresolved blockers, if any, using the three-turn blocked-goal protocol.

## In-progress evidence

- Repository ownership and Pass 7: verified `Matthew-Irving5/AI-Operations`; PR #20 is merged at `c10f382` with its required checks successful.
- Baseline: `corepack pnpm verify` passed before Pass 8 changes.
- Deterministic execution: `202608040001_deterministic_workflow_completion.sql` adds one idempotent, audited, trace-producing completion contract for all managers while AI is disabled. `job-worker` now uses this contract rather than selecting a manager-specific synthetic SQL helper.
- Webhook hardening: OpenAI completion events now leave calls in `completed_pending_reconciliation`; a webhook alone cannot manufacture a report before response validation, usage reconciliation, reservation settlement, and trace persistence.
- AI execution reconciliation: `ai-execute` is an internal-only Edge Function (constant-time worker-secret or service-role comparison). It reserves before submission, routes through an approved persisted prompt/model, calls Responses with strict Structured Outputs and no tools/background mode, records the provider response ID, derives cost from versioned database pricing, settles usage through the same budget contract, and only then persists a validated report, sections, proposed actions, and trace.
- Local contract evidence: empty-database reset followed by `supabase test db` passes 69 pgTAP/RLS assertions, including recurring and on-demand AI reservations, response-ID recording, versioned actual-cost calculation, and synthetic settlement. `deno check` and two focused Deno strict-output/redaction tests pass. No live provider request has been made.
- Staging callback evidence: Pass 8 migrations and `ai-execute`/`openai-webhook` are deployed to the active staging project. A fresh locally generated Standard Webhooks signed `response.completed` fixture was accepted with HTTP 200; the deployed `ai-execute` boundary returned HTTP 401 without an internal credential. No provider model call, web search, background job, or action was performed.
- Background completion implementation: staged `openai-webhook` now retrieves a matched completed response only after signature verification and event deduplication, validates output only against the call's redacted declared evidence IDs, prices usage through the database, settles the reservation, and creates a validated report plus proposed-only actions. A second signed unmatched staging fixture returned HTTP 200 after this deployment. No live response was retrieved or generated.
- Instrumentation gate: `202608050001_ai_instrumentation_gate.sql` requires an enabled model and prompt version, reserves budget before submission, persists a redacted trace and provider usage, then settles actual usage with a validation result. `202608050002_ai_cost_precision.sql` preserves sub-cent provider costs at six decimal places. The pgTAP mock exercises this lifecycle without an OpenAI call.
- Manager dispatch: `202608050003_manager_workflow_dispatch.sql` removes the legacy synthetic helper names from the operational surface. The shared queue contract now dispatches to the appropriate deterministic manager executor and appends idempotent common audit/trace evidence.
- Static validation after the change: Prettier check, Deno format/lint/check for every Edge Function, and the pnpm workspace unit suite passed.
- Local deterministic validation: `supabase db reset --local` applied every migration from an empty database; `pnpm test:db` passed all 60 pgTAP/RLS tests; `pnpm test:e2e` passed Chromium and WebKit browser coverage, including iPhone layouts and accessibility checks.
- No provider call has been made.
