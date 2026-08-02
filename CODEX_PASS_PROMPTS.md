# CODEX_PASS_PROMPTS.md — AI Operations

Use a fresh Codex conversation for each pass.

For every pass:

1. Open the `ai-operations` repository root.
2. Select `gpt-5.6-terra`.
3. Set reasoning effort to `medium`.
4. Use `/plan` to inspect the pass, repository, tests, and dependencies.
5. Then paste the exact `/goal` text for that pass.
6. Do not start the next pass until the current PR is merged into `main`.
7. At completion invoke `/compact` and end the conversation.

---

## Pass 1 — Foundation, infrastructure, authentication, and CI

**Branch:** `pass-01-foundation`  
**PR title:** `Pass 01: foundation, authentication, infrastructure and CI`

### Goal Mode prompt

```text
/goal

Build Pass 1 of AI Operations exactly as defined in AI_OPERATIONS_BUILD_SPEC.md.

Persistent objective:
Create the complete production-grade project foundation, cloud/local environment model, authentication and MFA security layer, database foundation, design-system shell, and CI/CD baseline. This is not a prototype.

Before editing:
- verify the GitHub repository owner is Matthew-Irving5;
- verify no BrightSG repository is accessed;
- read AI_OPERATIONS_BUILD_SPEC.md and AGENTS.md completely;
- inspect current files, tests, GitHub Actions, and .codex/config.toml;
- ensure no previous pass is required;
- create branch pass-01-foundation.

Required implementation:
1. Create the pnpm/Turborepo monorepo and exact directory structure from the specification.
2. Pin and document stable compatible versions of Next.js 16.x, Playwright, Supabase CLI, Wrangler, TypeScript, Python, and lint/test tools.
3. Build the Next.js application shell, responsive navigation, base dashboard, error/loading/empty components, and reusable UI package.
4. Configure local Supabase and create foundational migrations for:
   app users, personal profile, managers, workflow definitions, schedules, runs, steps, queue, actions, approvals, reports, AI model/pricing/prompt/call/cost tables, budgets, traces, audit, feedback, connections, ingestion, source objects, and data freshness.
5. Enable and test RLS on every exposed table. Default deny. Implement one allowlisted production identity model.
6. Implement Supabase email/password login, disabled sign-up, allowlist enforcement, TOTP enrolment and challenge, mandatory AAL2 before entering the application, and fresh-MFA step-up primitives.
7. Implement strict environment validation and secret separation for development, staging, and production.
8. Implement R2 storage interfaces, private object metadata model, content hashing, and a local MinIO/test adapter.
9. Add Cloudflare/OpenNext deployment configuration and Supabase deployment configuration without requiring a custom domain.
10. Add security headers, CSP, secure cookies, CSRF/origin controls, and application-level capability checks.
11. Create synthetic seed data and test fixtures only.
12. Create cross-platform pass preflight/finish helper scripts.
13. Create the complete initial GitHub Actions suite for formatting, linting, type checking, unit testing, database/RLS testing, build, security scanning, and a basic Playwright smoke test.
14. Create architecture, security, environment, and developer onboarding documentation and initial ADRs.
15. Create docs/build/PASS_LEDGER.md and docs/build/evidence/pass-01.md.

Testing and verification:
- run format, lint, typecheck, unit, database, RLS, build, Playwright Chromium and WebKit smoke, and security checks;
- use Playwright MCP to inspect login, MFA, unauthorised access, desktop navigation, and iPhone viewport;
- prove an unauthenticated request and a synthetic second user cannot read the primary user's rows;
- prove AAL1 cannot access application routes or sensitive functions;
- prove production secrets are not bundled into frontend output;
- verify staging deployment configuration and dry run.

PR protocol:
- push pass-01-foundation;
- create the PR with the exact title;
- include complete test evidence;
- enable squash auto-merge;
- monitor every required GitHub Action, fix all failures, and repeat;
- wait until the PR is merged into main;
- verify the merge exists on origin/main.

Stopping condition:
Pass 1 is finished only when every required feature and test above is complete, the PR is merged, and there are no placeholders, TODO-only production paths, skipped required tests, unresolved high/critical security findings, or uncommitted changes.
```

