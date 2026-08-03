# Pass 02 evidence

Status: READY_FOR_REVIEW.

## Verified locally

- Docker Desktop engine 28.3.2 started successfully.
- `supabase db reset --local` rebuilt the empty local database and applied migration `202608030001_platform_engine.sql`.
- `pnpm test:db` passed all 24 pgTAP/RLS assertions, including the synthetic queue-to-report vertical path, scheduler registration, cancellation, notification leasing, provider reconciliation, MFA-gated pricing updates, and the weekly Systems quality review.
- `pnpm test`, production `pnpm build`, and `pnpm test:e2e` passed. Playwright covers Chromium and WebKit login/MFA flows plus authenticated Operations, spend, trace, approval, report-feedback, and iPhone platform surfaces against a local Supabase stack.
- `pnpm audit --audit-level=high` reported no high or critical dependency findings; the remaining findings are one low and one moderate advisory.
- Gitleaks 8.30.1 scanned 19 commits and reported no secrets.

## Implemented platform contracts

- Scheduler dispatch uses a transaction advisory lock, `FOR UPDATE SKIP LOCKED`, idempotent workflow runs, queue insertion, and trace creation.
- `pg_cron` registers the dispatcher every five minutes; the migration and pgTAP suite verify that durable trigger.
- The job queue supports leases, expiry reclaim, bounded attempts, jittered retry, dead-letter handling, and database-level deduplication keys.
- Recurring budget reservations enforce the configured hard cap inside a database transaction.
- The official OpenAI TypeScript SDK sends Responses API requests with strict `text.format` JSON Schema output and `store: false`; malformed output is rejected by Zod.
- Webhook ingestion uses HMAC-SHA-256 signature verification, constant-time comparison, and provider event deduplication.
- Notification dispatch has an allowlisted-recipient boundary, a Gmail API implementation, and provider-mock deduplication test.
- Queued notifications use lease ownership, bounded retry with jitter, and a dead-letter state, so concurrent dispatchers cannot resend a claimed message.
- The protected dashboard uses RLS-backed, Zod-validated report, approval, trace, feedback, schedule, operations, and spend queries with empty/error states; reports include workflow-specific feedback submission.
- E2E bootstraps a complete synthetic local Auth identity and generates a short-lived AAL2 session only from the runtime local JWT secret. No service-role key, local secret, or session is committed.
- Background `response.completed` events settle a linked Systems response and trace the report completion after HMAC verification and provider-event deduplication.
- Provider-reported usage can be reconciled against recorded call cost, with mismatches retained for investigation; price versions require fresh MFA.
- The weekly Systems workflow aggregates negative feedback categories into a validated quality-review report section and records included feedback for the review cycle.
- A synthetic Systems run is exercised in pgTAP from queue lease through validated report creation and successful job completion.

## Remaining pass work

Remaining completion work is the final Pass 2 completion audit, PR delivery, and documented manual merge exception where GitHub Free cannot enable auto-merge for this private repository.
