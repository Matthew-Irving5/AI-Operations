# ADR 0004: one signed manifest per reversible local action

## Status

Accepted, 2026-08-03.

## Decision

An approved organisation plan is expanded into one short-lived Ed25519-signed manifest for each action. The worker verifies and records each manifest independently in its local SQLite replay store.

## Consequences

This makes replay detection, expiry, changed-file protection, and audit attribution unambiguous. It also ensures a failed action cannot accidentally cause the remaining plan to execute. Batch progress is represented by the plan and per-manifest result records rather than an opaque remote command.