---

## Pass 2 — Platform engine, AI runtime, budgets, tracing, feedback, and email

**Branch:** `pass-02-platform-engine`  
**PR title:** `Pass 02: orchestration, AI budgets, tracing and notifications`

### Goal Mode prompt

```text
/goal

Build Pass 2 of AI Operations exactly as defined in AI_OPERATIONS_BUILD_SPEC.md.

Persistent objective:
Implement the complete always-on workflow engine and the cross-cutting AI Operations platform: scheduler, queue, OpenAI runtime, cost reservation, recurring/on-demand budget enforcement, spend forecasting, reports, actions, approvals, Gmail notifications, observability, tracing, feedback, Systems Manager, and AI evaluation framework.

Preflight:
- verify Pass 1 PR is merged into main and all checks passed;
- sync main and run the full baseline;
- create branch pass-02-platform-engine;
- inspect and extend existing tests and workflows rather than replacing them.

Required implementation:
1. Implement Supabase Cron scheduler-dispatch every five minutes, due-schedule claiming, Europe/London DST handling, catch-up policies, idempotency, and transactional run creation.
2. Implement lease-based job queue, retries with jitter, dead-letter state, concurrency protection, and trace events.
3. Implement the manager/workflow framework and a fully functional synthetic test manager.
4. Implement OpenAI Responses API client using strict Structured Outputs, explicit prompt cache breakpoints/keys, tool policy, background mode, signed webhook processing, bounded polling fallback, retries, fallbacks, and response validation.
5. Seed/version GPT-5.6 Luna, Terra, and Sol pricing and model capabilities. Keep pricing data versioned and editable only with MFA.
6. Implement pre-call token/tool estimates, cost reservations, actual cost calculation, recurring budgets defaulting to $5 target and $10 hard cap, provider backstop display, and separate on-demand budgets.
7. Implement the exact actual/expected/original-month-end/variance-adjusted forecast definitions from the specification, with historical snapshots and confidence.
8. Implement actions, approvals, reports, report sections, notifications, and immutable audit records.
9. Implement Gmail API notification dispatch abstraction and provider mock; notification recipient must be allowlisted and model output must never choose recipients.
10. Build:
    - Operations Centre;
    - AI Spend & Forecasting;
    - AI Traces & Audit;
    - Feedback & Quality;
    - approvals list/detail;
    - reports list/detail;
    - automation/schedule pages.
11. Implement workflow-specific thumbs up/down, dynamic categories, free-text feedback, and quality-review state.
12. Implement Systems & Automation Manager daily, weekly, and monthly workflows using deterministic calculations and Luna/Terra where specified.
13. Implement provider usage/cost reconciliation hooks, data freshness, run cancellation, retry, and deduplicated email.
14. Implement AI eval harness with synthetic golden cases, schema/fact/evidence/cost/safety metrics.
15. Update docs, ADRs, data dictionary, runbooks, cost-control documentation, pass ledger, and pass evidence.

Testing and verification:
- concurrent dispatch must not duplicate a run;
- duplicate webhook must not duplicate a report/email;
- recurring hard cap must prevent the call;
- on-demand run must use its own cap while appearing in combined spend;
- forecast calculations must match fixed test vectors;
- invalid structured output must retry/fail safely;
- a background response webhook must complete a run;
- feedback must appear in the trace;
- Gmail staging/mock test must record a message ID;
- Playwright must cover operations, spend filters, trace tree, approval, feedback, and mobile layouts;
- test prompt injection text as untrusted source data;
- run all CI-equivalent checks.

PR protocol:
Follow AGENTS.md exactly, enable auto-merge, monitor checks, fix every failure, and wait for merge.

Stopping condition:
The platform engine can run a scheduled synthetic manager end-to-end, enforce budgets, record complete traces and costs, generate a report/action, send a test notification, collect feedback, and expose all required observability pages. The PR is merged with all checks passing.
```

---

## Pass 3 — Google/Apple integrations and Personal Operations

**Branch:** `pass-03-personal-integrations`  
**PR title:** `Pass 03: Google and Apple integrations with Personal Operations`

