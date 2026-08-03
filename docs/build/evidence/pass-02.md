# Pass 02 evidence

Status: IN_PROGRESS.

## Verified locally

- Docker Desktop engine 28.3.2 started successfully.
- `supabase db reset --local` rebuilt the empty local database and applied migration `202608030001_platform_engine.sql`.
- `pnpm test:db` passed all 16 pgTAP/RLS assertions, including the synthetic queue-to-report vertical path.
- `pnpm test`, production `pnpm build`, and `pnpm test:e2e` passed. Playwright covered Chromium and WebKit login/MFA flows.
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
- A synthetic Systems run is exercised in pgTAP from queue lease through validated report creation and successful job completion.

## Remaining pass work

The production workflow executor, reports/approvals/feedback mutation endpoints, dashboards backed by authenticated queries, full Systems workflow execution, provider reconciliation, eval harness, complete browser coverage, runbooks, and PR delivery remain in scope before this evidence can be marked complete.
