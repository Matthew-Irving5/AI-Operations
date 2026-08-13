# AGENTS.md — AI Operations

## Repository identity

- Product: **AI Operations**
- Allowed GitHub owner: **Matthew-Irving5**
- This repository and any runtime GitHub source must be owned by `Matthew-Irving5`.
- Never inspect, search, clone, query, modify, or interact with any repository owned by `BrightSG`.
- If repository ownership cannot be verified, stop before reading further repository content.

## Authoritative files

Before doing work, read:

1. `AI_OPERATIONS_BUILD_SPEC.md`
2. `CODEX_PASS_PROMPTS.md`
3. `docs/build/PASS_LEDGER.md`
4. Relevant ADRs and architecture documents
5. The tests and workflows covering the area being changed

The build specification is authoritative. Do not reduce scope, replace locked architecture, or create an MVP.

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

When diagnosing a production failure, establish the failing boundary before
forming a root-cause theory. Trace the request hop by hop: browser request,
application route, provider call, persistence/RLS operation, and the next
redirect or session read. Record the status and structured response for each
hop, using a correlation/request ID where available.

- Treat a successful upstream operation as a boundary: if a provider returns
  `200`, stop treating that provider call as the failure and inspect the next
  application operation.
- For authenticated flows, verify both identities and persistence: the Auth
  user/session, the application profile row, required `is_allowed` flags,
  claims/AAL, cookies, and RLS predicates. An Auth user can exist while the
  application user row required by RLS is missing.
- Check provider logs and database invariants early, before investigating
  niche browser, CDN, CSP, clock, or token hypotheses. Rank hypotheses by the
  evidence already observed and test the cheapest/highest-probability one
  first.
- Do not ask the operator to repeatedly paste minified JavaScript initiator
  stacks. Request only the exact status, endpoint, structured response, log
  exception, or redacted screenshot needed to distinguish the next boundary.
- If the client response is blank, use server/provider logs or add temporary
  safe stage-level diagnostics with correlation IDs; never log secrets, codes,
  cookies, tokens, or personal payloads. Remove temporary diagnostics after
  the root cause is confirmed.
- After a production fix, repeat the complete flow from a fresh session and
  verify both the user-visible result and the relevant provider/database audit
  record.

## Pass start protocol

1. Verify repository:
   ```bash
   gh repo view --json nameWithOwner,isPrivate
   ```
   Owner must be `Matthew-Irving5`.

2. Read authoritative files.

3. Verify prior pass:
   - previous PR merged;
   - required checks passed;
   - commit exists on `origin/main`.

4. Synchronise:
   ```bash
   git fetch --all --prune
   git checkout main
   git pull --ff-only origin main
   git status --short
   ```

5. Run baseline test command.

6. Create the exact branch named by the pass prompt.

7. Mark pass `IN_PROGRESS` in `docs/build/PASS_LEDGER.md`.

If the previous PR is not merged, stop. Do not layer passes on an unmerged branch.

## Test protocol

Before implementation:
- inspect current tests and GitHub Actions;
- determine whether the changed scope is fully covered;
- add missing test jobs, fixtures, and checks.

During work:
- run targeted tests after each coherent change;
- use Playwright MCP to inspect browser console, network, responsive layout, and user flows;
- fix root causes.

Before PR, run the repository’s full CI-equivalent command, including:
- format;
- lint;
- typecheck;
- unit tests;
- database and RLS tests;
- Edge Function tests;
- Python worker tests if relevant;
- build;
- Playwright;
- security checks.

## PR protocol

- Update `docs/build/evidence/pass-XX.md`.
- Mark ledger `READY_FOR_REVIEW`.
- Commit with clear conventional messages.
- Push the pass branch.
- Create a PR with the pass number and title.
- Include:
  - specification scope;
  - implemented features;
  - migrations;
  - security changes;
  - tests and evidence;
  - screenshots or Playwright artifacts;
  - deployment impact.
- Enable squash auto-merge.
- Run:
  ```bash
  gh pr checks --watch
  ```
- On failure, inspect logs, fix, push, and repeat.
- Do not finish while a required check is failing.
- Wait for auto-merge and verify the PR is merged.
- Pull `main` and confirm the merge.

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
