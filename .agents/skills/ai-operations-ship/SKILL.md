---
name: ai-operations-ship
description: Ship one AI Operations ticket under verified risk-adaptive delivery, protected merge and exact-SHA release policies.
---

# Ship one ticket

1. Read the exact Linear issue and `docs/testing/risk-adaptive-delivery.md`. **Check activation state:** proposed CI/merge/batch/auto-prod features cannot be used until their implementation tickets and GitHub cutover are verified. Existing branch protection remains mandatory.
2. Verify actual affected producer/consumer, caller role and contract using `ai-operations-integrate`. Claim shared files and worktree resources. One ticket/conversation/branch/PR; do not reuse a global Supabase database or Worker build root.
3. Run scoped deterministic positive/negative tests and security controls; manually navigate changed local UI with Codex, fix fixtures and retry locally. No required scheduled browser automation after AI-192 cutover. Record exact commands and result; never invent hosted proof.
4. Assign effective risk from changed code **plus transitive permissions/effects**. Codex may propose but **cannot approve** low-risk classification. Unknown = high/hold. Low is only isolated static UI/copy/pure logic with no privilege/external changes. Medium changes API/schema/provider integration. High includes auth/ACL/RLS/MFA/secrets, privileged actions, cost caps, destructive changes, CI/release policy. AI-203 will enforce independent classification; until it is activated, no automatic production route.
5. Open the PR with exact head SHA and implementation evidence; check independent fast core/security statuses when active. On merge, use AI-194/195 current-main synthetic combined proof + single protected merger *once implemented*. No rebase purely because `main` advanced if Git cleanly merges; resolve real conflicts and rerun affected consumers. Never merge past active ruleset 24213001, fake a status or expose deploy keys.
6. Implementation Done means **merged and verified**, not released. Staging and production use approved exact repo/SHA/tree/run/attempt evidence, migrations/Edge/drift, protected environments and bounded smoke. AI-196 will batch staging selected `main` SHAs; AI-197's initial bounded merge pause is temporary; AI-206 must prove safe immutable ancestor-SHA release before the pause can be removed.
7. **Current production policy is protected MANUAL promotion for all risk levels.** AI-204 may later permit a narrowly proven, independently approved low-risk automated fast lane; medium/high stay manual, high needs independent human security approval. Do not activate on ticket label, agent assertion or local mock tests.
8. Link PR/merge and release evidence in Linear; mark only proven status. Record integration prevention rules for confirmed defects; AI-205 will measure pickup-to-verified-production lead time, waiting and security violations.
