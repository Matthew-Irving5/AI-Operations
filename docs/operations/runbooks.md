# Operations runbooks

Keep schedules disabled until production onboarding completes. On an authentication or source failure, revoke the connection, inspect the redacted audit trail, rotate affected credentials, and reconnect only after MFA. Never bypass RLS or use service credentials in a browser.

## Queue failure

Inspect the redacted trace by correlation ID. A leased job automatically becomes eligible again when its lease expires. Failed jobs are requeued with exponential backoff and jitter until the maximum attempts is reached; then the job is dead-lettered and the run is marked failed. Do not edit queue rows directly.

## Scheduler recovery

`pg_cron` invokes `dispatch_due_schedules()` every five minutes. The dispatcher takes a transaction advisory lock and inserts runs with schedule-time idempotency keys, so a recovery invocation through the authenticated scheduler function is safe while the normal job exists. Verify the `ai-operations-scheduler-dispatch-5m` cron job and inspect redacted `run_queued` trace events before manually invoking recovery.

## Approval decision

Approval decisions require current AAL2 and a TOTP verification recorded within the previous five minutes. If fresh MFA is missing, reauthenticate through the application and retry; do not use a service role or direct table update to make a decision.

## Webhook incident

Reject unsigned or malformed webhooks. OpenAI webhook delivery is HMAC-SHA-256 verified before event persistence, and provider event IDs are deduplicated. Investigate the audit/trace trail before replaying a provider event.
