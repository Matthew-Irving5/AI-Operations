# ADR 0005: Deterministic-first agent rollout

## Status

Accepted for Pass 8.

## Decision

Complete and validate deterministic collection, scheduling, validation, budgets,
provenance, tracing, audit, reports, actions, notifications, feedback, and
failure handling before enabling live OpenAI agents. Synthetic and provider-mock
calls use the same instrumentation path as live calls. The first live test is a
single bounded deterministic call, followed by manager-by-manager promotion.

## Rationale

This makes the $10 provider balance a controlled test resource and ensures every
live cost is attributable before expanding agent coverage.