### Goal Mode prompt

```text
/goal

Build Pass 3 of AI Operations exactly as defined in AI_OPERATIONS_BUILD_SPEC.md.

Persistent objective:
Implement secure Google and Apple-source ingestion plus the complete Personal Operations Manager, including the personal operating profile, calendar/reminder/routine data, daily and weekly planning, action coordination, and email outputs.

Preflight:
- verify Pass 2 PR is merged;
- sync main and run baseline;
- create pass-03-personal-integrations.

Required implementation:
1. Implement Google server-side OAuth with state, secure token storage, refresh, incremental scopes, connection status, revoke, and failure recovery.
2. Implement Gmail incremental sync using history/cursors and configurable labels. Archive selected attachments to R2. Never mark read/archive/delete.
3. Implement Google Calendar incremental sync with recurring events, source timezone, stable IDs, selected calendars, and optional dedicated AI Operations calendar writes.
4. Implement selected Google Drive source access and existing-file ingestion without using Drive as primary archival storage.
5. Implement connection UI showing account, scopes, freshness, affected workflows, reconnect, and revoke.
6. Implement Apple Calendar/Reminders Shortcut bridge:
   - device token registration;
   - snapshot endpoint;
   - idempotent reminders/events import;
   - Fitness Plan, Household & Personal, and AI Actions mappings;
   - approved AI Actions pull endpoint;
   - revocation and setup/test UI;
   - complete onboarding instructions.
7. Implement personal profile, encrypted locations, time preferences, recurring busy blocks, travel/preparation buffers, quiet hours, and cross-manager context interfaces.
8. Implement routines, commitments, waiting items, daily plans, time blocks, and planning exceptions.
9. Implement deterministic conflict detection, due-item ranking, and travel-time provider interface with common-location fallback and optional Google route provider.
10. Implement complete Personal Operations workflows:
    - morning plan;
    - midday exception;
    - evening close;
    - weekly plan.
11. Implement Personal Manager page, calendar/reminder/routine views, profile settings, schedules, history, reports, and feedback.
12. Implement email templates and rules. Empty exception scans must remain silent.
13. Add exact feedback categories and AI eval cases.
14. Update documentation, setup wizard steps, pass ledger, and evidence.

Testing and verification:
- OAuth CSRF/state and encrypted token tests;
- expired token refresh and revoked token failure;
- Gmail/Calendar/Drive sync idempotency;
- recurring calendar and timezone/DST tests;
- Apple snapshot replay and scope tests;
- morning plan fixed-vector test using calendar, reminders, actions, profile, and health placeholder context;
- midpoint no-change produces no email;
- Playwright connection, profile, planning, mobile, and reminder flows;
- accessibility and security;
- full CI.

PR protocol:
Follow AGENTS.md, create PR, auto-merge, watch checks, fix all failures, wait for merge.

Stopping condition:
Google and Apple bridge data can be collected securely, Personal Operations produces complete scheduled reports/emails with deterministic conflict checks, and all integration/security/E2E tests pass. PR merged.
```

---

## Pass 4 — Health & Performance and Finance Operations

**Branch:** `pass-04-health-finance`  
**PR title:** `Pass 04: Health and Finance operations`

### Goal Mode prompt

