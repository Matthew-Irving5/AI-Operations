# Pass 8 completion traceability matrix

Pass 8 is the completion audit and implementation pass. Every row must be
`COMPLETE` before the pass can merge. `OPERATOR` is permitted only for explicitly
listed production-account actions with operator evidence.

| Area  | Requirement group                                                                          | Status  | Evidence                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1-6   | Environments, deployment, storage, and configuration                                       | PARTIAL | Cloudflare/Supabase workflows and config validation exist; production resources and secrets require operator verification.                                                     |
| 7-9   | Identity, MFA, RLS, capabilities, headers, secrets, and audit                              | PARTIAL | AAL2/RLS/header controls and audit tables exist; Pass 8 must exercise protected paths against an empty local database.                                                         |
| 10-11 | Retention, schema, constraints, indexes, and archive metadata                              | PARTIAL | Forward migrations and archive metadata exist; compaction/retrieval/restore proof remains outstanding.                                                                         |
| 12-16 | Scheduler, queues, AI runtime, budgets, notifications, and observability                   | PARTIAL | Shared deterministic completion contract added in `202608040001`; provider instrumentation, reconciliation, and mock-gate evidence remain outstanding.                         |
| 17-25 | All eight managers and cross-manager purpose boundaries                                    | PARTIAL | Workflow definitions and pages exist, but prior manager-specific synthetic SQL completion paths require replacement and end-to-end proof.                                      |
| 26-28 | Google, Apple, Health, GitHub, worker, and Edge Function contracts                         | PARTIAL | Contract functions and fixtures exist; provider failure-path and real-account operator verification remain outstanding.                                                        |
| 29    | Complete responsive/accessibility information architecture                                 | PARTIAL | Dashboard routes and baseline E2E coverage exist; the full desktop/WebKit/iPhone accessibility audit remains outstanding.                                                      |
| 30    | Unit, database, integration, AI evaluation, browser, security, and performance gates       | PARTIAL | Empty-db reset, all 60 pgTAP/RLS tests, Chromium/WebKit Playwright, TypeScript/Deno suites pass locally; security, k6, and complete AI-evaluation evidence remain outstanding. |
| 31-32 | Branch protection, CI/CD, staging, production, and archive maintenance                     | PARTIAL | GitHub workflows and a green Pass 7 merge were verified; staging/production smoke and settings are operator-owned.                                                             |
| 33-39 | Documentation, onboarding, blocked-goal handoff, operator acceptance, and release evidence | PARTIAL | Onboarding/runbooks and Pass 8 ADRs exist; acceptance and live-agent evidence are operator-owned and not yet recorded.                                                         |

Live-agent activation is a separate final gate. It cannot begin until the
deterministic synthetic system and full instrumentation/cost gate are complete.
The initial aggregate live-agent ceiling is $2 or lower.
