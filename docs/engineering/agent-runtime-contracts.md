# Canonical agent runtime contracts

Contract version 1 is shared by `@ai-operations/contracts` and the service-only
tables created by `20261009102612_canonical_agent_conversation_handoff_contracts.sql`.
The Agent Spec owns agent identity, conversation, authority, handoff, execution,
Planner Attention, and Inter-Agent lifecycle semantics. The Build Spec owns the
database, access, provenance, and delivery boundaries.

## Canonical entity ownership

- `managers` remains the identity source; `manager_capabilities` stores its
  versioned capability matrix.
- `workflow_runs` and `run_steps` remain the run and stage records. Their shared
  `run_status` gains `waiting_for_dependency`.
- `actions` remains the user-facing proposal object. `approvals` remains the
  approval decision record. `execution_requests` represents executable
  commands, and append-only `execution_receipts` records their acknowledgements
  and outcomes.
- `trace_events` and `audit_events` remain the observability and audit stores.
- `source_objects` and `research_sources` remain source stores. Versioned
  `evidence_references` link their records and typed domain evidence to
  conversations, actions, runs, reports, and execution records.
- Gmail and Web Chat use one `conversations` record. Messages are append-only;
  `conversation_handoffs` and append-only handoff events retain ownership
  changes. Attachments reference the existing source object rather than copying
  its content or storage key.

## State contracts

| Entity              | Contract states                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation        | `open → closed → open`, with `archived` terminal                                                                                       |
| Handoff             | `requested → accepted \| rejected \| cancelled`                                                                                        |
| Execution request   | `received → routed → queued → running → waiting_for_dependency → succeeded \| failed \| cancelled`, with the specified resumable edges |
| Planner Attention   | `new → queued_for_planner → incorporated \| sent_immediately \| dismissed \| expired \| resolved`                                      |
| Inter-Agent request | `requested → accepted → running → waiting_for_dependency → completed \| rejected \| failed \| cancelled`                               |

The database transition trigger matches the TypeScript transition helpers and
fills lifecycle timestamps at the state boundary. Message and receipt history
is append-only. A successful handoff changes the conversation's current owner
in the same transaction.

## Access and data handling

New runtime tables enable RLS, carry an explicit restrictive deny policy for
`anon` and `authenticated`, and grant data access to `service_role` only. Edge
Functions remain the authenticated API boundary. Message bodies may be stored as
text or a protected reference and retain a SHA-256 hash; attachment content
remains in `source_objects`. Contracts and audit payloads must contain only
redacted data appropriate to their classification.

The focused local proof is `supabase/tests/agent_runtime_contracts.sql`. It
checks canonical capability coverage, service-only access, message authority,
idempotency, ownership integrity, append-only messages, handoff ownership
history, terminal timestamps, and failure-receipt detail. The broader
`access_contracts.sql` proof checks RLS and privilege posture across every
public table.
