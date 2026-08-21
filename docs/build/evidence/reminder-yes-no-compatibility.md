# Reminder Yes/No compatibility evidence

The iOS compatibility boundary deterministically maps exact case-insensitive
Apple `Yes`/`No` strings to booleans only for `reminders:v1` fields
`is_completed`, `is_flagged`, and `has_subtasks`.

Boundary tests cover case-insensitive Yes/No, existing lowercase true/false,
native booleans, unrelated fields and sources, and invalid spellings. The
strict adapter, immutable raw-ingestion flow, and passive safety boundary remain
unchanged.
