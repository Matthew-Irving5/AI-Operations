# AGENTS.md â€” AI Operations

## Current delivery policy (supersedes older QA/merge/release instructions)

**For a new AI Operations ticket, first read `docs/testing/codex-ticket-entrypoint.md`, then the exact current Linear issue and `docs/testing/risk-adaptive-delivery.md` before selecting tests, merging or deploying.** It is the concise operational contract for parallel Codex execution, independent effective-risk classification, manual local UI walkthroughs, current-main synthetic merge admission and exact-SHA promotion. Root product/security specs still govern architecture and safety. A contradictory older ticket, skill or scheduled-Playwright statement does not authorise a weaker gate.

**Activation is gated by LIVE evidence, not this document's date.** As observed on 12 November 2026, ruleset `24213001` still required old per-PR staging and PR #194 was draft. At EACH new ticket, inspect current `main`, actual repository rulesets, the relevant completed Linear cutover tickets and latest successful CI/deployment evidence. Enable only demonstrably activated functionality; otherwise obey existing protections and protected manual production. Risk-based automatic production, merge coordination and immutable-ancestor promotion remain disabled until their corresponding tested implementation, reviewed activation and protection are confirmed. Codex cannot self-approve production, risk downgrades or privileged authorization.

## Repository identity

- Product: **AI Operations**
- Allowed GitHub owner: **Matthew-Irving5**
- This repository and any runtime GitHub source must be owned by `Matthew-Irving5`.
- Never inspect, search, clone, query, modify, or interact with any repository owned by `BrightSG`.
- If repository ownership cannot be verified, stop before reading further repository content.

## Authoritative files

Before editing, read the complete six-section Linear ticket and its exact named interfaces. The ticket author must already have reconciled the applicable specifications and dependencies. Consult the relevant sections of the three authoritative root specifications when the ticket touches their domain or a contract mismatch is discovered; do not load all three entire documents for every small implementation:

1. `AI_OPERATIONS_AGENT_SPEC.md` â€” authoritative for manager identities, responsibilities, ownership, communication, command authority, handoffs, and agent capabilities.
2. `AI_OPERATIONS_BUILD_SPEC.md` â€” authoritative for platform/product architecture, infrastructure, security, data, integrations, testing, and delivery.
3. `AI_OPERATIONS_FRONTEND_DESIGN_CONSTITUTION.md` â€” authoritative for visual design, interaction, accessibility, frontend architecture, and frontend review.
4. `CODEX_PASS_PROMPTS.md` and `docs/build/PASS_LEDGER.md` when working on a historical build pass.
5. Relevant ADRs, architecture documents, tests, and workflows for the changed area.

Apply authority by subject: the Agent Spec controls agent behavior and provider ownership; the Build Spec controls platform, security, data, integrations, and delivery; the Frontend Constitution controls visual and interaction quality. Current code and deployed infrastructure are evidence of implementation, not authority to change these contracts. Preserve each specification's authority within its subject; where a cross-domain conflict remains, identify it in the issue evidence and follow the explicit issue/project decision rather than silently changing a contract. Do not reduce scope, replace locked architecture, or create an MVP.

