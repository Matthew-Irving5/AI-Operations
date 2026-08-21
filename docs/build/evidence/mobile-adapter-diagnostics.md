# Mobile adapter diagnostics evidence

The authenticated mobile snapshot response now includes deterministic
field-level `issues` for `invalid_reminders_v1_payload`. Diagnostics expose the
expected type and received JSON type for every mismatch in one response.

Only bounded Reminder boolean and priority values may be echoed. Tests prove
that title, notes, and URL contents are excluded. The immutable raw record,
adapter outcome, passive-ingestion boundary, and lack of AI or external side
effects remain unchanged.
