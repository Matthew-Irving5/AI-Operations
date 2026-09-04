# Source app permissions checklist evidence

## Implemented controls

- Exact Google account and scope validation at OAuth completion, with server-side AAL2 enforcement.
- Provider-native Gmail history, Calendar sync-token, and Drive change-token synchronization with
  bounded pagination, deletion handling, invalid-cursor recovery, and per-dataset freshness.
- Explicit Google Calendar and Drive source selection; an empty selection imports nothing.
- Single-use MFA-gated Google and Apple revocation, local credential disablement, immutable audit,
  and safe provider-revocation recovery guidance.
- Apple Reminder-list allowlisting and freshness evidence for the five fixed Shortcut sources.
- Evidence-backed Settings readiness plus Data Sources loading, empty, error, stale,
  reauthentication, and permission-denied states.

## Validation required before operator acknowledgement

- Full CI, migration/RLS pgTAP, Deno, build, and Playwright checks pass.
- Staging deployment and provider fixtures pass before production promotion.
- Production Google sync creates current Gmail, Calendar, and Drive cursor/freshness evidence for
  the saved selections.
- Production Apple device remains active and the five fixed source freshness rows are current.
- No raw personal values or credentials appear in source-permission evidence or logs.
