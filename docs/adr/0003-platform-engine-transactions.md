# ADR 0003: transactional platform orchestration

## Status

Accepted.

## Decision

Schedule claiming, workflow run creation, queue insertion, and initial trace creation occur in one PostgreSQL security-definer function protected by a transaction-scoped advisory lock. Queue workers lease through a separate `FOR UPDATE SKIP LOCKED` function. Recurring cost reservations are checked and written within the same database transaction.

The Edge Functions are authenticated dispatchers; they do not implement concurrency correctness in application memory.

## Consequences

Concurrent dispatch requests cannot create duplicate runs for the same schedule instant, expired leases are recoverable, and direct browser table writes remain blocked by RLS. This concentrates correctness in migrations and requires pgTAP coverage whenever queue state or budget rules change.
