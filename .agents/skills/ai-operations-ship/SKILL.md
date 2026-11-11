---
name: ai-operations-ship
description: Complete a focused local-first AI Operations ticket through an independent PR and real required checks.
---
# Ship one ticket
1. Use exact acceptance and testing commands from the ticket; verify changed behaviour and direct consumers locally.
2. Report actual commands and results on the PR with exact HEAD SHA. Never pretend that a test or hosted provider check ran.
3. Open one independent PR based on main. Inspect required GitHub security/core checks. A PR with a code conflict or shared schema incompatibility must be fixed; unrelated merged PRs do not justify blanket rebasing.
4. Preserve the existing strict staged-acceptance ruleset until formally migrated. Do not fake staging statuses or bypass production provenance.
5. When v2 merge policy is active, mark Linear Done on verified merge; a dedicated release ticket owns hosted, MFA, and production checks when unavoidable.
6. Report final merged SHA or blocker precisely; record prevention rules only when a real integration defect was discovered.
