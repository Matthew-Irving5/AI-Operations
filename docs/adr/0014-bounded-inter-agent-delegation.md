# ADR 0014: Bounded inter-agent delegation

## Status

Accepted for the AI-17 runtime.

## Decision

An inter-agent request must move between distinct managers and may not revisit a
manager already present in its delegation path. A delegation chain is limited to
four requests. Direct user-to-specialist runs remain valid and do not require a
Planner hop.

The idempotency key is a SHA-256 fingerprint of the user, source run/message,
source and destination managers, normalized objective, required output contract,
and deduplicated evidence references. Retrying the same request returns the
existing request/run/result; a new initiating run produces a new request key.

## Rationale

The Agent Spec requires durable requests and forbids hidden recursive model
calls, but does not define a numeric depth. Four requests allow Planner-to-
specialist work plus bounded follow-up while giving every persistence boundary
one deterministic stop condition. Persisted route/depth checks must repeat the
same rule so a caller cannot bypass the in-memory policy.
