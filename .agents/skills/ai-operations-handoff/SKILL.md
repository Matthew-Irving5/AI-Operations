---
name: ai-operations-handoff
description: Preserve a short factual continuation record when Codex compacts, delegates, waits on CI, or hands off an AI Operations issue.
---

# Compact, executable continuation

On pause, append to the existing issue/evidence (no separate tracking system): issue, branch, exact head SHA/PR, verified work, unverified work, earliest useful failing error, reproduction command, blocker, required operator action and one exact next command. No secrets or copied transcripts.
On resume compare head SHA with live GitHub and reload the Linear issue plus readback and the relevant `ai-operations-integrate` rule IDs; never rely solely on compressed conversation history. Recalculate commands if the branch moved. Give subagents only their bounded task, relevant contractual sources and required evidence to return. Do not claim success while required CI/live gates are pending.
