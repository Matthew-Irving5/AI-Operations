---
name: ai-operations-handoff
description: Preserve exact continuation identity and evidence through compaction and handoffs; no duplicate planning/readbacks.
---
# Executable continuation
Record ticket, PR, exact HEAD SHA, verified commands/results, changed files, unverified checks, blocker, required human action and exact next command in the current ticket/PR evidence. No secrets or copied transcripts.
On resume compare actual branch head with recorded SHA, reload current ticket and code, and use only relevant rule IDs. An agent must not infer success from a previous message.
