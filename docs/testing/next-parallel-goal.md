# Independent Codex ticket execution (local-first v2)

**Current policy:** docs/testing/local-first-ticket-contract-v2.md and docs/testing/linear-ticket-template-v2.md. GitHub ruleset 24213001 still enforces legacy strict staging until AI-70/AI-71 are implemented and verified.

## One new Codex conversation per ticket

> Own Linear AI-XX in Matthew-Irving5/AI-Operations. Read its six-section implementation ticket, linked blockers, exact current source and applicable integration skill. The ticket already contains the implementation contract; do not produce a startup readback or repeat planning. Work in an isolated branch/worktree, implement the stated behaviour and execute exactly the listed local tests with real caller roles. Report any proven stale/unsafe instruction, not speculative redesigns. Push one coherent PR with exact SHA and observed test results. Do not bypass existing GitHub gates; do not run unrelated staging or ask for MFA unless the ticket explicitly owns a hosted release boundary. Preserve a compact SHA/tests/blocker/next-command handoff on compaction.

## Parallel-lane rules

- Independent coding conversations, not a coordinator spawning several subagents to work on different tickets.
- Parallel only when blocking Linear dependencies have cleared and shared migrations/files are owned by one ticket.
- Merge independently verified code, once the protected GitHub ruleset and production gate have been migrated as required by AI-70/AI-71.
- If different tickets modify shared contract files or generated types, agree one producer contract first. Consumers link that exact upstream ticket as a blocker.
- Local SQL, Edge and Worker simulations cannot prove real hosted OAuth, Cloudflare network or external provider credentials. Only release-owned tickets perform those verifications.
- Never describe unfinished, unmerged or unauthorised work as complete.
