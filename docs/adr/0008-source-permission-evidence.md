# ADR 0008: Source permission evidence and provider-native cursors

## Status

Accepted.

## Decision

The Data Sources surface is the operator verification point for connected-account identity,
granted scopes, selected Google Calendar and Drive sources, per-dataset freshness, recovery, and
revocation. Google Gmail, Calendar, and Drive maintain independent provider-native cursors and
freshness evidence. Apple Health, Calendar, Reminders, Location, and Screen Time freshness is
derived from successfully accepted source manifests from the fixed passive Shortcut transport.

Google Calendar and Drive ingestion is opt-in: an empty selection imports nothing. Gmail read is
passive and Gmail send remains limited to the configured notification recipient. Connection
revocation requires a single-use `connection_revoke` MFA action gate. Local credentials are
disabled even when provider revocation cannot be confirmed, and the operator receives explicit
rotation guidance.

## Consequences

- A database `fresh` label alone cannot satisfy onboarding; its timestamp must remain within the
  configured cadence and every required active dataset must have evidence.
- Provider failures remain isolated to their dataset and cannot make another dataset appear fresh.
- The Apple Shortcut schema, endpoint, token placement, and collected categories do not change.
- Source permission acknowledgement remains operator-owned but is disabled until the application
  can prove the prerequisite evidence.
