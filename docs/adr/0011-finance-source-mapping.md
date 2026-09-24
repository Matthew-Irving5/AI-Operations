# ADR 0011: Finance source mapping and controlled import

## Decision

Finance configuration is managed through the authenticated `finance-control`
Edge Function. The browser may provide an account label, institution, account
type, currency, category names, and either a controlled CSV source or an
approved read-only Google Sheet identifier; it never receives or stores bank
credentials. The function requires the allowlisted account and a fresh AAL2
session, validates every field, and writes only the mapping records needed by
the finance control plane.

Statement import is archive-first. `finance-import` validates the account and
CSV at the boundary, computes a SHA-256 content identity, archives the exact
bytes through the private gateway, indexes the source object, and only then
persists the statement and transactions. A repeated content hash returns an
explicit `finance_statement_replay` response and never creates duplicate
inventory. Amounts are parsed into integer minor units, never binary floating
point. Close-period readiness requires opening and closing balances and an
exact reconciliation of the imported transactions.

The `finance_mapping` checklist item is server-evidence-gated. It can only be
completed after the server verifies an active account, active categories, a
parsed statement with transactions, and a ready, reconciled close period. Each
failure reports a stable code, stage, HTTP status, request ID, safe detail, and
remediation. Finance writes use a named one-time MFA gate and an in-page
challenge, so the form and raw CSV remain only in React memory while MFA runs;
credentials and secrets are never logged or persisted in browser state.

## Consequences

The Finance page provides an explicit mapping form, controlled import form,
reconciliation result, replay result, and exact boundary diagnostics. A
malformed amount, archive failure, persistence failure, or missing evidence is
actionable without guessing which hop failed. The operator must supply one
harmless controlled fixture and verify the reconciled close before the
checklist item can be acknowledged.
