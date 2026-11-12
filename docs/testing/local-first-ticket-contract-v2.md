# Local-first engineering and ticket contract v2

Status: TRANSITIONAL. **See [risk-adaptive-delivery.md](risk-adaptive-delivery.md) for the current controlling pickup-to-production policy and the difference between proposed vs active controls.** Draft PR #194 is NOT on main; GitHub ruleset 24213001 still requires strict per-PR staged acceptance. Change it only after independently verifying replacement controls.

## Completion and merge

- Implementation verified: ticket-owned local tests pass on the exact PR revision, including negative, permission and affected-consumer cases. Put commands and observed results in PR description.
- Mergeable: local proof complete, required lightweight CI and security checks green, no unresolved conflicts or missing migration/contract compatibility.
- Linear Done: implementation merged to main and exact evidence linked. A separate release acceptance ticket owns hosted tests, staging, MFA and production smoke when genuinely required. Done does not imply Released.
- Released: an integrated main revision passes release-specific staged and production checks. Never forge statuses or silently skip mandatory acceptance.
- Default ticket is one focused independently deliverable implementation, not a day-spanning subsystem. No arbitrary time cutoff.

## Ticket format

Use exactly six sections: title, Problem, Acceptance, Key files, Supporting info, Testing. Provide actual contracts, role identities, paths, error cases and test commands; identify proposed future paths as such. No implementation readback, re-planning ritual or universal startup suite. Raise a blocker only for proven stale/incorrect/unsafe instructions.

## Test selection — locally first

- Pure logic: focused unit tests only. No Docker/browser/hosted service.
- Backend API: route/schema tests and direct consumer contract, denied caller when relevant. No UI unless changed.
- Postgres/RPC/RLS: isolated Supabase, real caller role, targeted pgTAP and expected denied operations, generated types/drift if schema changes. Never assume service_role bypasses explicit GRANTs. Read only the required table/RPC rows from docs/testing/platform-live-role-catalog-20261111.json and prove the relevant permission through local pgTAP.
- Edge: scoped Deno tests, exact auth manifest entry, function import map, and deployment dependency closure.
- UI: component/route tests and a Codex-led **interactive local browser walkthrough** for changed navigation, layout or interaction. Local fixture setup faults are fixed in the same worktree. Automated Playwright is optional diagnostics and is not a required/scheduled browser test after AI-192 cutover. No browser for backend-only work.
- Cloudflare runtime: existing local OpenNext/Miniflare/workerd preview for middleware/cookie/routing compatibility; only use hosted acceptance for non-emulatable Cloudflare/network behaviour.
- Provider: deterministic fixtures and error paths locally; one purpose-bound hosted test only when changing actual OAuth consent, provider permissions or other live behaviour.
- Shared contract/config: affected transitive consumers, role matrix and deployment compatibility. Unknown impact is not permission to skip.
- Broader **code-level** database/Edge/contract regression may remain scheduled or manually dispatchable. Retire required/scheduled **browser automation** after AI-192 proves replacement coverage; it is not a per-ticket PR CI gate.

## Existing commands to reuse

- Corepack-pinned pnpm for all repository commands.
- Scoped unit test: corepack pnpm --filter PACKAGE test, or an exact runner test file.
- Local SQL: corepack pnpm exec supabase status; start isolated stack only when needed; use supabase test db --help to verify exact test-file syntax before invocation.
- Database parity: corepack pnpm environment:drift -- repo-local for schema changes.
- Deno: deno test --no-config EXACT_TEST.
- Cloudflare: existing pnpm qa:worker-preview with specific config and test; avoid Next-dev-only proof for Worker-specific changes.
- PR CI lightweight lane: corepack pnpm verify:changed --lane=pr. This checks select integration/type contracts, never launches browsers or Docker. Formatting and broad tests are local ticket requirements where relevant. Broader core is available locally with --lane=core.
- Keep GitHub CodeQL, dependency review and secret scanning. Avoid blind trust in unverified agent-written evidence.

## Parallel branch and release ownership

- One new Codex conversation per ticket, one branch/worktree/PR per owner. Do not launch a single five-ticket subagent batch.
- Independent branches start from a known main; do not stack PRs unless a genuine technical dependency requires it.
- Do not routinely rebase unrelated PRs when another merges. Loose branch checks are faster but risk unverified combined state; inspect shared contracts and merge conflicts.
- Shared migrations, generated types, release selectors, auth schemas and config require explicit single ownership.
- Staging is one shared mutable environment, not five independent test slots. Only release owner may mutate shared staging/production. AI-196 will replace every-main-push heavy staging with selected immutable-main-SHA deployment; until implemented do not pretend it is active.
- Preview frontend URL is not proof that its Supabase and provider resources are isolated.
- Never weaken MFA, RLS, hard cost ceilings, repository restrictions or secret handling for speed.

## Required release-system transition

1. Use the new integrated-main staged artifact and manual-only production promotion from PR #194. Preserve exact SHA/tree/run attempt, migration/drift, credential/environment and production smoke checks. Execute and verify the entire producer/validator/consumer flow before activation.
2. Dry-run a valid main release and invalid/no-proof release without production mutation. Reject incorrect provenance.
3. In GitHub Rulesets, revise 24213001 to stop requiring the old per-PR staging status and strict base-update policy; retain appropriate fast, independent checks. The connected GitHub app lacks ruleset write access, so this requires an authorised repository-settings action.
4. Test two consecutive independent PR merges under the revised policy. Do not declare this transition complete until verified.
5. Remove historic readback requirements from active ticket generation and CI; preserve historical evidence.

## Regression cadence and learning

- Broad impacted DB/Edge and code contract suites may run on a separate cadence. Automated browser suites are not a mandatory or scheduled acceptance gate after AI-192 implementation. A Codex/operator-led attended hosted walkthrough verifies real external integrations at release.
- For an escaped deterministic defect add a cheap local invariant/regression at the owning boundary. Do not force every future ticket to run an unrelated suite.
- Record first useful error, reproducible command and actual role before remediation.


## Risk-adaptive speed/security delivery

- `docs/testing/risk-adaptive-delivery.md` is the controlling operational classification, merge admission and release contract. Do not treat a ticket label or an implementing Codex's opinion as independent low-risk approval.
- **Low:** tightly scoped static UI/copy/pure local logic with demonstrably no changed privileges/side effects. Medium: API/provider/compatible schema/runtime integration. High: authorization/RLS/MFA/secrets, autonomous privileged actions, CI/security/release controls, destructive migration or unknown impact. Actual changes and transitive dependencies decide, not ticket labels.
- All categories retain scoped deterministic and security tests, exact combined-tree/merging and staged artifact provenance. Medium/high use protected manual production approval; high also needs independent human security approval.
- **No auto-prod today:** low-risk fast-lane activation requires independently reviewed classifier AI-203 and constrained production policy AI-204. Old branch/release rules remain in force until cutover proof.
- AI-194/195 own safe combined-tree protected merge admission; AI-196 selected-main batch staging; AI-197 initial bounded merge pause; AI-206 optional immutable ancestor-release with strict schema/security compatibility proof. Never abandon current-main protection merely to accelerate a merge.
- AI-205 tracks ticket pickup → verified production, not only PR merge.
