# AI Operations — Linear ticket execution contract

Contract version: **1** (15 October 2026). This is the standard section for every open engineering ticket and the source template for new tickets. Keep ticket-specific objectives, dependencies, acceptance outcomes, live-only evidence and forbidden scope above it. Do not copy the entire AGENTS.md into Linear.

## Execution contract · v1

- **Start:** Verify the approved repository, load the applicable `AGENTS.md`, read this Linear issue and linked dependency contracts, then run `corepack pnpm qa:doctor --fix`.
- **Readback before editing:** Summarise this ticket in the **parent Codex conversation** and create `docs/build/ticket-readbacks/AI-XX.md` using `node infrastructure/scripts/ticket-readback.mjs init AI-XX`. Replace the scaffold with the actual issue goal, 1–3 acceptance outcomes, dependency/interface risks, implementation boundaries, narrow local test plan, genuinely hosted-only proof and prerequisites, and subagent handoffs or blockers. Verify with `node infrastructure/scripts/ticket-readback.mjs check AI-XX`. **Do not begin editing application code until the readback exists.**
- **Implement/debug:** One owning agent is accountable through merge. Reproduce failures narrowly; classify them and inspect evidence before patching. After two unsupported hypotheses, reset the diagnosis. Every escaped deterministic defect gets a cheaper regression and earlier diagnostic.
- **Before staging:** Run `corepack pnpm verify:changed`; check relevant role/column/RPC permissions, fixtures and state, and perform offline evidence producer→schema→consumer dry runs for the chosen acceptance profile. For attended hosted MFA, verify the user's browser handoff is available before waiting. Use staging only for boundaries localhost cannot faithfully prove.
- **Delegate:** Give each subagent the relevant issue requirements, readback, repo rules, narrow scope and evidence to return; never assume it inherited the parent conversation.
- **Finish:** Keep the same PR owner through required CI, ticket-specific hosted proof (if declared), merge, bounded production smoke and recorded lessons. Never loosen safety/auth/QA assertions just to pass.

## Readback standard

The readback is **a short reasoning checkpoint**, not a paraphrase of the issue. Each section should reference real functions, dependencies, tests or acceptance evidence when known. The parent agent should raise a blocker if an essential contract is genuinely unknown. No secrets or personal operational data. A valid document is mandatory for AI-numbered PR branches in CI; the checker validates completeness of the sections, **not the truth of their claims**.

For a new Linear ticket, append the versioned execution section above verbatim or link to it **plus** a compact local synopsis and an explicit readback requirement. When the standard changes, update this source, AGENTS.md and the active-ticket section together; do not silently diverge.

## Pre-staging evidence policy

The current release pipeline already validates exact PR candidate, required CI status, deployment identity and provenance. This new readback check is run in PR CI and therefore adds a required input to that existing gate; it is not a second deployment workflow. The owning agent must ensure the selected local tests and offline acceptance/evidence contracts pass before requesting a live slot. A README assertion that a test passed is not test evidence. Hosted credentials, MFA, actual service permissions and deployment drift still require their designated safe live checks.
