# AGENTS.md â€” AI Operations

## Repository identity

- Product: **AI Operations**
- Allowed GitHub owner: **Matthew-Irving5**
- This repository and any runtime GitHub source must be owned by `Matthew-Irving5`.
- Never inspect, search, clone, query, modify, or interact with any repository owned by `BrightSG`.
- If repository ownership cannot be verified, stop before reading further repository content.

## Authoritative files

Before editing any production code or governance artifact, read the active Linear issue, its linked dependencies and completion evidence, and all three root specifications:

1. `AI_OPERATIONS_AGENT_SPEC.md` â€” authoritative for manager identities, responsibilities, ownership, communication, command authority, handoffs, and agent capabilities.
2. `AI_OPERATIONS_BUILD_SPEC.md` â€” authoritative for platform/product architecture, infrastructure, security, data, integrations, testing, and delivery.
3. `AI_OPERATIONS_FRONTEND_DESIGN_CONSTITUTION.md` â€” authoritative for visual design, interaction, accessibility, frontend architecture, and frontend review.
4. `CODEX_PASS_PROMPTS.md` and `docs/build/PASS_LEDGER.md` when working on a historical build pass.
5. Relevant ADRs, architecture documents, tests, and workflows for the changed area.

Apply authority by subject: the Agent Spec controls agent behavior and provider ownership; the Build Spec controls platform, security, data, integrations, and delivery; the Frontend Constitution controls visual and interaction quality. Current code and deployed infrastructure are evidence of implementation, not authority to change these contracts. Preserve each specification's authority within its subject; where a cross-domain conflict remains, identify it in the issue evidence and follow the explicit issue/project decision rather than silently changing a contract. Do not reduce scope, replace locked architecture, or create an MVP.

## Linear issue execution and completion

- Linear describes **feature intent**, not a duplicated engineering manual. A ready ticket should contain: objective, feature-specific constraints, 1–3 observable acceptance outcomes, one test profile, any genuinely live-only proof, and out-of-scope items.
- The repository owns the execution method. Every ticket starts with `corepack pnpm qa:doctor --fix`; use Corepack for every pnpm command so the repository-pinned version is used. Do not copy Docker/browser/test recovery instructions into individual tickets.
- Use **In Progress** only while a development lane actively owns the ticket. One coding agent owns implementation and remains accountable through merge; do not add reviewer/best-of-N agents by default.
- Compatible tickets may develop in parallel. Do not let CI, staging, MFA, provider waits, or another ticket's release wait consume an otherwise-free development lane. Park external-human gates with an exact resume command.
- A ticket is Done when its selected local/CI proofs pass, its explicitly required live-only proof (if any) passes, and a deployable change has the bounded production smoke required by the release pipeline. Full live E2E is **not** a universal per-ticket requirement.
- Every deterministic defect first discovered at a higher layer must add a cheaper regression or invariant at the lowest layer capable of catching it before the ticket completes.
- Keep dependency relationships truthful. Prefer issues that are independently developable/QA-complete and prioritize work that unlocks additional ready lanes.
## Codex configuration

- Build model: `gpt-5.6-terra`
- Reasoning effort: `medium`
- Use Plan Mode to inspect a pass, then Goal Mode to complete it.
- Use Playwright MCP for frontend/browser testing.
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
- continue until checks pass and auto-merge completes.

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

## Debugging and incident method

Agent debugging optimizes **localisation time**, not the number of patches attempted.