```text
/goal

Build Pass 4 of AI Operations exactly as defined in AI_OPERATIONS_BUILD_SPEC.md.

Persistent objective:
Implement the complete Health & Performance and Finance Operations domains, with raw ingestion, historical retention, deterministic metrics/validation, scheduled reports, AI interpretation, feedback, and secure UI.

Preflight:
- verify Pass 3 merged;
- sync and baseline;
- create pass-04-health-finance.

Health requirements:
1. Implement secure Health Auto Export-compatible ingestion for JSON/CSV/compressed/chunked payloads.
2. Archive raw payload before transformation.
3. Implement historical backfill, daily previous-day import, late-write recheck, revisions/deletions, device/source provenance, units, deduplication, and rejected-record reports.
4. Implement partitioned health samples and all specified health tables.
5. Implement deterministic daily summaries: body trends, running volume/pace/HR, sleep, nutrition, strength, load, confidence, and freshness.
6. Implement optional Strava/Hevy/nutrition adapters where credentials are available, with Apple Health remaining canonical.
7. Implement Screen Time experimental adapter, capability documentation, and manual import path without unsupported APIs.
8. Implement Health workflows:
   - daily processing;
   - weekly review;
   - monthly composition;
   - 4–6 week running block;
   - quarterly strategy.
9. Implement Health page, charts, goals, plans, sources, data completeness, reports, and feedback.
10. Implement safety validators and non-diagnostic language.

Finance requirements:
1. Implement secure uploads and Gmail/Drive ingestion for PDF, CSV, XLSX, and supported finance formats.
2. Archive originals and implement file/transaction deduplication.
3. Implement institution/account/period identification and strict transaction schema.
4. Implement parsing adapters, Luna ambiguous categorisation, category rules, corrections, and provenance.
5. Implement deterministic statement reconciliation, balance checks, currency/date coverage, and close readiness.
6. Implement compatibility adapter configuration for the existing Personal Finance Manager Google Sheet without destructive writes.
7. Implement all finance tables and close state.
8. Implement:
   - daily close dispatcher;
   - monthly close;
   - quarterly review;
   - annual review.
9. Implement exact report sections, blockers, approvals, actions, forecasts, and email notifications.
10. Implement Finance page, upload/reconciliation UI, close control, metrics, reports, and feedback.
11. Require fresh MFA for raw sensitive downloads/exports.
12. Add manager eval suites and numerical ground-truth tests.

Testing:
- health duplicate/revision/unit/backfill fixtures;
- full previous-day import;
- running/body/nutrition/sleep calculations;
- safety cases;
- finance statement reconciliation and deliberate mismatch;
- duplicate transaction;
- incomplete close qualification;
- raw file access MFA;
- AI report schema/evidence/numerical checks;
- Playwright Health and Finance desktop/mobile;
- full CI/security.

PR protocol:
Follow AGENTS.md, auto-merge, monitor/fix checks, wait for merge.

Stopping condition:
Both managers operate end-to-end on synthetic realistic data, produce accurate validated reports/emails, retain raw evidence, expose complete pages, and pass all numerical, safety, security, and E2E tests. PR merged.
```

---

## Pass 5 — Career, Travel, and Procurement Operations

**Branch:** `pass-05-career-travel-procurement`  
**PR title:** `Pass 05: Career, Travel and Procurement operations`

### Goal Mode prompt

```text
/goal

Build Pass 5 of AI Operations exactly as defined in AI_OPERATIONS_BUILD_SPEC.md.

Persistent objective:
Implement the complete Career, Travel Planning, and Consumer & Procurement managers with secure source access, bounded current web research, individual on-demand budgets, watches, reports, citations, feedback, and email output.

Preflight:
- verify Pass 4 merged;
- sync and baseline;
- create pass-05-career-travel-procurement.

Career:
1. Implement GitHub connection and read-only sync.
2. Enforce exact owner allowlist Matthew-Irving5 on every request and hard-deny BrightSG.
3. Store repository/activity/project evidence with provenance.
4. Implement Drive/Gmail career document and job-description ingestion.
5. Implement skills graph, evidence, goals, market snapshots, opportunities, risks, and documents.
6. Implement daily evidence sync, weekly opportunity pulse, monthly market-value report, and quarterly strategy.
7. Current market and salary claims require bounded web research and citations.
8. No automatic outreach and no runtime Codex automation.
9. Implement full Career UI and feedback/evals.

Travel:
1. Implement on-demand launch form with individual hard cap, search limit, model ceiling, dates, origin, budget, and constraints.
2. Implement cited research, options, itinerary, costs, checks, bookings, calendar proposals, and email report.
3. Implement configurable price/disruption/weather/readiness watches with expiry and trigger-change deduplication.
4. Ensure watch cost is associated with the on-demand budget policy.
5. Implement Travel UI, reports, sources, and feedback/evals.

Procurement:
1. Implement on-demand request/requirements workflow and individual budget.
2. Implement current product/service research with strict compliance filtering and citations.
3. Produce best overall, best value, premium only when justified, exclusions, uncertainty, total ownership cost, warranty, returns, and timing.
4. Implement price watches, purchase/receipt ingestion, return windows, and warranties.
5. Implement Procurement UI and feedback/evals.

Cross-cutting:
- web search ceilings are enforced;
- current-source dates are stored;
- citations visible;
- on-demand spend excluded from recurring cap but included in combined/amortised reporting;
- notification emails and traces complete.

Testing:
- GitHub fixtures for Matthew-Irving5 accepted;
- BrightSG fixture rejected before content processing;
- career citations and skills evidence;
- travel/procurement hard-cap and search-limit failure;
- watch deduplication/expiry;
- out-of-date source handling;
- Playwright manager and on-demand flows;
- full CI/security/evals.

PR protocol:
Follow AGENTS.md, auto-merge, watch/fix checks, wait for merge.

Stopping condition:
All three managers operate end-to-end, current research is bounded/cited, GitHub boundary is proven, on-demand budget semantics are correct, and PR is merged with all checks passing.
```

