# Pass 08 evidence — completion and controlled agent activation

This file is completed during Pass 8. It must contain implementation scope,
migrations, security decisions, test commands/results, CI links, Playwright and
performance artifacts, traceability links, live-agent cost evidence, and the
operator acceptance record.

## Required evidence sections

- deterministic workflow and manager execution;
- database/API/RLS/AAL2 contracts;
- integrations, worker, archive, backup, and restore;
- frontend and accessibility coverage;
- CI, security, performance, and AI evaluation results;
- instrumentation proof with agents disabled;
- bounded live-agent smoke test and aggregate spend;
- manager-by-manager agent rollout evidence;
- operator-owned onboarding and production acceptance;
- unresolved blockers, if any, using the three-turn blocked-goal protocol.

## In-progress evidence

- Repository ownership and Pass 7: verified `Matthew-Irving5/AI-Operations`; PR #20 is merged at `c10f382` with its required checks successful.
- Baseline: `corepack pnpm verify` passed before Pass 8 changes.
- Deterministic execution: `202608040001_deterministic_workflow_completion.sql` adds one idempotent, audited, trace-producing completion contract for all managers while AI is disabled. `job-worker` now uses this contract rather than selecting a manager-specific synthetic SQL helper.
- Webhook hardening: OpenAI completion events now leave calls in `completed_pending_reconciliation`; a webhook alone cannot manufacture a report before response validation, usage reconciliation, reservation settlement, and trace persistence.
- Static validation after the change: Prettier check, Deno format/lint/check for every Edge Function, and the pnpm workspace unit suite passed.
- Local deterministic validation: `supabase db reset --local` applied every migration from an empty database; `pnpm test:db` passed all 60 pgTAP/RLS tests; `pnpm test:e2e` passed Chromium and WebKit browser coverage, including iPhone layouts and accessibility checks.
- No provider call has been made.
