# ADR 0012: Read-only GitHub evidence sync

## Status

Accepted

## Context

Career Operations needs repository evidence from the single approved GitHub owner,
`Matthew-Irving5`, without granting the application write or outreach capability. The
previous implementation had an Edge Function but no user-facing invocation, no deploy-time
token path, and no server evidence gate for the onboarding checklist.

## Decision

Use a fine-grained GitHub token with repository metadata read permission only. The token is
stored as the masked `PERSONAL_READ_TOKEN` GitHub Actions environment secret and copied to the
runtime `GITHUB_PERSONAL_READ_TOKEN` Supabase Edge Function secret during deployment. GitHub
environment naming is intentionally separate from the provider-facing runtime name because
GitHub reserves the `GITHUB_` prefix for its own variables. The token never enters browser state,
Postgres, or audit payloads. Career invokes the sync through an authenticated same-origin route,
which requires a user-bound one-time `github_sync` fresh-MFA gate before calling GitHub.

The Edge Function validates the provider response, hard-allowlists owner and repository URLs,
persists only bounded repository evidence, records a redacted audit event, and returns a stable
stage/code/status/request-ID diagnostic for every failure boundary. Settings can record
`github_connection` only after recent server-verified evidence exists.

## Consequences

- A missing token fails closed with `github_connection_unavailable`; deployment remains usable for
  the rest of the platform while the operator provisions the optional Career credential.
- Invalid or over-privileged owner responses are rejected before persistence.
- Every manual sync is visibly MFA-gated and rate-limited.
- Evidence becomes stale after 24 hours for onboarding readiness, so the checklist represents a
  recent successful provider boundary rather than an old manual acknowledgement.