---

## Pass 6 — Digital Estate worker, archival, storage, and recovery

**Branch:** `pass-06-digital-estate`  
**PR title:** `Pass 06: Digital Estate worker and archival lifecycle`

### Goal Mode prompt

```text
/goal

Build Pass 6 of AI Operations exactly as defined in AI_OPERATIONS_BUILD_SPEC.md.

Persistent objective:
Implement the complete Digital Estate, Device & Security manager and Windows worker, plus long-term archive compaction, storage monitoring, backup, and recovery.

Preflight:
- verify Pass 5 merged;
- sync and baseline;
- create pass-06-digital-estate.

Required implementation:
1. Create typed Python 3.12 Windows worker with local SQLite state, outbound-only HTTPS, background operation, heartbeat, polling, resumable jobs, structured logs, and packaging.
2. Implement one-time device pairing after fresh MFA, Ed25519 identity, DPAPI/Credential Manager private-key protection, revocation, signed results, and signed short-lived action manifests.
3. Implement allowlisted drive/folder configuration and mandatory exclusions.
4. Implement read-only inventory:
   - tree/metadata;
   - size/type/timestamps;
   - duplicate candidate/hash;
   - Git repo/status;
   - installed software;
   - disk capacity;
   - Defender/firewall/BitLocker/updates/backups;
   - selected startup items.
5. Implement cloud scan launch with on-demand budget, worker queue, offline waiting, progress, cancellation boundaries, and result ingestion.
6. Implement deterministic clutter/duplicate/security analysis and Terra-bounded organisation analysis.
7. Implement complete organisation-plan UI with per-action selection/editing, risk, source/destination, reason, precondition, and expected storage impact.
8. Require fresh MFA approval and immutable payload hash.
9. Implement strict executor enum; prohibit arbitrary commands; validate roots, traversal, symlinks/reparse points, source hash/mtime preconditions.
10. Implement move/rename/archive/quarantine; never immediate delete.
11. Implement quarantine inventory and separately approved purge after default 30 days.
12. Implement Digital Estate dashboards, scan history, security findings, software, storage trend, devices, reports, and feedback.
13. Implement monthly archive lifecycle:
    - hot partition selection;
    - Parquet/Zstandard export;
    - R2 upload;
    - checksum/sample verification;
    - manifest;
    - transparent historical retrieval;
    - safe hot-row removal.
14. Implement storage forecast/cost monitoring.
15. Implement encrypted backup export and staging restore drill.
16. Add Windows GitHub Actions, signing/test packaging, archival workflow, documentation, pass evidence.

Testing:
- worker authentication, replay, expiry, signature;
- path traversal and symlink/reparse attacks;
- changed-file precondition;
- offline queue;
- duplicate and inventory;
- quarantine/no-immediate-delete;
- archive round-trip and retrieval;
- backup restore;
- Windows CI;
- Playwright scan/plan/MFA/approval/device flows;
- full security and CI.

PR protocol:
Follow AGENTS.md, auto-merge, monitor/fix checks, wait for merge.

Stopping condition:
A registered offline-capable Windows worker can safely inventory, receive an approved signed plan, execute reversible actions, return results, and the platform can archive/retrieve/restore historical data. All security tests pass and PR is merged.
```

