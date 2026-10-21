# Agent-native Codex workflow (AI Operations)

Last checked: 15 October 2026. Codex default model was reset from an unsupported GPT-6 Sol override to the verified GPT-5.6 Terra for ChatGPT authentication. Linear remains the work queue, GitHub the PR/release authority, and this repository's tests the source of verification. External skills are tools, **not** authority to alter product scope, skip tests, disable security or change branch protection.

## Installed on the authorized Windows Codex host

- Ponytail Codex plugin 5.2.0: simplify diffs and favour existing abstractions; never replace feature completeness with less code.
- Selected P-Stack 0.9.30 Codex-port skills (`how`, `blast-radius`, `fix-ci`, `deslop`, `babysit`) are installed at the user skill scope. The full plugin was removed because it crowded the Codex skill-description budget; the existing Superpowers skill covers TDD. No `arena`/`swarm` by default.
- Serena 2.0.0 MCP server: semantically navigate symbols and references. The Codex Desktop app may need to explicitly activate the AI Operations checkout at conversation start. Fallback: built-in language tooling, `rg`, TypeScript and `repo:map`.
- Context7 Codex plugin 1.0.2: consult current third-party library docs **only** when necessary. An OAuth login or network access may be required; never treat installed as proof of authenticated readiness. Fallback: official docs and installed type definitions.
- Existing Superpowers plugin: available, but don't combine whole-methodology workflows with P-Stack. Existing QA, release and auth controls remain authoritative.

These are per-user Codex tools on one machine. They do **not** automatically configure Codex Cloud or unattended jobs on an independent host. To use cloud-run agents, provision safe infrastructure and verify environment parity separately. No new subscription or always-running Symphony daemon was enabled.

## A low-friction ticket sequence

1. **Read and state the contract.** Check the approved repo, current Linear issue, linked blockers, current code and `AGENTS.md`; run `corepack pnpm qa:doctor --fix`. Before editing, post a short _ticket-specific_ parent-conversation readback, and use the versioned readback artifact when its CI gate applies.
2. **Integrate using established contracts.** For cross-boundary tickets load `ai-operations-integrate`: map actual callers/roles, producers, consumers and the existing repository patterns before editing. Review only the matching rule IDs and incidents; after any confirmed integration fix update the living rule + incident in the same commit, and reconcile lessons at Done. For unfamiliar code use `ai-operations-investigate`, Serena or Context7 as applicable.
3. **Implement and diagnose narrowly.** Use `ai-operations-debug` for broken behaviour. Fix producer/consumer contracts and add the smallest earlier regression test. Run `corepack pnpm verify:changed`.
4. **Ship deliberately.** Use `ai-operations-ship` for PR and CI ownership through required staged acceptance and permitted auto-merge. Never fake an acceptance status.
5. **Resume accurately.** Use `ai-operations-handoff` at compaction or external wait; store the exact head SHA and next command in Linear. Don't start another competing agent on the same branch.

Skill entrypoints are in `.agents/skills`. They are chosen **selectively** by task. Do not add another ticket tracker, background watchdog or full QA suite.

## Suggested first message to Codex

> Work on AI-XX in Matthew-Irving5/AI-Operations. Load the applicable AGENTS.md, its Linear ticket and dependencies, and the AI Operations agent-native skills. Confirm available P-Stack/Ponytail, Serena and Context7 capabilities without blocking if a nonessential plugin is unavailable. Use the issue-specific readback and qa:doctor before editing, then own implementation, focused tests, verify:changed, PR CI, ticket-required hosted acceptance and merge. Use the smallest causal fix, preserve existing exact-candidate security and release gates, and record an exact resumable handoff for external waits. Work only in an isolated branch/worktree; don't disturb any currently active coding branch.

## Operational note

The only verified evidence of a plugin at installation time is CLI installation and manifest registration; a live Codex agent can still fail due to authentication, per-project activation or environment setup. The first session should report connected tool status in its readback and use safe fallbacks if needed. P-Stack's Codex port and third-party hooks are not part of the repository's trusted release pipeline.