## Linear issue execution and completion — local-first transition
- Current v2 source: docs/testing/local-first-ticket-contract-v2.md; ticket authoring: docs/testing/linear-ticket-template-v2.md. The six-section Linear ticket is the complete pre-engineered implementation specification.
- One independent Codex conversation owns one focused ticket and PR. Do not produce a startup readback or separate implementation plan. If instructions are provably stale, contradictory or unsafe, flag the exact issue instead of silently rebuilding the design.
- Test locally with the real caller role, focused functionality, negative cases and directly affected consumers. Boot Docker, Supabase and browsers ONLY for affected paths. Corepack pnpm remains pinned.
- GitHub PR CI is the lightweight \`verify:changed --lane=pr\` lane, plus separate required security workflows. Scheduled/manual full regression does not block every PR.
- Linear Done means implementation merged to main and evidenced. Hosted-only proof and production promotion are owned by explicit release acceptance tickets; Done is not Released.
- Transition safeguard: **do not infer current GitHub/release settings from a dated document.** Query the live main ruleset and default-branch workflow before using a new merge/staging option. At the 12 Nov review ruleset 24213001 required strict staged acceptance; if that remains true, do not bypass or fake it. The new process is active only after authorised settings changes, verified merged workflow and test evidence.
- Preserve all auth, RLS, MFA, approval, budget, private-data and environment protections. Distinct cross-boundary contracts have a single owner.
- Link precise dependencies in Linear. Never assume an unmerged branch feature exists on main.

## Codex configuration

- Use a model and reasoning setting actually available in the configured Codex client. Historic `CODEX_PASS_PROMPTS.md` model selections apply only to explicitly assigned legacy passes; do not fail or silently switch tools trying to find an obsolete model.
- Reasoning effort: `medium`
- Implementation tickets are already planned in Linear; inspect named code and execute the ticket directly. Do not produce a separate planning/readback artifact.
- For changed UI, use Codex-operated interactive local browser walkthroughs; Playwright may be an optional diagnostic tool but is not a required or scheduled browser E2E gate once AI-192 is implemented. Follow the current active workflow until that transition is verified.
- Use OpenAI Docs MCP for OpenAI/Codex/API implementation details.
- Use configured Supabase tooling for schema, RLS, functions, and migrations.
- Use normal terminal tooling for Git, GitHub CLI, pnpm, Supabase CLI, Wrangler, Python, Docker, and tests.

## Autonomy

For an implementation pass:

- inspect relevant files and current behaviour;
- make all in-scope changes;
- add and update tests;
- run non-destructive validation;
- fix failures;
- update documentation and ADRs;
- create and monitor the PR;
- continue until local acceptance and current required checks pass; use the protected merge route and only an activated independent merge coordinator. Never self-approve or bypass a check. Record exact merged SHA; release is tracked separately.

Do not ask the user to choose routine engineering details. Select the safest design that satisfies the specification and record material decisions in an ADR.

Stop only for a genuine external blocker such as:
- missing or invalid credential;
- unavailable provider resource;
- denied account permission;
- repository setting that prevents required auto-merge;
- provider outage that prevents validation.

## Safety boundaries

Never:

- access BrightSG;
- commit secrets;
- place production personal data in source or tests;
- weaken authentication, RLS, MFA, budget controls, action approvals, or local-file safety;
- expose a service-role or API key to browser code;
- add arbitrary remote command execution to the Windows worker;
- make local deletion immediate;
- use unsupported/private Apple APIs;
- send email to a model-generated address;
- allow AI output to change hard spending caps;
- mark tests skipped or loosen assertions merely to pass CI.

## Engineering standards

- TypeScript strict; avoid `any`.
- Python typed and linted.
- Zod schemas at every boundary.
- Database constraints enforce important invariants.
- RLS on every exposed table.
- All privileged operations through authenticated Edge Functions.
- Idempotency for schedules, webhooks, ingestion, notifications, and actions.
- Deterministic calculations must not be delegated to AI.
- AI output must use strict Structured Outputs and validation.
- Sensitive trace payloads must be redacted and separately protected.
- All dates use `timestamptz`; user planning uses `Europe/London`.
- Currency values use decimal/numeric or integer minor units, never binary floating point.
- Migrations are forward-safe and tested from an empty database.
- Every external integration has fixtures and failure-path tests.
- Every UI state has loading, empty, error, and permission-denied handling.
- Mobile Safari and desktop Chromium are required targets.

## Agent-native skill and tool selection

Codex discovers repository-scoped skills in `.agents/skills/`; read `docs/testing/ai-native-codex.md` for the current supported plugin setup, fallbacks and next-session prompt. Tool and skill installations never override this file, the Linear issue, security requirements or existing test/release gates.

- For unfamiliar cross-module functionality, start with `ai-operations-investigate`; prefer Serena symbol/reference queries when connected, otherwise `rg`, installed types and the repo map. For version-specific external libraries, use Context7 if authenticated; otherwise official docs.
- For any DB/Edge/provider/Worker/orchestrator/auth/deployment change, load ai-operations-integrate before implementation; its short boundary rules and single-object catalog lookup replace the two-skill startup. Use ticket-named boundaries and exact real-role checks. Do not introduce universal startup tests.
- For a concrete failure, use `ai-operations-debug` to reproduce and localise it before edits.
- For PR readiness/CI/staging/merge, use `ai-operations-ship` and **existing** GitHub workflows rather than a second release system.
- For compaction, a parked human gate or delegation, use `ai-operations-handoff` to preserve exact current SHA, validated results, blockers and next command in the ticket.
- P-Stack can provide focused `how`, `blast-radius`, `tdd`, `fix-ci` and cleanup skills; Ponytail can help minimise unnecessary code. Existing Superpowers is also installed. **Do not compose all these methodologies or automatically launch multi-model panels.** Choose the smallest useful technique and reuse existing QA.
- The Codex desktop Serena MCP may need explicit project activation for this checkout. If a third-party tool is unavailable, use native tools and proceed without silent loss of verification.
## Debugging and incident method

Agent debugging optimizes **localisation time**, not the number of patches attempted.

1. Reproduce the failure with the narrowest command possible. If useful, run `corepack pnpm qa:debug -- <command>` to capture a sanitized failure bundle, changed files and likely source locations.
2. Classify the failure before reading broadly: `CODE`, `CONTRACT`, `ENVIRONMENT`, `INFRASTRUCTURE`, `FLAKE`, or `UNKNOWN`. Environment failures go back to `qa:doctor`; do not search application code for them.
3. Search in this order: exact error evidence → failing test → current diff → direct producer/consumer/caller → correlated logs → git history → external documentation/web. Stop when evidence localizes the failing boundary.
4. Make the smallest causal fix and rerun **only the narrow reproducer**. Do not run a broad suite while that reproducer is red.
5. After two unsupported/failed fix hypotheses, stop patching. Revert speculative changes, restate the misunderstood invariant, reduce to a smaller reproduction, improve diagnostics if needed, and only then edit again.
6. Once narrow green, run only the ticket-selected affected contract checks; `corepack pnpm verify:changed --lane=core` is optional for shared-boundary impact. CI/staging are independent verification, not the primary debugger.
7. Every escaped deterministic bug leaves three artifacts: the fix, a regression test, and an earlier diagnostic/invariant so the same class cannot escape to that stage again. When the cause is integration/infrastructure, update the matching `ai-operations-integrate` prevention rule and evidence-linked incident **in the same fix commit**; do not wait until ticket closure.

Errors must be actionable without secret/personal-data leakage: identify the failed invariant, boundary/subsystem, expected vs actual state, correlation ID when available, owning contract/source when known, and the exact reproduction command.
## Local-first engineering execution — transitional v2
- The ticket has precisely six sections and its testing list is executable as written. No startup readback file and no parent-conversation readback.
- First inspect named code and fixed contracts. If a prerequisite is missing or a command invalid, report that specific obstacle and its evidence.
- Run the cheapest focused reproduction and direct consumer/permission checks. Use existing focused Vitest, Deno, pgTAP and Playwright tests as appropriate.
- Run local platform checks only for affected boundaries. For DB: exact roles/ACLs, migration history and schema types. For Edge: auth manifest and import maps. For Cloudflare: local production-like Worker preview when relevant. For changed UI: Codex-led manual local browser walkthrough, not scheduled browser automation once AI-192 is active.
- Stage only changes whose externally hosted runtime/provider behaviour cannot be proven locally, as a separately owned release acceptance ticket once the repository ruleset has been migrated.
- Open one PR per ticket with exact SHA, tests/results, and any unverified requirement. The PR owner is accountable through merge.
- Current ruleset still enforces staged acceptance; observe it until it is updated. Do not weaken repository protections through an implementation ticket.
- Retain the integration failure ledger; whenever a known preventable defect escapes, add the narrowest future guard to the owning boundary.
- Before Done, record merged commit and exact evidence. A project release is a distinct milestone from merged feature implementation.

## Conversation completion (historical passes only; new Linear tickets use the ticket entrypoint)

When the pass is merged:

1. State the PR number and merge status.
2. State tests and deployments passed.
3. State the next pass number.
4. Invoke `/compact`.
5. End the conversation.

The next pass starts in a fresh conversation.

## Definition of a complete feature

A feature is complete only when it has:

- production implementation;
- database and API contracts;
- validation;
- authorisation;
- audit/trace;
- cost treatment if AI is used;
- loading/error/empty UI states;
- unit/integration/E2E tests;
- documentation;
- observability;
- no placeholder or TODO.

## Pass 8 completion and controlled live-agent rollout (historical only — do not run for replacement tickets)

Pass 8 is the completion pass after the seven historical passes. Use the exact
`pass-08-completion` branch and prompt in `CODEX_PASS_PROMPTS.md`.

- Load root `.env` values through the process environment only. Never print, log,
  commit, or copy secret values into documentation, tests, screenshots, or PRs.
- Preserve the locked production identity `matthewirving99@gmail.com`. The
  `Matthew-Irving5` value is the approved GitHub owner/display label, not a
  replacement application login.
- Complete deterministic contracts, manager workflows, persistence, budgets,
  audit, traces, feedback, integrations, UI, recovery, and synthetic tests
  before making any live OpenAI call.
- Synthetic and provider-mock calls must use the same reservation, usage,
  tracing, validation, report, action, and feedback paths as live calls.
- The first live-agent test is one bounded deterministic call with no web search,
  no autonomous action, and the lowest-cost permitted model. Keep the initial
  aggregate below the configured provider/application ceiling (the Pass 8
  default is $2) and stop on any cost, trace, validation, or budget discrepancy.
- Expand live agents manager by manager only after evaluation, evidence, safety,
  and cost gates pass. Model output may never change hard caps, recipients,
  permissions, or approval requirements.

## External blockers and blocked-goal handoff

Ordinary implementation, test, deployment, and integration failures remain the
agent's responsibility and must be fixed. An external blocker is limited to a
missing or invalid credential, denied provider permission, unavailable provider
resource, required MFA/device/account consent, or another action that only the
operator can perform.

- Do not guess around an external blocker or weaken a security/control boundary.
- After the same blocker is observed for three consecutive goal turns, mark the
  active goal `blocked` instead of leaving it active.
- The blocked handoff must state the exact blocker, evidence and checks run,
  completed work, the precise operator action, exact verification steps, and the
  command or prompt that resumes the work.
- Never echo secret values. Do not repeatedly report that work is still blocked
  without changing goal status.

## Operator-owned production setup

Codex may validate configuration and provide guided steps, but the operator must
perform real-account actions: Supabase user/password creation, Microsoft
Authenticator TOTP enrollment, Google OAuth consent, the Gmail delivery test,
Apple Shortcut and Health Export authorization, Windows worker installation and
pairing, personal/finance configuration, backup/restore acceptance, schedule
review, and final production acceptance. These actions must be recorded in the
guided onboarding checklist before spend or email schedules are enabled.
