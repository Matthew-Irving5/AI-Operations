# Pass 07 requirement traceability matrix

This matrix is the release gate for the final pass. A row is complete only when it has a production path, authorisation and audit treatment where applicable, tests, and operational documentation.

| Spec area | Requirement group                                                                       | Baseline audit | Pass 07 acceptance evidence                                               |
| --------- | --------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| 1–6       | Private single-user cloud control plane, separate environments, validated configuration | Partial        | Environment validation, staging and production workflows, smoke evidence  |
| 7–9       | MFA, capability checks, RLS, rate limits, headers, audit, data classification           | Partial        | RLS/AAL2/CSRF/rate-limit tests; security model and threat review          |
| 10        | R2 retention, compaction, retrieval, backup, restore and manifest integrity             | Partial        | Archive integration tests, maintenance workflow, restore drill evidence   |
| 11        | All core and manager data contracts, constraints, indexes and RLS                       | Partial        | Empty-DB migration, pgTAP constraints/index/RLS coverage, data dictionary |
| 12–16     | Scheduling, queue/retry, AI runtime, budgets, notifications, traces and feedback        | Partial        | Idempotency/retry/budget tests, evaluations, dashboard evidence           |
| 17        | Shared manager contract and purpose-limited cross-manager data                          | Partial        | Contract tests and documented data-flow boundaries                        |
| 18        | Finance operations and sensitive raw-data export protection                             | Partial        | Reconciliation/export tests and Finance UI state coverage                 |
| 19        | Career evidence, strict personal GitHub boundary and current-source citations           | Partial        | Owner-denial/citation/evaluation tests                                    |
| 20        | Personal profile, planning and Calendar/Health/Career context                           | Partial        | Deterministic planning contract and browser coverage                      |
| 21        | Health ingestion, metrics, safety and source completeness                               | Partial        | Fixture/revision/safety tests and user-facing completeness states         |
| 22        | Systems cost, quality, storage, backup and provider health                              | Partial        | Forecast/quality/operational acceptance tests                             |
| 23        | Device inventory, plan approval, safe execution, quarantine and security                | Partial        | Worker protocol and dashboard approval acceptance tests                   |
| 24–25     | Travel and Procurement bounded research, watches and lifecycle data                     | Partial        | Hard-cap/search/watch/citation tests and UI coverage                      |
| 26–27     | Google OAuth/Gmail/Calendar/Drive and Apple/Health bridge hardening                     | Partial        | Provider fixture, replay, OAuth, revocation and freshness tests           |
| 28        | Versioned Edge Function surface: typed, rate limited, idempotent, audited and tested    | Partial        | Function contract matrix and Deno integration checks                      |
| 29        | Complete information architecture, responsive/accessibility/chart states                | Partial        | Chromium/WebKit, axe and screenshot acceptance coverage                   |
| 30        | Unit, DB, integration, AI eval, browser, security and performance gates                 | Partial        | Clean CI, coverage/eval baselines, k6/performance evidence                |
| 31–32     | Branch protection, required checks, staging then production release safety              | Partial        | Release guide, workflow validation and hosted deployment smoke            |
| 33–36     | Complete docs, onboarding checklist/acceptance state, demo data and final release       | Partial        | Documentation review, onboarding flow and final evidence                  |

## Audit method

The audit uses migration/schema inspection, Edge Function contract review, manager-page review, test/workflow review, a clean local CI-equivalent execution, and hosted CI/deployment verification. This file is updated as each group reaches the release evidence standard; no `Partial` rows are permitted at final handoff.
