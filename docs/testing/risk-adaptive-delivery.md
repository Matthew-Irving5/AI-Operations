# Risk-adaptive delivery — canonical operational contract

**Status: policy proposed / agent guidance prepared, NOT activated in GitHub.** Adopted in Linear project P-AI-2 on 2026-11-12. This doc is the concise ticket-to-production decision rule. AI Operations product, security and frontend specifications remain authoritative within their domains.

## What is already active vs planned
- **Active on `main`:** existing strict ruleset 24213001 requiring per-PR staged acceptance; protected production environment and actual workflows. Do not fake checks, bypass branch rules, assume #194 has merged or treat agent-written evidence as approval.
- **Prepared in draft PR #194:** independent fast PR CI, proposed integrated-main staging and protected manual exact-SHA production promotion, improved integration skill. A draft commit does not activate these.
- **Implementation still required:** AI-70/71/97 for safe cutover; AI-72/73/192/194–202 for local isolation, optional browser automation removal, combined merge testing and batching; AI-203–206 for independent risk classification, restricted low-risk auto-release, delivery metrics and immutable ancestor-SHA promotion.
- Until these are independently proven and explicitly enabled, **all production changes use the current protected manual release path.**

## Agent pickup and development
1. Choose one genuinely ready Linear issue (not a tracking parent). A feature may start locally without waiting for unrelated release work. Read named contracts/roles and only relevant specs plus `.agents/skills/ai-operations-integrate/SKILL.md`.
2. One ticket = one Codex conversation, worktree, branch and PR. Claim shared write surfaces before editing. Owner-only writes for migration timeline, generated DB types, auth manifest, root lockfiles, shared contracts, deployment/security workflows. Different functions in a normal file may be developed in parallel.
3. Use separate Supabase state/ports, local Worker builds, fixtures and browser profile for every worktree (AI-200/201 to prove). No production/staging writes or real customer data during local tests.
4. Run scoped deterministic unit/component/contract/SQL/role/Edge/Worker tests, including denied callers and direct/transitive consumers. For a changed UI, Codex **manually drives** a local browser and fixes setup faults locally; no mandatory or scheduled automated browser E2E after AI-192 activation. Never weaken RLS, MFA, cost caps or approvals to pass a fixture.
5. Include short reproducible evidence: paths, interface, actual caller, tests/results, interactive UI walk (or N/A) and observed integration failures. `Done` means merged with proof; **not** staged/released.

## Independently assigned effective risk
Classification is derived from exact changed code **and its transitive capabilities/side effects**, before merge and again before release. Codex may recommend but **cannot approve its own low-risk classification**. AI-203 owns a deterministic, independently reviewed policy; unknown evidence = hold/escalate. A ticket label or LLM opinion is never sufficient.

- **Low:** tightly limited to isolated static presentation/copy or pure local deterministic logic with proven no impact on authorization, sessions, secrets, persistent data, provider privileges, package dependencies, executable side effects, agent tools, Worker/Edge runtime or deployment gates. Still needs fast core/security checks, combined-tree compatibility, exact staged artifact and bounded smoke. Automatic production is **OFF by default** until the separate AI-204 security-approved fast lane is implemented/proven.
- **Medium:** compatible API, non-destructive schema/RPC change, bounded provider/runtime/orchestration. Require cross-boundary contract and caller/RLS tests; stage one relevant real synthetic provider/role journey when only hosted conditions can prove it; protected manual promotion.
- **High:** any auth/MFA/RLS/ACL/secrets, cost gate, irreversible/privileged action, destructive migration, release/CI/security policy, risk-classifier changes, new autonomous authority or unknown impact. Independent human approval plus explicit negative security tests, hosted proof and roll-forward/rollback strategy.
- Do not let an agent alter the classifier, its allowed paths, tests, privileged keys or approval rules to downgrade its own change. No full production secret or deploy permission in developer worktrees.

## Merge admission and releases
1. Proposed merge: test exact PR head on ephemeral current-`main` combined tree (AI-194), run affected consumer/security cases, serialize *actual merge* through one protected admission actor (AI-195). A clean non-overlapping same-file edit needs no rebase. Re-check head/main after any race; a custom coordinator cannot certify out-of-band merges.
2. Stage a **selected immutable merged main SHA** promptly, not automatically each main push and not held for an arbitrary 3–5 PR quota (AI-196). Combine only compatible low-risk changes while no one waits; release medium/high sooner. One shared staging mutation lane; missing schema/Edge/source proof fails closed.
3. Production uses exact repository/SHA/tree/run/attempt artifact and protected deploy credentials. **Initially** an auditable bounded merge freeze prevents main advancing while the current-main requirement is in force (AI-197). AI-206 may remove this only by independently verifying ancestor-SHA compatibility including DB migrations, security fixes and time-of-check/time-of-use safety. Do not silently relax `current main == staged SHA`.
4. Operator can halt releases; staging failures quarantine that candidate. Fix forward or revert via protected PR, produce a **new** staged SHA/evidence; never promote an unrelated later head or reuse expired evidence.
5. **Future low-risk fast lane (AI-204):** allow automated production only with independently approved deterministic low-risk classification, required CI/security + combined proof, exact staged evidence, scoped deploy-only identity, post-release observation, emergency stop and fail-closed negatives. This feature is OFF until explicitly authorised, tested and activated; medium/high stay manually protected.

## Independent umpire / measured effectiveness
AI-205 records per issue: pickup → local green → PR green → merged → staged → production observed, plus queue waits, rebases/redeploys, change failure rate, recovery latency and security gate violations. A faster path wins only if security invariants and negative proofs remain intact. A reviewer-agent opinion does not replace independent policy enforcement or human authorisation for high-risk releases.

## Safe cutover checklist
1. Finish AI-97 staging migration mismatch. Independently prove existing release gate from #194, security statuses and exact SHA validation without touching production.
2. Revise #194 code/docs and scripts to remove mandatory browser E2E and reconcile staged workflow with AI-196 batching. Change protected ruleset 24213001 *only after* equivalent protections are verified. Keep ruleset 20477648.
3. Pilot local two-agent isolation and conflicting merges (AI-202), then controlled three-agent protected merge/staging pilot (AI-193). No broad parallel auto-merge before proof.
4. Validate risk classifier (AI-203) and metrics (AI-205). Enable any opt-in low-risk automatic release only after AI-204's independent human/security sign-off.
5. Production release of a feature is proven by exact deployed SHA plus observation, not ticket Done, hosted PR check alone, or a promise of subsequent verification.
