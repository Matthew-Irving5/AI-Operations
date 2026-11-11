# Local-first engineering and ticket contract v2

Status: TRANSITIONAL. Do not claim that PRs can bypass staging yet. GitHub ruleset 24213001 currently requires strict per-PR staged acceptance, and production promotion depends on it. Both must be safely migrated before this is operational.

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
- UI: component/route tests and changed viewport/layout only. Browser only for changed navigation/interaction, not backend-only work.
- Cloudflare runtime: existing local OpenNext/Miniflare/workerd preview for middleware/cookie/routing compatibility; only use hosted acceptance for non-emulatable Cloudflare/network behaviour.
- Provider: deterministic fixtures and error paths locally; one purpose-bound hosted test only when changing actual OAuth consent, provider permissions or other live behaviour.
- Shared contract/config: affected transitive consumers, role matrix and deployment compatibility. Unknown impact is not permission to skip.
- Entire DB/Edge/Playwright regression is scheduled and manually dispatchable. Not universal per-ticket PR CI.

## Existing commands to reuse

- Corepack-pinned pnpm for all repository commands.
- Scoped unit test: corepack pnpm --filter PACKAGE test, or an exact runner test file.
- Local SQL: corepack pnpm exec supabase status; start isolated stack only when needed; use supabase test db --help to verify exact test-file syntax before invocation.
- Database parity: corepack pnpm environment:drift -- repo-local for schema changes.
- Deno: deno test --no-config EXACT_TEST.
- Cloudflare: existing pnpm qa:worker-preview with specific config and test; avoid Next-dev-only proof for Worker-specific changes.
- CI changed-surface core: corepack pnpm verify:changed --lane=core.
- Keep GitHub CodeQL, dependency review and secret scanning. Avoid blind trust in unverified agent-written evidence.

## Parallel branch and release ownership

- One new Codex conversation per ticket, one branch/worktree/PR per owner. Do not launch a single five-ticket subagent batch.
- Independent branches start from a known main; do not stack PRs unless a genuine technical dependency requires it.
- Do not routinely rebase unrelated PRs when another merges. Loose branch checks are faster but risk unverified combined state; inspect shared contracts and merge conflicts.
- Shared migrations, generated types, release selectors, auth schemas and config require explicit single ownership.
- Staging is one shared mutable environment, not five independent test slots. Only release owner may mutate shared staging/production.
- Preview frontend URL is not proof that its Supabase and provider resources are isolated.
- Never weaken MFA, RLS, hard cost ceilings, repository restrictions or secret handling for speed.

## Required release-system transition

1. Update production deployment to validate and promote an integrated main release without requiring each feature PR to carry a hosted acceptance artifact. Preserve exact SHA/tree, migration/drift, credential/environment and production smoke checks.
2. Dry-run a valid main release and invalid/no-proof release without production mutation. Reject incorrect provenance.
3. In GitHub Rulesets, revise 24213001 to stop requiring the old per-PR staging status and strict base-update policy; retain appropriate fast, independent checks. The connected GitHub app lacks ruleset write access, so this requires an authorised repository-settings action.
4. Test two consecutive independent PR merges under the revised policy. Do not declare this transition complete until verified.
5. Remove historic readback requirements from active ticket generation and CI; preserve historical evidence.

## Regression cadence and learning

- Broad DB, Edge and Playwright suites run twice weekly and on manual dispatch; production release has a controlled separate acceptance.
- For an escaped deterministic defect add a cheap local invariant/regression at the owning boundary. Do not force every future ticket to run an unrelated suite.
- Record first useful error, reproducible command and actual role before remediation.
