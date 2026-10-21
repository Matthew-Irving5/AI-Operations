---
name: ai-operations-integrate
description: Reuse the AI Operations architecture and proven integration rules before cross-boundary edits; permanently capture new integration failures when fixed and at ticket Done.
---

# Integrate correctly first (not another test suite)

**Always load for an AI Operations ticket changing DB, Edge, AI-runtime, Workers, provider APIs, orchestration, auth, or deployment.** Load after the normal issue-specific readback; never substitute for it.

1. Identify the **changed paths and their real contracts** (caller, role, input/output schema, consumer, runtime, deployment mechanism). Use Serena/rg to locate their existing implementations; do not design an independent parallel path.
2. Read only the matching sections of [integration rules](references/integration-rules.md), then check the pertinent entries in [failure ledger](references/failure-ledger.md). Refer to the three authoritative product specifications where they govern the work. State in the existing readback one sentence: "Using existing <path/contract>; integration risks: <IDs>." Do not write a second lengthy plan.
3. Reuse the repository's canonical contracts, RPCs, migrations, wrappers, versioning and evidence producers. Before changing an interface, inspect **all direct producers and consumers**, their actual runtime identity/permissions, and the selected ticket's acceptance profile. Avoid introducing adapters or replacement abstractions without a demonstrated requirement.
4. During implementation, obey domain rules below; test only the directly changed boundary. Do not run new universal startup tests. Follow existing targeted proof, verify:changed, CI and ticket-required staging gates.
5. **Immediately after fixing an integration/infra defect:** append or refine one short, generalisable prevention rule and an evidence-linked incident in the reference files _in the same defect commit_. Include symptom, actual invariant/root cause, correct pattern, source issue/commit, and cheapest future detection. Deduplicate rather than append near-identical rules. Do not add an unverified hypothesis as a rule.
6. **Before ticket Done:** explicitly review integration lessons from all errors, update this skill/references for novel findings, or record "integration lessons: no new rule; existing rule [ID] covered" in the Linear completion note. A merged fix without its recurring-prevention rule is unfinished when an integration defect occurred. Keep authoritative specs, security gates and tests intact.
7. On context compaction/subagent handoff, preserve the relevant rule IDs and the exact next action (use ai-operations-handoff). The reference docs—not long conversation history—are the durable memory.

**Scope discipline:** This skill is design/integration guidance, not permission to alter locked auth, production secrets, protected table ACLs, cost ceilings or release evidence. Do not require a full local login/MFA journey unless the ticket actually changes that boundary.