---

## Pass 7 — Final integration, hardening, production deployment, and acceptance

**Branch:** `pass-07-final-hardening`  
**PR title:** `Pass 07: production hardening, integration and final acceptance`

### Goal Mode prompt

```text
/goal

Complete Pass 7 and the entire AI Operations product exactly as defined in AI_OPERATIONS_BUILD_SPEC.md.

Persistent objective:
Integrate, harden, test, document, deploy, and prove the complete production system. Do not add new scope unrelated to the specification, and do not leave any requirement incomplete.

Preflight:
- verify Pass 6 merged and main is green;
- create pass-07-final-hardening;
- generate a requirement-by-requirement traceability matrix before changing code.

Required implementation:
1. Audit every requirement in AI_OPERATIONS_BUILD_SPEC.md against code, tests, UI, migrations, docs, and deployment.
2. Fix every missing, partial, placeholder, TODO, insecure, inaccessible, untested, or inconsistent implementation.
3. Complete cross-manager data contracts:
   - Personal consumes Health/Career/actions;
   - Systems consumes all runs/cost/feedback/freshness;
   - Finance and Procurement budget context where permitted;
   - Travel Calendar integration;
   - no manager reads data outside its declared purpose.
4. Complete Overview, Operations, all eight manager pages, Reports, Approvals, Spend, Traces, Feedback, Data Sources, Automations, Devices, and Settings.
5. Polish interactive charts, filters, historical periods, textual alternatives, iPhone layouts, empty/error/loading states, and navigation.
6. Optimise database indexes, archive retrieval, scheduler, trace queries, and chart aggregation to performance targets.
7. Complete threat model and remediate all high/critical findings.
8. Complete prompt-injection, RLS, OAuth, webhook, worker, budget, and export hardening.
9. Run and improve all manager AI eval suites. Establish baseline quality/cost results and model/prompt promotion rules.
10. Complete data export, audit export, credential rotation, connection/device revocation, and account recovery documentation.
11. Build production onboarding wizard with all manual steps and acceptance state.
12. Implement initial schedule review/approval and ensure no spending/email schedules enable before acceptance.
13. Complete backup, restore, disaster recovery, provider outage, hard-cap, and stale-data runbooks.
14. Ensure staging deploy, smoke, automatic production deploy, production migrations, and safe smoke tests.
15. Create final synthetic demo dataset and documentation without production data.
16. Ensure GitHub Actions required checks, branch protection, and auto-merge configuration are documented and validated.
17. Remove dead code, unused dependencies, debug logging, temporary fixtures, and all production TODOs.
18. Finalise README, architecture, security, operations, onboarding, data dictionary, ADRs, and traceability matrix.
19. Update pass ledger and docs/build/evidence/pass-07.md.

Required final tests:
- full clean install from repository;
- migrations from empty DB;
- complete CI;
- Playwright Chromium/WebKit desktop and iPhone;
- accessibility;
- all RLS/AAL2 cases;
- all eight manager happy paths;
- failures/retries/idempotency;
- cloud schedule with simulated PC offline;
- on-demand budgets;
- recurring cap;
- cost forecast;
- Gmail notification;
- Health/Apple/Google ingestion;
- local worker queue and approval;
- archive/retrieve/restore;
- load/performance;
- security scan;
- production/staging smoke.

PR protocol:
- create final PR;
- enable auto-merge;
- monitor and fix every required check;
- wait for merge;
- verify production deployment and smoke after merge;
- verify main is clean.

Stopping condition:
The requirements traceability matrix contains no incomplete item. All seven passes are merged. Production is deployed. All eight managers, schedules, budgets, tracing, feedback, email, integrations, local worker, archival, security, CI/CD, onboarding, and recovery are complete and tested. There are no unresolved high/critical findings, production placeholders, required skipped tests, or uncommitted changes.

After confirming completion, invoke /compact and end the conversation.
```