1. Reproduce the failure with the narrowest command possible. If useful, run `corepack pnpm qa:debug -- <command>` to capture a sanitized failure bundle, changed files and likely source locations.
2. Classify the failure before reading broadly: `CODE`, `CONTRACT`, `ENVIRONMENT`, `INFRASTRUCTURE`, `FLAKE`, or `UNKNOWN`. Environment failures go back to `qa:doctor`; do not search application code for them.
3. Search in this order: exact error evidence → failing test → current diff → direct producer/consumer/caller → correlated logs → git history → external documentation/web. Stop when evidence localizes the failing boundary.
4. Make the smallest causal fix and rerun **only the narrow reproducer**. Do not run a broad suite while that reproducer is red.
5. After two unsupported/failed fix hypotheses, stop patching. Revert speculative changes, restate the misunderstood invariant, reduce to a smaller reproduction, improve diagnostics if needed, and only then edit again.
6. Once narrow green, run the changed-surface proof with `corepack pnpm verify:changed`. CI/staging are independent verification, not the primary debugger.
7. Every escaped deterministic bug leaves three artifacts: the fix, a regression test, and an earlier diagnostic/invariant so the same class cannot escape to that stage again.

Errors must be actionable without secret/personal-data leakage: identify the failed invariant, boundary/subsystem, expected vs actual state, correlation ID when available, owning contract/source when known, and the exact reproduction command.
## Pass start protocol

1. Verify `Matthew-Irving5/AI-Operations`, fetch/prune and start from current `origin/main` without disturbing another active worktree.
2. Run `corepack pnpm qa:doctor --fix`. Do not investigate the feature until it is green. This verifies/recovers Docker, local Supabase/images, browsers and required developer runtimes.
3. Read the active Linear issue and only the authoritative spec sections/repo-map entries relevant to its changed surface. Run `corepack pnpm repo:map` when the generated routing map is stale.
4. Define 1–3 observable acceptance outcomes and identify the cheapest test layer capable of proving each. Add a live/staging proof only for a boundary localhost cannot faithfully prove.
5. Run a narrow existing baseline only when it materially validates the starting assumption; do not pay the full-suite tax before editing.
6. Create the issue branch and implement in one owning session.
## Test protocol

Use the cheapest proof capable of catching each defect class exactly once.

- Inner loop: affected unit/contract/component tests only.
- Boundary proof: exactly the real boundary changed (DB/API/queue/browser/provider), not unrelated product journeys.
- Final local gate: `corepack pnpm verify:changed`. Its impact router selects affected static/package/DB/Edge/worker/browser/security checks and fails safe to the broader suite when central build/test routing changes. Independent selected checks continue after a failure; dependent checks are explicitly skipped, and the overall gate remains non-zero.
- Chromium is the default PR browser proof when browser behaviour changed. WebKit/full cross-browser runs belong to explicit compatibility/auth/design-system acceptance or scheduled full regression, not every backend/release edit.
- `corepack pnpm verify` / `corepack pnpm verify:ci` are fallback/full-regression commands, not the default feature inner loop.
- Never repeat the same capability proof locally, in CI and on staging unless the higher layer exercises a boundary the lower layer physically cannot prove.
- Long-running independent checks should run in parallel. Do not create many tiny jobs when runner/setup overhead exceeds the test value.
- Never skip/loosen a required assertion to gain speed; reduce scope to the relevant proof instead.
## PR protocol

- Before opening the PR, run `corepack pnpm verify:changed`; do not reflexively run the full CI-equivalent suite.
- Push one coherent branch/PR. The same ticket owner remains responsible for defects until merge, but waiting on CI/release does not block another compatible development lane.
- PR CI consists of parallel changed-surface **core** and **boundary** lanes. Superseded runs are cancelled. Full browser/Edge regression is scheduled separately.
- If CI fails, use its exact failing command as the narrow reproducer; use `qa:debug` where useful. Fix locally, prove the narrow failure green, then push once. Do not debug by speculative GitHub Actions commits.
- Staging proves only ticket-specific boundaries that cannot be established locally. Promote the accepted immutable candidate/provenance through the existing release gates; production gets a bounded affected-capability smoke.
- Merge only with required checks green. Record material defects and the new regression/diagnostic that prevents recurrence.
## Conversation completion

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

## Pass 8 completion and controlled live-agent rollout

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
