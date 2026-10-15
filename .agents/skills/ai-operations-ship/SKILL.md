---
name: ai-operations-ship
description: Ship an AI Operations Linear issue through its existing PR, CI, exact-candidate staging and production smoke requirements without bypassing gates.
---

# Own a ticket through proof and merge

1. Identify the ticket-specific local, CI, genuinely hosted-only and production acceptance requirements; avoid universal live E2E.
2. Run focused checks and corepack pnpm verify:changed; dry-run evidence producer/validator/consumer and fixtures before staging where relevant.
3. Open one PR, inspect required GitHub Actions on exact head SHA, and fix failures by reproducing their narrow failing command. Do not forge statuses.
4. Use existing deploy-staging.yml candidate/acceptance workflow and staging lease. Auth MFA remains human-owned; check headed browser availability before timers.
5. Preserve branch protection. Enable auto-merge only where authorized; record exact resume action for external wait.
6. Document actual merge SHA, tests, bounded production smoke and new regressions in Linear before Done.
   Skip extra multi-agent reviews when existing local E2E and CI already prove the capability.
