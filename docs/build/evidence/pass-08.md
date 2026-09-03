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
- Local contract evidence: empty-database reset followed by `supabase test db` passes 79 pgTAP/RLS assertions, including all eight deterministic manager completions, recurring and on-demand AI reservations, response-ID recording, versioned actual-cost calculation, synthetic settlement, and a retained/resumable reconciliation failure. `deno check` and four focused Deno strict-output/redaction/webhook-signature tests pass. No live provider request has been made.
- Staging callback evidence: Pass 8 migrations and `ai-execute`/`openai-webhook` are deployed to the active staging project. A fresh locally generated Standard Webhooks signed `response.completed` fixture was accepted with HTTP 200; the deployed `ai-execute` boundary returned HTTP 401 without an internal credential. No provider model call, web search, background job, or action was performed.
- Background completion implementation: staged `openai-webhook` now retrieves a matched completed response only after signature verification and event deduplication, validates output only against the call's redacted declared evidence IDs, prices usage through the database, settles the reservation, and creates a validated report plus proposed-only actions. A second signed unmatched staging fixture returned HTTP 200 after this deployment. No live response was retrieved or generated.
- Instrumentation gate: `202608050001_ai_instrumentation_gate.sql` requires an enabled model and prompt version, reserves budget before submission, persists a redacted trace and provider usage, then settles actual usage with a validation result. `202608050002_ai_cost_precision.sql` preserves sub-cent provider costs at six decimal places. The pgTAP mock exercises this lifecycle without an OpenAI call.
- Manager dispatch: `202608050003_manager_workflow_dispatch.sql` removes the legacy synthetic helper names from the operational surface. The shared queue contract now dispatches to the appropriate deterministic manager executor and appends idempotent common audit/trace evidence.
- Static validation after the change: Prettier check, Deno format/lint/check for every Edge Function, and the pnpm workspace unit suite passed.
- CI gates: Edge Function contract tests now run in the Edge Functions workflow and the local CI-equivalent script; CodeQL and dependency-review workflows are versioned with the repository. Server-side UI routes now validate cookie-backed Supabase users before forwarding a bearer token to a privileged Edge Function.
- Worker completion: completed Digital Estate scans now pass through the common report, notification, trace, and immutable-audit contract. The staging migration and `worker-submit-result` function are deployed; an unauthenticated staging request returned HTTP 401.
- Reconciliation retry safety: temporary webhook retrieval or pricing failures retain the reservation and record a redacted `reconciliation_failed` state. A signed duplicate completion webhook can retry reconciliation without creating another reservation. The migration and webhook function are deployed to staging; a newly generated signed unmatched fixture returned HTTP 200.
- Synthetic manager evaluation: 16 manager-evaluation assertions cover Finance, Career, Personal, Health, Systems, Digital Estate, Travel, and Procurement required facts/evidence, forbidden claims, and per-case cost ceilings without calling a provider.
- PR gate status: PR #21 was rebased after the repository became public and GitHub's generated CodeQL Advanced workflow merged as PR #22. It is ready for review and passes CI, database/RLS, Edge Deno, E2E, performance, security, Windows-worker, dependency-review, and CodeQL analysis for Actions, TypeScript/JavaScript, and Python. No check has been bypassed.
- Local deterministic validation: `supabase db reset --local` applied every migration from an empty database; `pnpm test:db` passed all 79 pgTAP/RLS tests; `pnpm verify` passed; `pnpm test:e2e` passed all 22 Chromium and WebKit/iPhone browser checks including accessibility; Windows-worker pytest passed 9 tests; and `pnpm security` completed without a secret-scanning failure. The k6 login smoke completed 718 requests at up to 10 virtual users with 0% failures and 3.22 ms p95 response time (threshold under 1 second).
- No provider call has been made.

## Universal mobile transport evidence

- ADR 0007 freezes the passive, versioned snapshot contract and explicitly separates ingestion from execution.
- Migration `202608200001_universal_mobile_ingestion.sql` creates the RLS-protected immutable snapshot, source, raw-record, attachment-reservation, and adapter-provenance tables. Browser roles have no direct raw-payload access.
- `mobile-snapshot-ingest` validates the v1 envelope with Zod, authenticates the existing revocable device token, canonicalises offset-aware timestamps and JSON hashes server-side, partially accepts malformed record sets, and uses a security-definer RPC for atomic persistence and replay protection.
- Staging database lint completed with no schema warnings. A temporary synthetic staging device submitted an envelope containing empty `sources`, `records`, and `attachments`: the first request returned HTTP 202 with `status: accepted` and zero received records; an identical replay returned HTTP 200 with `replay: true`. The synthetic receipt, device, application identity, and Auth identity were removed immediately after validation.
- An unauthenticated staging request returned HTTP 401 with `device_token_missing`. No personal payload, plaintext device token, AI call, notification, schedule, workflow, or external action was created.
- Production Shortcut verification on 2026-09-03 confirmed that the corrected Health collector submitted Steps, Heart Rate, Sleep, Active Calories, Walking + Running Distance, and Weight with zero raw-record rejections. Migration `20260903195228_normalize_active_calories.sql` treats Apple's `Active Calories` label as canonical active energy for future records and safely reprocesses matching previously deferred normalizations without mutating raw receipts.
