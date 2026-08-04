# AI Operations Hub — Complete Production Build Specification

**Product name:** AI Operations  
**Repository owner:** `Matthew-Irving5`  
**Canonical repository name:** `ai-operations`  
**Document status:** Final build specification  
**Target Codex build model:** `gpt-5.6-terra`  
**Target Codex reasoning effort:** `medium`  
**Codex execution mode:** Goal Mode  
**Primary timezone:** `Europe/London`  
**Primary application user and Google data owner:** `matthewirving99@gmail.com`  
**Notification recipient:** `Matthew.irving.ai@gmail.com`  
**Production URL:** Free Cloudflare-generated hostname; do not require or assume a purchased domain  
**Scope:** Full production system. This is not an MVP and no feature in this specification is optional unless explicitly marked “optional” or “experimental”.

---

## 0. How Codex must use this specification

This file is the authoritative product, architecture, security, testing, and delivery contract.

Codex must:

1. Read this entire file, `AGENTS.md`, and the active pass prompt before changing code.
2. Treat stated decisions as locked. Do not replace the stack or reduce scope because another implementation would be faster.
3. Resolve ordinary implementation details independently using current primary-source documentation through the configured MCPs.
4. Never ask the user to choose between routine engineering alternatives. Select the option that best satisfies this specification and record the decision in an ADR.
5. Stop only for a genuine external blocker that cannot be solved in code, such as a missing secret, unavailable provider resource, or denied permission.
6. Build production-grade functionality during each pass. Do not create placeholders, fake implementations, “coming soon” pages, TODO-only modules, or mock-only production paths.
7. Use synthetic fixtures in development and CI. Never put real personal, financial, health, credential, or work data in the repository.
8. Keep every completed pass independently deployable and regression-tested.
9. Follow the branch, pull-request, CI, auto-merge, and compaction protocol defined in Section 31.
10. Never inspect, clone, query, or modify a repository owned by BrightSG. Runtime GitHub access is restricted to repositories owned by `Matthew-Irving5`.

---

# 1. Product vision

AI Operations is a private, single-user, always-on personal operations control plane.

It must:

- collect data automatically from connected services and devices;
- run scheduled and on-demand AI operations managers without the user’s PC being online;
- retain complete historical evidence efficiently;
- use AI only where reasoning adds value;
- use deterministic code for collection, validation, calculations, thresholds, scheduling, and cost control;
- send useful outputs and action requests by email;
- expose complete visibility over schedules, queues, AI calls, costs, decisions, feedback, and results;
- provide a secure site from which the user can configure managers, inspect reports, approve sensitive actions, and launch bounded on-demand work;
- queue local-PC operations until the registered Windows worker is online;
- optimise model choice and prompt quality using measured cost, user feedback, and evaluation results.

The platform is not a conversational toy and must not require the user to repeatedly explain context. It is a durable operational system whose quality improves as historical data accumulates.

---

# 2. Product principles

## 2.1 Low-effort operation

Preferred data acquisition order:

1. Direct service API or webhook.
2. Scheduled device/app export.
3. Gmail or Google Drive routing.
4. One-file upload.
5. One-tap approval or short structured form.
6. Manual recurring entry only when automation is genuinely unavailable.

Routine successful collection jobs must remain silent. Email only when a planned report is due, an action is required, a meaningful exception exists, or a user-configured notification rule is met.

## 2.2 Deterministic before generative

Use normal code for:

- date calculations;
- schedules;
- token and currency arithmetic;
- expected/actual cost calculations;
- aggregation;
- deduplication;
- validation;
- data freshness;
- threshold alerts;
- permissions;
- action state machines;
- file hashing;
- transaction balancing;
- health trends and moving averages;
- retry policies.

Use an AI model for:

- synthesis;
- interpretation;
- prioritisation;
- narrative reports;
- research;
- ambiguous categorisation;
- recommendations;
- feedback analysis;
- exception explanation.

## 2.3 Evidence and provenance

Every generated finding must be traceable to:

- source records;
- source files or URLs;
- collection timestamps;
- prompt version;
- model;
- tool calls;
- validation results;
- cost;
- final user feedback.

No manager may present an unsupported factual claim as certain.

## 2.4 Reversible automation

- Read-only analysis may run automatically.
- Low-risk, explicitly permitted actions may run automatically.
- Material calendar changes, outbound messages other than configured notifications, file reorganisation, budget changes, data exports, and destructive operations require approval.
- Local file deletion is never immediate; files enter quarantine first.

## 2.5 Single-user security

The system is designed for exactly one production user. Public sign-up, guest access, shared workspaces, team roles, and anonymous access are out of scope.

## 2.6 Historical retention

Retain source data and outputs by default. Optimise storage through compression, partitioning, content addressing, and tiering rather than deleting history.

---

# 3. Locked product boundaries

## Included operations managers

1. Finance Operations
2. Career Operations
3. Personal Operations
4. Health & Performance Operations
5. Personal Systems & Automation
6. Digital Estate, Device & Security Operations
7. Travel Planning Operations
8. Consumer & Procurement Operations

## Explicitly excluded

- AI-managed social relationships or conversation tracking.
- Automated messages to friends, colleagues, recruiters, or professional contacts.
- Codex project-pass automation as a runtime Career Operations feature.
- Financial transactions, investment execution, or autonomous purchases.
- Medical diagnosis or treatment decisions.
- Unsupported/private Apple API scraping.
- Any BrightSG repository or work-owned source.
- A purchased custom domain.
- Public or multi-user product features.

---

# 4. Final architecture

```text
iPhone apps, Apple Health, Apple Calendar/Reminders, Gmail, Google Calendar,
Google Drive, GitHub, uploaded documents, external research sources
                                  |
                                  v
                     Secure ingestion adapters
                                  |
                                  v
    Cloudflare Pages/Workers + Supabase Edge Functions and Postgres
        |                  |                      |
        |                  |                      +--> Cloudflare R2 archive
        |                  +--> Scheduler / queues / AI runtime
        +--> Next.js private dashboard
                                  |
                                  v
                     OpenAI Responses API agents
                                  |
                    results, actions, traces, costs
                                  |
                 +----------------+----------------+
                 |                                 |
                 v                                 v
        Gmail notification emails         Windows local worker queue
                                                   |
                                         PC online: inspect/execute
                                                   |
                                                   v
                                           results returned
```

## 4.1 Always-on cloud responsibilities

The cloud control plane must work while the user’s PC is off. It owns:

- authentication;
- data storage and archive indexing;
- schedules;
- job queue;
- API integrations;
- AI calls;
- cost controls;
- reports;
- email notifications;
- tracing;
- approvals;
- feedback;
- dashboard;
- local-worker task queue.

## 4.2 Local worker responsibilities

The Windows worker owns only local-device work:

- file inventories;
- duplicate hashing;
- storage and software audits;
- Windows security status;
- proposed file moves;
- approved file moves and quarantine;
- result reporting.

No inbound port may be exposed on the PC. The worker initiates outbound HTTPS polling.

---

# 5. Technology stack

## 5.1 Monorepo

Use a `pnpm` workspace with Turborepo.

```text
ai-operations/
├── apps/
│   ├── web/                         # Next.js web application
│   └── windows-worker/              # Python Windows agent
├── packages/
│   ├── contracts/                   # Zod schemas and generated types
│   ├── db/                          # typed database access and generated DB types
│   ├── ui/                          # reusable design-system components
│   ├── ai-runtime/                  # prompts, routing, cost calculator, validators
│   ├── manager-core/                # workflow framework and manager interfaces
│   ├── integrations/                # shared integration clients
│   ├── observability/               # trace, audit, metric helpers
│   ├── test-fixtures/               # synthetic fixtures
│   └── config/                      # lint, TS, formatting configuration
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── tests/
│   ├── seed.sql
│   └── config.toml
├── infrastructure/
│   ├── cloudflare/
│   ├── github/
│   └── scripts/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── build/
│   ├── operations/
│   ├── security/
│   └── onboarding/
├── tests/
│   ├── e2e/
│   ├── ai-evals/
│   ├── performance/
│   └── security/
├── .github/workflows/
├── .codex/config.toml
├── AGENTS.md
├── AI_OPERATIONS_BUILD_SPEC.md
├── CODEX_PASS_PROMPTS.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## 5.2 Web

- Next.js 16.2 or the latest stable 16.x release verified at Pass 1.
- App Router.
- TypeScript strict mode.
- React Server Components where compatible with Cloudflare deployment.
- Tailwind CSS.
- shadcn/ui primitives stored in `packages/ui`.
- TanStack Query for client-side server-state orchestration.
- TanStack Table for dense grids.
- React Hook Form + Zod for forms.
- Apache ECharts for interactive time-series and analytical charts.
- `date-fns` with explicit `Europe/London` timezone handling.
- No Vercel dependency.
- Deploy through the supported Cloudflare/OpenNext adapter.
- The application must remain usable on iPhone Safari and desktop Chrome/Edge.

## 5.3 Backend

Use Supabase as the core backend:

- PostgreSQL;
- Supabase Auth;
- Row Level Security;
- Supabase Cron;
- Supabase Edge Functions written in TypeScript/Deno;
- Supabase Vault where appropriate;
- database functions and transactional job claiming.

Use Cloudflare Workers only where they provide a clear platform benefit:

- frontend deployment/runtime adapter;
- R2-bound archive gateway if direct S3-compatible access is not appropriate;
- lightweight request filtering/rate limiting;
- optional scheduled fallback health check.

Do not introduce a permanently hosted FastAPI service. A separate always-on Python backend conflicts with the zero-cost cloud requirement. Python remains the language for the Windows worker, archival utilities, data science helpers, and offline scripts.

## 5.4 Data and archive

- Supabase PostgreSQL: operational and queryable records.
- Cloudflare R2: raw files, compressed historical payloads, immutable archives, full trace payloads, snapshots, backups.
- Object compression:
  - JSON/NDJSON: Zstandard where client/runtime supports it; otherwise gzip.
  - Analytical partitions: Parquet + Zstandard.
  - Original user files: retain exact bytes; optionally wrap in encrypted archive for backups.
- Content hashes: SHA-256.
- All R2 buckets private.
- The database stores object keys, hashes, sizes, MIME types, encryption metadata, provenance, and retention class.

## 5.5 AI

- OpenAI Responses API.
- Official OpenAI TypeScript SDK.
- Structured Outputs with strict JSON Schema for every production manager call.
- Web search tool only when a workflow requires current external information.
- Background mode and webhooks for long-running research or analysis.
- Prompt caching with explicit breakpoints and stable cache keys.
- Batch API for non-urgent scheduled bulk tasks where 24-hour completion is acceptable.
- No Assistants API.
- No unbounded model loops.

## 5.6 Testing

- Vitest for TypeScript unit tests.
- Deno test for Edge Functions.
- pgTAP and SQL tests for database functions/RLS.
- Pytest for Windows worker.
- Playwright 1.62 or latest stable verified at Pass 1.
- Playwright MCP for interactive frontend investigation during development.
- axe-core accessibility checks.
- Promptfoo or a similarly transparent repository-owned harness for AI evaluations.
- k6 for API load and concurrency smoke tests.
- CodeQL, dependency review, secret scanning, and static analysis in GitHub Actions.

---

# 6. Environments

## 6.1 Development

- Next.js local development.
- Local Supabase via CLI/Docker.
- Local R2-compatible storage through MinIO or a test adapter.
- Mock Google, Apple bridge, Gmail, OpenAI, GitHub, and Health exporters.
- Synthetic data only.
- OpenAI live calls disabled by default and enabled explicitly with a development key.
- No production credentials.

## 6.2 Staging

- Hosted staging Supabase project where free allocation permits.
- Separate R2 staging bucket.
- Separate Google OAuth redirect.
- Separate OpenAI project/key and low hard limit.
- Cloudflare preview/staging deployment.
- Synthetic and deliberately anonymised fixtures only.
- No production personal data copied into staging.
- E2E and integration smoke tests run here.

If a second hosted Supabase project cannot remain within the free plan, staging must be ephemeral:
- create from migrations for release testing;
- seed synthetic data;
- destroy or pause after validation;
- never share production tables or credentials.

## 6.3 Production

- Dedicated hosted Supabase project.
- Dedicated private R2 buckets.
- Dedicated OpenAI project.
- Dedicated Google OAuth credentials.
- Cloudflare-generated production hostname.
- Only the allowlisted production user.
- Production schedules disabled until the onboarding acceptance checklist passes.

## 6.4 Configuration rules

- Every environment has separate secrets and resource identifiers.
- Environment values are validated at boot with Zod.
- Missing required values fail closed with an actionable diagnostic.
- The frontend receives only public Supabase configuration and non-sensitive feature flags.
- Service-role, OpenAI, Gmail OAuth, R2 write, encryption, and signing secrets remain server-side.

---

# 7. Authentication and authorisation

## 7.1 User identity

Production permits one account only:

```text
matthewirving99@gmail.com
```

The notification recipient is not automatically an application user:

```text
Matthew.irving.ai@gmail.com
```

## 7.2 Authentication flow

- Supabase email/password authentication.
- Public sign-up disabled.
- User created by secure invite or administrator seed process.
- TOTP MFA mandatory using Microsoft Authenticator.
- A session must reach `aal2` before any authenticated application route is displayed.
- Login page is the only unauthenticated application page.
- Password reset is allowed only for the allowlisted email.
- Authentication errors must not disclose whether arbitrary emails exist.
- Refresh tokens use secure, HttpOnly, SameSite cookies through the supported Next.js Supabase SSR integration.

## 7.3 Reauthentication

Require a fresh MFA challenge completed within the previous five minutes for:

- changing recurring target or hard spend caps;
- changing on-demand budget policy;
- changing API credentials or connection scopes;
- approving any local-PC action manifest;
- approving deletion/quarantine purge;
- exporting health, finance, audit, or full-history data;
- registering or revoking a worker device;
- changing authentication settings;
- enabling a destructive automation permission;
- raising a per-run budget over its configured safety threshold.

## 7.4 Row Level Security

- Enable RLS on every table in exposed schemas.
- Default deny.
- User-owned rows include `user_id`.
- Policies compare `auth.uid()` to `user_id`.
- Service operations use narrowly scoped Edge Functions.
- Browser code never receives the service-role key.
- Add automated tests proving:
  - unauthenticated access fails;
  - an arbitrary second synthetic user cannot access the primary user’s rows;
  - AAL1 sessions cannot execute AAL2-protected database functions;
  - direct table writes cannot bypass business validation.

## 7.5 Application authorisation

Use explicit capability checks, not merely hidden buttons.

Capabilities include:

- `view_sensitive_data`
- `configure_managers`
- `change_budget`
- `launch_on_demand_run`
- `approve_local_plan`
- `export_data`
- `manage_connections`
- `manage_devices`

The sole user receives all capabilities only after AAL2.

## 7.6 Security headers and browser protections

Configure:

- strict Content Security Policy with nonces;
- `frame-ancestors 'none'`;
- HSTS where supported by the generated hostname;
- `X-Content-Type-Options: nosniff`;
- restrictive Referrer Policy;
- Permissions Policy;
- SameSite cookies;
- CSRF protection for state-changing web actions;
- origin validation;
- rate limiting for login, OAuth callback, AI launch, feedback, export, and worker endpoints.

## 7.7 Audit trail

Every sensitive action records:

- immutable event ID;
- user ID or worker device ID;
- action type;
- target type and ID;
- timestamp;
- IP-derived coarse metadata where available;
- user agent;
- AAL;
- correlation ID;
- before/after redacted values;
- result;
- reason or approval note.

Audit records cannot be edited through the application.

---

# 8. Secrets and cryptography

## 8.1 Never store in source control

- OpenAI API keys.
- Supabase service-role keys.
- Google OAuth client secrets and refresh tokens.
- R2 secret keys.
- Gmail tokens.
- application encryption keys.
- worker signing keys.
- production database passwords.

## 8.2 Token encryption

Google refresh tokens and other long-lived provider tokens must be encrypted before database storage using envelope encryption:

- a server-side master key stored in environment/Vault;
- a random per-record data key;
- authenticated encryption such as XChaCha20-Poly1305 or AES-256-GCM;
- key version stored with the ciphertext;
- rotation support;
- never log plaintext tokens.

## 8.3 Worker trust

Each Windows worker device has:

- a generated Ed25519 key pair;
- private key stored in Windows Credential Manager or DPAPI-protected storage;
- public key registered in the platform;
- revocable device record;
- signed outbound results;
- server-signed action manifests;
- nonce and expiry protection.

Pairing uses a one-time, short-lived code displayed in the site after fresh MFA.

---

# 9. Data classification

| Class | Examples | Rules |
|---|---|---|
| Public/reference | public product specifications, job postings, cited web sources | may appear in normal traces |
| Internal | workflow configuration, schedules, non-sensitive metrics | authenticated access |
| Confidential | calendar details, career records, purchase history, PC metadata | encrypted in transit, private storage |
| Highly sensitive | bank statements, financial transactions, health samples, address, OAuth tokens | least privilege, redacted traces, export MFA |
| Secret | API keys, encryption keys, worker private keys | never stored in normal DB/logs or browser |

Every table, R2 prefix, and trace field must declare a classification in documentation.

---

# 10. Storage and retention design

## 10.1 PostgreSQL stores

- current operational state;
- normalised and indexed records;
- schedules and queues;
- summaries and derived metrics;
- report text and metadata;
- actions and approvals;
- AI cost records;
- traces metadata;
- feedback;
- object references.

## 10.2 R2 stores

- original uploaded files;
- immutable ingestion payloads;
- Apple Health export files;
- source statement PDFs/CSVs;
- PC inventory snapshots;
- full AI request/response payloads after redaction/encryption;
- report exports;
- monthly Parquet partitions;
- encrypted database backups.

## 10.3 R2 key convention

```text
{environment}/{user_id}/{domain}/{yyyy}/{mm}/{dd}/{object_type}/{sha256-prefix}/{uuid}-{safe-name}
```

Examples:

```text
prod/<user>/health/2026/08/01/raw-health-export/ab/<uuid>.json.zst
prod/<user>/finance/2026/08/03/statement/0f/<uuid>.pdf
prod/<user>/ai-traces/2026/08/03/response-payload/42/<uuid>.json.zst
prod/<user>/digital-estate/2026/08/31/inventory/7a/<uuid>.parquet
```

## 10.4 Retention policy

Default: retain indefinitely unless the user explicitly changes policy.

- Raw source imports: permanent archive.
- Approved reports: permanent.
- AI traces: permanent metadata; full payload archived.
- Audit events: permanent.
- Health raw samples: permanent.
- PC inventory: retain full monthly snapshots; weekly snapshots may be delta-compressed after twelve months.
- Temporary parsing files: delete after successful verified archive and checksum.
- Quarantined local files: 30 days by default, configurable only with MFA.
- Failed upload fragments: purge after seven days if no source record references them.

## 10.5 Efficient ageing

Monthly archival process:

1. Select closed partitions older than the configured hot window.
2. Export to Parquet with Zstandard compression.
3. Calculate record count, min/max timestamp, schema version, and hash.
4. Upload to R2.
5. Verify by re-reading a sample and checksum.
6. Store archive manifest.
7. Retain daily/monthly aggregates in Postgres.
8. Remove detailed hot rows only when:
   - archive verification succeeded;
   - the record type is configured as archivable;
   - the operation is transactional and logged.
9. Retrieval service transparently reads hot Postgres data plus archived partitions when a report requires older detail.

Default hot windows:

- high-frequency health samples: 12 months;
- detailed AI tool-call payloads: 6 months;
- PC file rows: latest full snapshot plus 3 months of deltas;
- finance transactions: remain hot;
- reports, costs, schedules, feedback, actions: remain hot.

## 10.6 Backups

- Daily Supabase database logical backup or export according to plan capability.
- Weekly encrypted application-level export to R2.
- Monthly restore drill in staging using synthetic or encrypted data.
- R2 object manifests checked weekly for missing objects.
- Backup status appears in Digital Estate and Systems dashboards.

---

# 11. Core database schema

Codex must implement migrations with constraints, indexes, comments, RLS, and seed values. Use UUID primary keys, `timestamptz`, `created_at`, `updated_at`, and explicit enums/check constraints.

The following is the minimum schema. Codex may add join or support tables but must not omit these concepts.

## 11.1 Identity and profile

### `app_users`
- `id uuid primary key references auth.users`
- `email citext unique not null`
- `display_name text`
- `timezone text not null default 'Europe/London'`
- `is_allowed boolean not null default false`
- `created_at`, `updated_at`

### `personal_profiles`
- `user_id uuid primary key`
- `date_of_birth date`
- `home_location_id uuid`
- `work_location_id uuid`
- `career_summary text`
- `planning_preferences jsonb`
- `notification_preferences jsonb`
- `privacy_preferences jsonb`
- highly sensitive fields encrypted where appropriate

### `locations`
- `id`, `user_id`
- `label`
- encrypted `address`
- optional latitude/longitude
- `location_type`
- `default_travel_minutes`
- `default_preparation_minutes`

### `time_preferences`
- `id`, `user_id`
- weekday
- preferred focus windows
- guaranteed busy windows
- preferred training windows
- quiet hours
- maximum focus duration
- minimum evening buffer

## 11.2 Manager and workflow framework

### `managers`
- stable code: `finance`, `career`, `personal`, `health`, `systems`, `digital_estate`, `travel`, `procurement`
- name
- description
- enabled
- configuration JSON
- risk class

### `workflow_definitions`
- manager ID
- stable code
- version
- trigger type
- default model route
- default reasoning
- budget category
- required sources
- input schema
- output schema
- notification policy
- approval policy
- active flag

### `workflow_schedules`
- workflow definition ID
- cron expression
- timezone
- next due timestamp
- enabled
- catch-up policy
- maximum lateness
- run window
- priority
- configuration overrides

### `workflow_runs`
- definition/version
- schedule or on-demand request ID
- status
- trigger
- requested/started/completed timestamps
- priority
- correlation ID
- idempotency key
- input snapshot reference
- output report ID
- budget reservation ID
- error code and redacted error
- retry count

### `run_steps`
- run ID
- sequence
- step code
- status
- started/completed
- input/output references
- trace ID
- error
- retry metadata

### `job_queue`
- job type
- payload
- priority
- available at
- lease owner and expiry
- attempt count
- maximum attempts
- status
- deduplication key

### `actions`
- manager/run
- action type
- title
- description
- risk class
- status
- target date
- proposed payload
- execution result
- source evidence

### `approvals`
- action/run
- approval type
- required AAL
- requested/decided timestamps
- decision
- user note
- payload hash
- expiry

### `reports`
- manager/run
- report type
- period start/end
- title
- summary
- markdown
- structured metrics
- status: draft/validated/approved/superseded
- R2 export object
- prompt/model version

### `report_sections`
- report ID
- stable section code
- title
- order
- content
- structured data
- evidence references

## 11.3 AI runtime and cost

### `ai_model_catalog`
- provider
- model ID
- model family/tier
- enabled
- supported tools
- max context/output
- default reasoning
- quality notes

Seed:
- `gpt-5.6-luna`
- `gpt-5.6-terra`
- `gpt-5.6-sol`

### `model_pricing`
- model ID
- effective from/to
- input per million
- cached input per million
- cache write multiplier/rate
- output per million
- web search per call
- batch/flex multiplier
- currency USD
- source URL and verified timestamp

### `prompt_templates`
- manager/workflow
- stable code
- active version

### `prompt_versions`
- template ID
- version
- system text
- developer text
- JSON schema
- cache breakpoint configuration
- changelog
- evaluation status
- promoted timestamp

### `ai_calls`
- run/step
- model
- reasoning effort
- service tier
- request ID
- response ID
- status
- requested/finished
- estimated input/output/search calls
- actual input tokens
- cached input tokens
- cache write tokens
- output/reasoning tokens
- search calls
- estimated cost
- actual cost
- variance
- prompt version
- trace object reference
- provider error code
- retry/fallback relationship

### `ai_tool_calls`
- AI call ID
- tool type
- sequence
- request summary
- source/citation metadata
- cost
- latency
- status

### `monthly_budgets`
- month
- recurring target default `5.00`
- recurring hard cap default `10.00`
- provider backstop informational value
- reserve percentage
- currency USD
- actual recurring
- actual on-demand
- forecast fields
- locked/version

### `on_demand_budgets`
- run request ID
- manager
- user-entered hard cap
- reserved amount
- actual amount
- model ceiling
- search ceiling
- escalation allowed
- expires
- status

### `cost_reservations`
- run
- category recurring/on-demand
- reserved amount
- released amount
- consumed amount
- status
- estimate version

### `spend_forecasts`
- calculated at
- month
- actual spend to date
- expected spend for completed calls
- original expected full-month spend
- remaining queued/scheduled estimate
- variance factor
- variance-adjusted month-end forecast
- confidence interval
- method version

## 11.4 Observability, audit, and feedback

### `audit_events`
immutable append-only events.

### `trace_events`
- correlation/run/step/call
- event type
- timestamp
- severity
- redacted payload
- R2 full payload reference

### `feedback_categories`
- workflow and section-specific categories
- label
- active

### `feedback`
- report/call/section
- thumbs up/down
- category IDs
- free-text comment
- created at
- reviewed status

### `quality_review_runs`
- period
- feedback sample
- detected patterns
- recommended changes
- approved changes
- before/after prompt/model versions
- evaluation results

### `data_freshness`
- source
- last source timestamp
- last successful sync
- expected cadence
- state
- stale reason

### `notifications`
- type
- recipient
- subject
- body reference
- status
- Gmail message ID
- sent timestamp
- dedupe key

## 11.5 Integration and ingestion

### `connections`
- provider
- account label
- status
- encrypted credential reference
- scopes
- last verified
- configuration
- error

### `sync_cursors`
- connection
- dataset
- cursor/token
- last sync

### `webhook_events`
- provider
- external ID unique
- received at
- signature verified
- status
- payload R2 reference

### `ingestion_batches`
- source
- period
- status
- record counts
- raw object
- schema version
- checksum
- validation report

### `source_objects`
- R2 key
- hash
- size
- MIME
- data classification
- source
- created/captured timestamps
- encryption metadata
- archive state

## 11.6 Manager-specific tables

Implement the following table families with normalised relations and documented indexes:

### Finance
- `financial_accounts`
- `statement_imports`
- `transactions`
- `transaction_categories`
- `transaction_category_rules`
- `finance_periods`
- `finance_close_checks`
- `finance_exceptions`
- `finance_metrics`
- `finance_forecasts`
- `finance_approvals`

### Career
- `github_repositories`
- `github_activity`
- `career_evidence`
- `career_projects`
- `skills`
- `skill_evidence`
- `career_goals`
- `job_opportunities`
- `market_snapshots`
- `career_risks`
- `career_documents`

### Personal
- `calendar_events`
- `reminders`
- `routines`
- `commitments`
- `daily_plans`
- `time_blocks`
- `waiting_items`
- `planning_exceptions`

### Health
- partitioned `health_samples`
- `health_daily_summaries`
- `workouts`
- `running_sessions`
- `running_splits`
- `strength_sessions`
- `strength_sets`
- `nutrition_daily`
- `sleep_daily`
- `body_measurements`
- `health_goals`
- `training_blocks`
- `training_plan_items`
- `health_experiments`
- `health_exceptions`

### Digital Estate
- `worker_devices`
- `worker_heartbeats`
- `device_scans`
- `file_inventory_objects`
- `file_current_state`
- `duplicate_groups`
- `installed_software`
- `security_findings`
- `organisation_plans`
- `file_actions`
- `quarantine_items`

### Travel
- `trips`
- `trip_requirements`
- `trip_options`
- `bookings`
- `itinerary_items`
- `travel_checks`
- `travel_price_watches`
- `travel_sources`

### Procurement
- `purchase_requests`
- `purchase_requirements`
- `product_candidates`
- `procurement_sources`
- `procurement_recommendations`
- `purchases`
- `return_windows`
- `warranties`
- `procurement_price_watches`

---

# 12. Scheduler and orchestration

## 12.1 Scheduler

Use Supabase Cron to invoke a `scheduler-dispatch` Edge Function every five minutes.

The dispatcher must:

1. acquire a database advisory lock;
2. identify due enabled schedules using `FOR UPDATE SKIP LOCKED`;
3. account for `Europe/London`, daylight saving, lateness, and catch-up policy;
4. create idempotent workflow runs and jobs;
5. calculate and reserve expected AI cost before any AI step;
6. defer optional work when the recurring target is likely to be exceeded;
7. reject recurring work when the recurring hard cap would be exceeded;
8. never count on-demand reservations against the recurring hard cap;
9. release the lock quickly;
10. avoid fan-out inside one Edge Function execution by queueing downstream work.

## 12.2 Job processing

Implement a lease-based queue:

- workers claim one or a bounded batch of jobs;
- lease expires automatically;
- retries use exponential backoff with jitter;
- poison jobs move to dead-letter state;
- idempotency keys prevent duplicate reports, emails, and AI calls;
- every transition emits a trace event.

## 12.3 Long AI work

For long research/analysis:

1. create OpenAI Responses API request with `background=true`;
2. store request/response IDs;
3. return control to the worker;
4. receive signed OpenAI webhook;
5. verify webhook signature and deduplicate;
6. retrieve final response promptly;
7. validate structured output;
8. continue workflow;
9. email or request approval as configured.

Fallback polling may run if the webhook is delayed, but it must be bounded.

## 12.4 Batch work

Use Batch API only for work that can complete within 24 hours:

- monthly archival summarisation;
- bulk historical classification;
- non-urgent evaluation suites;
- cost-effective backfills.

Do not use Batch for morning plans, urgent alerts, approvals, or on-demand interactive runs.

## 12.5 Default schedules

All schedules are configurable in the site. Seed these defaults:

| Workflow | Default schedule |
|---|---|
| Personal morning plan | daily 07:15 |
| Personal midday exception check | weekdays 12:30 |
| Personal evening close | daily 19:30 |
| Personal weekly plan | Sunday 18:00 |
| Apple bridge freshness check | daily 06:30 |
| Health previous-day processing | daily 06:45 |
| Health weekly review | Sunday 17:00 |
| Health monthly composition review | first Sunday monthly 17:30 |
| Systems daily cost/capacity review | daily 06:00 |
| Systems weekly quality/platform review | Sunday 16:00 |
| Systems monthly cost report | first day monthly 08:30 |
| Career evidence sync | daily 05:30 |
| Career weekly pulse | Monday 07:00 |
| Career monthly market-value report | first Monday monthly 07:00 |
| Finance close dispatcher | daily 08:00 |
| Finance monthly close | third day monthly 07:00, subject to readiness |
| Digital Estate lightweight check | worker-local weekly when online |
| Digital Estate deep audit | on demand or last configured surplus window monthly |
| Travel | on demand; selected watches configurable |
| Procurement | on demand; selected watches configurable |

If a schedule is missed because a provider was unavailable, apply its explicit catch-up policy. Never send a stale morning plan after midday.

---

# 13. AI runtime

## 13.1 Model routing

Default model policy:

| Work type | Default |
|---|---|
| routing, extraction, classification, freshness, concise summaries | `gpt-5.6-luna`, low/medium reasoning |
| weekly/monthly interpretation, product/travel research, complex planning | `gpt-5.6-terra`, medium reasoning |
| high-consequence quarterly strategy or escalation after failed validation | `gpt-5.6-sol`, medium/high reasoning |

No workflow may choose Sol merely because more budget remains. Escalation requires a recorded reason.

## 13.2 Runtime call contract

Every AI step supplies:

- manager identity and bounded mission;
- exact task;
- relevant structured records only;
- period and timezone;
- source/evidence references;
- explicit uncertainty requirements;
- allowed tools;
- search limit;
- output JSON Schema;
- maximum output tokens;
- cost reservation;
- prohibited actions;
- current prompt version.

Every output must include, at minimum:

```json
{
  "summary": "string",
  "findings": [],
  "recommendations": [],
  "actions": [],
  "alerts": [],
  "evidence": [],
  "uncertainties": [],
  "report_sections": []
}
```

Use workflow-specific strict schemas rather than one loose schema.

## 13.3 Prompt design

- Stable manager policy at the beginning.
- Dynamic data at the end.
- Explicit cache breakpoint after stable policy and schemas.
- Unique prompt cache key by manager, workflow, prompt version, and model.
- Never send complete history when aggregates and evidence retrieval can answer the task.
- Retrieval layer selects relevant summaries and raw records.
- Prompt must state the difference between measured data, inference, and recommendation.
- Prompt injection from emails, files, web pages, and repository text must be treated as untrusted data and never as system instructions.

## 13.4 Validation

Before accepting a model output:

- JSON Schema validation;
- cited evidence IDs must exist and belong to the run’s permitted data set;
- numerical claims are recalculated where possible;
- dates and currencies validated;
- action types must be allowlisted;
- estimated cost must remain within reservation;
- report section codes must match the workflow;
- health/finance safety rules checked;
- current web research must include source URLs and timestamps.

Invalid output:
1. retry once with a schema-repair prompt on the same economical model;
2. if still invalid, escalate according to workflow policy;
3. if still invalid, fail safely and notify only when user action is required.

## 13.5 Web research

Enable web search only for workflows that need current public data:

- Career market research;
- Travel;
- Procurement;
- selected current policy or service checks.

Each run has:
- maximum search actions;
- allowed/blocked domains where practical;
- source-quality requirements;
- publication/event date comparison;
- citation retention.

Finance and Health do not search the web by default. A health workflow may retrieve authoritative general guidance only when explicitly configured; it must not diagnose.

---

# 14. AI budgeting and forecasting

## 14.1 Budget categories

### Recurring
- target monthly spend default: `$5.00`
- hard cap default: `$10.00`
- all regular schedules draw from this category

### On-demand
- Travel, Procurement, Digital Estate deep analysis, and any manually launched manager run
- user must set or accept a per-run hard cap before launch
- excluded from recurring target/hard-cap enforcement
- included in combined actual spend and amortised reviews

### Provider backstop
- OpenAI project hard limit configured outside the app
- displayed in settings
- app never claims it can raise this automatically without an administrator key and explicit MFA

## 14.2 Reservation

Before starting an AI call, calculate worst-reasonable expected cost using:

- estimated uncached input;
- cached input and cache-write assumptions;
- maximum output;
- reasoning allowance;
- search call ceiling;
- service-tier multiplier;
- retry allowance.

Reserve that amount atomically.

A call cannot start if:
- recurring reservation would exceed recurring hard cap;
- on-demand reservation would exceed that run’s cap;
- no model downgrade within quality policy can satisfy the budget;
- provider backstop is too close for the configured reserve.

## 14.3 Headline metrics

The AI Spend & Forecasting page must headline:

1. **Actual spend to date**  
   Sum of actual costs for completed calls this month.

2. **Expected spend to date**  
   Sum of pre-run estimates for those same completed calls. This allows direct estimate-versus-actual comparison.

3. **Original expected month-end spend**  
   Sum of original estimates for every completed, active, queued, and scheduled recurring run expected this month, using the schedule state at calculation time.

4. **Variance-adjusted estimated month-end spend**  
   Actual spend to date plus remaining queued/scheduled estimates multiplied by a smoothed observed variance factor.

Use:

```text
raw_variance_factor =
  actual_spend_for_completed_calls /
  expected_spend_for_completed_calls

smoothed_variance_factor =
  weighted mean of:
    current month raw factor (weight increases with completed calls)
    trailing 90-day workflow-specific factor
    neutral factor 1.0

adjusted_month_end_forecast =
  actual_spend_to_date
  + sum(remaining estimates * applicable smoothed factor)
```

Cap individual workflow factors to a configurable range such as `0.5–3.0` to prevent one anomaly from destroying the forecast. Show confidence based on sample size.

Also display:
- recurring actual;
- on-demand actual;
- combined total;
- remaining recurring target;
- remaining recurring hard cap;
- reserved but unspent;
- provider-reported total where available;
- amortised on-demand monthly average.

## 14.4 Automatic controls

At 75% of target:
- prefer Luna for eligible routine work;
- reduce output verbosity;
- batch non-urgent work.

At 100% of target:
- pause P3/P4 optional recurring work;
- continue P0/P1 within hard cap.

At 85% of hard cap:
- email budget warning;
- preserve reserve for Finance, Personal, and critical failures.

At hard cap:
- block recurring AI calls;
- deterministic collection continues;
- on-demand runs continue only within their separate reservation and provider backstop;
- send one deduplicated email.

## 14.5 Model pricing updates

Store versioned pricing in the database. Do not hardcode costs throughout the codebase.

Admin settings page allows:
- view active prices and source;
- import/update prices with MFA;
- run pricing validation tests;
- never silently change historical cost calculations.

Historical actual cost uses the price version effective at call time.

---

# 15. Notifications

## 15.1 Channel

All operation-manager notifications are sent by Gmail API.

Default:
- sender: `matthewirving99@gmail.com`
- recipient: `Matthew.irving.ai@gmail.com`

## 15.2 Notification policy

Send email for:

- scheduled daily/weekly/monthly user-facing reports;
- approval required;
- critical data source failure;
- budget warning;
- meaningful travel/price-watch event;
- local-PC plan ready for approval;
- local action execution completed with failures;
- security finding requiring attention.

Do not email for:
- routine successful sync;
- successful internal retry;
- empty exception scan;
- archive compaction success;
- heartbeat.

## 15.3 Email structure

Every email includes:

- clear subject prefix `[AI Operations]`;
- manager;
- reporting period;
- concise headline;
- required action and deadline, if any;
- direct authenticated site link;
- report ID/correlation ID in footer;
- no highly sensitive raw details in subject.

## 15.4 Delivery safety

- dedupe key prevents duplicate email;
- retry transient Gmail errors;
- store Gmail message ID;
- never send to arbitrary recipients from AI output;
- recipient is configured and allowlisted;
- changing it requires MFA.

---

# 16. Observability, spend, tracing, and quality UX

Implement this as first-class product functionality.

## 16.1 Operations Centre page

Headline:
- running now;
- queued;
- scheduled next 24 hours;
- failed in last 7 days;
- approvals waiting;
- stale data sources.

Views:
- live run timeline;
- queue table;
- schedule calendar;
- manager health cards;
- retries and dead-letter jobs;
- filter by manager, workflow, status, trigger, priority, environment, date.

Actions:
- cancel eligible queued run;
- retry failed run with preserved trace;
- open report;
- open approval;
- inspect correlation trace;
- launch allowed on-demand workflow.

## 16.2 AI Spend & Forecasting page

Use interactive ECharts with selectable period:
- 7 days;
- month;
- quarter;
- year;
- custom.

Required charts:
- cumulative actual vs expected;
- daily actual and estimate;
- original forecast and adjusted forecast history;
- cost by manager;
- cost by workflow;
- cost by model;
- cost by token type;
- recurring vs on-demand;
- estimate error distribution;
- cost per successful run;
- quality rating vs cost;
- search tool cost;
- cache hit/write trend.

Tables:
- most expensive calls;
- largest estimate misses;
- budget reservations;
- pricing versions.

## 16.3 AI Traces & Audit page

Run tree:
- workflow run;
- steps;
- AI calls;
- tool calls;
- validations;
- action proposals;
- approvals;
- notifications.

Each call detail:
- model/reasoning;
- prompt version;
- redacted input summary;
- source references;
- full token breakdown;
- expected and actual cost;
- latency;
- search queries/sources;
- structured output;
- validation;
- retry/fallback chain;
- feedback.

Full sensitive payload is separately permission-gated and requires fresh MFA.

## 16.4 Feedback & Quality page

Every meaningful AI output has:
- thumbs up;
- thumbs down;
- optional comment.

Thumbs down opens workflow-specific section categories.

Required behaviour:
- categories are tied to report sections and workflow;
- multiple categories allowed;
- freeform explanation;
- user may identify a numerical, factual, source, omission, recommendation, tone, or usability problem;
- feedback appears immediately in trace;
- feedback cannot alter production prompts directly.

Weekly/monthly Systems review:
- aggregate negative categories;
- identify repeated prompt/model/data failures;
- propose changes;
- run relevant evals;
- present recommendation;
- permit safe low-risk routing/prompt changes only through a versioned promotion workflow;
- retain before/after quality and cost.

---

# 17. Manager framework

Every operations manager implements a shared interface:

```ts
interface OperationsManager {
  code: ManagerCode;
  getWorkflowDefinitions(): WorkflowDefinition[];
  collect(context: CollectionContext): Promise<CollectionResult>;
  validateInputs(context: RunContext): Promise<ValidationResult>;
  buildContext(context: RunContext): Promise<ManagerContext>;
  execute(context: RunContext): Promise<ManagerOutput>;
  validateOutput(output: ManagerOutput): Promise<ValidationResult>;
  proposeActions(output: ManagerOutput): Promise<ActionProposal[]>;
  renderReport(output: ManagerOutput): Promise<Report>;
  determineNotifications(report: Report): Promise<NotificationRequest[]>;
}
```

Each workflow must define:
- sources;
- data freshness requirements;
- schedule/trigger;
- deterministic preprocessing;
- model route;
- search policy;
- input/output schema;
- validation;
- report sections;
- action types;
- feedback categories;
- notification rule;
- cost policy.

---

# 18. Finance Operations

## 18.1 Mission

Manage the user’s financial record, closes, analysis, forecasts, risks, and actions while never executing transactions.

## 18.2 Sources

- manually uploaded bank/credit account statements;
- Gmail-labelled statements and payslips;
- selected Google Drive finance folders;
- existing `Personal Finance Manager` Google Sheet through a configurable compatibility adapter;
- historical reports and approvals.

## 18.3 Ingestion

- Accept PDF, CSV, XLSX, OFX/QIF where parser support is reliable.
- Store original file in R2 before parsing.
- Identify institution/account/period.
- Extract transactions into strict schema.
- Deterministically validate:
  - opening + movements = closing where statement exposes balances;
  - duplicate file hash;
  - duplicate transaction candidates;
  - currency;
  - date coverage.
- Ambiguous categories may use Luna, then rules are learned only after explicit or repeated confirmed evidence.
- Never silently overwrite a corrected transaction.

## 18.4 Workflows

### Daily close dispatcher
- inspect close period state, source freshness, blockers, notification fingerprint;
- deterministic;
- Luna only if a concise explanation is needed;
- email only when configured condition becomes newly true.

### Monthly close
Default third day monthly, readiness gated.

Report sections:
1. executive summary;
2. income;
3. expenditure by category;
4. recurring commitments;
5. account reconciliation;
6. unusual or unexplained transactions;
7. cash-flow trend;
8. budget/goal progress;
9. forecast;
10. risks/blockers;
11. approvals;
12. exact next actions.

### Quarterly review
- compare three months;
- structural spending change;
- income resilience;
- savings rate;
- target adjustment;
- scenario analysis.

### Annual review
- full-year income/expenditure;
- net worth where records exist;
- major decisions and outcomes;
- next-year plan.

## 18.5 Models

- extraction/classification: Luna, strict schema;
- monthly interpretation: Terra medium;
- quarterly/annual: Sol medium only when enabled and budget allows, otherwise Terra medium with explicit quality note.

## 18.6 Feedback categories

- source/statement missing;
- transaction categorisation;
- income;
- expenditure;
- reconciliation/numerical error;
- forecast;
- recommendation;
- blocker/approval;
- writing/presentation.

## 18.7 Safety

- no payment, transfer, investment, or account-setting function;
- all financial calculations independently validated;
- report prominently marks incomplete data;
- raw statements require fresh MFA to download.

---

# 19. Career Operations

## 19.1 Mission

Increase and protect professional market value, employability, earning potential, skill depth, evidence, and opportunity awareness.

## 19.2 GitHub boundary

Runtime GitHub connector:

- may read repositories whose owner is exactly `Matthew-Irving5`;
- may not read, search, clone, or query `BrightSG`;
- read-only by default;
- any future write capability requires separate explicit specification and is currently disabled.

Every GitHub API request must validate `owner.login === 'Matthew-Irving5'`.

## 19.3 Sources

- personal GitHub repositories and activity;
- CV/portfolio documents in selected Drive folders;
- labelled Gmail evidence/recruiter/job emails;
- manually saved job descriptions;
- public job-market research;
- user-entered ambitions and target roles;
- Career evidence contributed by completed projects.

## 19.4 Workflows

### Daily evidence sync
- collect repository metadata, commits, PRs, releases, languages, test/CI evidence;
- summarise only personal contribution evidence;
- do not infer work ownership from BrightSG or inaccessible data.

### Weekly opportunity pulse
- selected current role research;
- identify a small number of high-fit opportunities/actions;
- no automatic outreach.

### Monthly market-value review
Sections:
1. current positioning;
2. evidence gained;
3. target-role readiness;
4. market demand;
5. skill gaps;
6. highest-value learning/build actions;
7. compensation range evidence;
8. risks;
9. next month priorities.

### Quarterly strategy
- 6/12/24-month route;
- role/employer options;
- specialisation risk;
- evidence plan;
- portfolio/public proof plan.

## 19.5 Capability graph

Track:
- AI/ML;
- agents;
- Python;
- TypeScript;
- backend;
- frontend;
- data engineering;
- distributed systems;
- cloud/DevOps;
- security/governance;
- testing/reliability;
- product/commercial judgement;
- technical communication/leadership.

Each skill level requires evidence references and a confidence score.

## 19.6 Models/search

- ingestion: Luna;
- weekly/monthly: Terra medium with bounded web search;
- quarterly: Terra or Sol based on policy;
- current market claims must cite sources.

## 19.7 Feedback categories

- skills/evidence;
- market data;
- salary estimate;
- role fit;
- opportunity selection;
- gap analysis;
- recommendation;
- omitted project;
- source quality.

---

# 20. Personal Operations

## 20.1 Mission

Manage time, commitments, routines, planning, administration, and cross-manager action coordination.

## 20.2 Personal Operating Profile

Settings UI must support:

- date of birth;
- home/work/common locations;
- recurring guaranteed busy blocks;
- normal work hours;
- preparation and travel buffers;
- preferred focus windows;
- preferred exercise windows;
- sleep/quiet hours;
- maximum focus block;
- minimum unscheduled buffer;
- transport preferences;
- current ambitions and projects sourced from Career;
- budget/time constraints from other managers.

Raw home address is highly sensitive. Managers receive a location ID or computed travel estimate rather than address text whenever possible.

## 20.3 Calendar and Reminder sources

### Google Calendar
- server-side OAuth;
- read selected calendars;
- write only to AI Operations-owned calendar if user enables it;
- preserve external event IDs and sync tokens.

### Apple Calendar/Reminders bridge
Because no general server-side Apple Reminders API is assumed, provide a secure Shortcut bridge:

- `POST /apple-bridge/v1/snapshot`
- device-scoped bearer token;
- accepts selected reminder lists and calendar events;
- imports completion, recurrence, due dates, notes, and stable external IDs;
- does not export unrelated lists;
- `GET /apple-bridge/v1/actions` returns approved AI Actions reminders if enabled;
- backend generates installation instructions and a test payload;
- all bridge data is idempotent.

Seed list mappings:
- `Fitness Plan` -> Health-owned routine inputs;
- `Household & Personal` -> Personal Operations;
- `AI Actions` -> optional approved action output.

## 20.4 Workflows

### Morning plan
Inputs:
- today’s calendar;
- reminders;
- deadlines;
- manager actions;
- travel/preparation requirements;
- health plan;
- waiting items;
- profile preferences.

Output email:
- first commitment/departure;
- top three outcomes;
- fixed schedule;
- flexible tasks;
- fitness item;
- household/personal item;
- risks/conflicts;
- what to defer.

### Midday exception
- no email unless material change:
  - urgent new mail;
  - event moved/cancelled;
  - missed hard deadline;
  - schedule infeasible;
  - critical manager action.

### Evening close
- unfinished items;
- tomorrow preparation;
- first commitment;
- rescheduling recommendation.

### Weekly plan
- capacity map;
- priorities;
- training;
- personal administration;
- career development;
- unresolved dependencies;
- protected rest.

## 20.5 Travel time

Implement provider interface:

1. configured common-location travel values;
2. optional Google Routes provider if credentials/billing are enabled;
3. otherwise conservative default and mark uncertainty.

Never block Personal Operations because a paid routing API is unavailable.

## 20.6 Models

- daily plans: Luna medium;
- weekly plan: Terra medium;
- deterministic conflict detection runs before AI.

## 20.7 Feedback categories

- priority;
- missing commitment;
- timing/travel;
- workload realism;
- reminder handling;
- household routine;
- career/health coordination;
- writing.

---

# 21. Health & Performance Operations

## 21.1 Mission

Support sustainable reduction in body-fat percentage and improved running ability while maintaining strength, recovery, sleep, and general health.

## 21.2 Sources

Canonical hub: Apple Health.

Expected upstream apps:
- Nothing X / CMF Watch Pro 2;
- Starfit scale;
- Strava;
- Hevy;
- Cronometer or another configured nutrition app.

## 21.3 Daily Apple Health export

The backend must expose a secure ingestion endpoint compatible with Health Auto Export or an equivalent exporter.

Every day collect the complete previous calendar day for all authorised categories, not only summaries.

Minimum categories where available:
- workouts;
- running/walking distance;
- steps;
- active energy;
- exercise time;
- heart rate;
- resting heart rate;
- heart-rate variability;
- sleep;
- oxygen saturation;
- weight;
- body-fat percentage;
- lean mass;
- BMI;
- nutrition energy/macronutrients/fibre;
- water;
- walking/running pace;
- cadence;
- elevation;
- VO2 max/cardio fitness;
- relevant mobility metrics.

Requirements:
- raw payload archived before transformation;
- source bundle/device retained;
- original and normalised units;
- revisions and deletions;
- deduplicate overlapping Strava/watch/app records;
- daily backfill window detects late writes;
- initial historical backfill supported;
- freshness alert if expected export is missing.

## 21.4 Screen Time and other iPhone data

Screen Time integration is experimental and disabled by default.

Implement:
- `screen_time_imports` adapter interface;
- capability spike documentation;
- manual CSV/JSON import if a reliable export is available;
- no private API, scraping, or unsupported entitlement usage;
- UI clearly marks availability.

Other phone-derived sources may be added only through official APIs/exports and explicit permission.

## 21.5 Deterministic analytics

Calculate without AI:
- weight trend;
- rolling averages;
- rate of change;
- waist/body measurement trend;
- running weekly volume;
- pace/heart-rate relationships;
- training monotony/load;
- personal bests;
- sleep consistency;
- strength volume and estimated progression;
- nutrition averages;
- missing-data confidence.

## 21.6 Workflows

### Daily processing
- ingest previous day;
- deduplicate;
- calculate summaries;
- no email unless data stale or an explicitly configured anomaly requires attention.

### Weekly review
Sections:
1. body-composition trend;
2. running completed vs plan;
3. strength;
4. nutrition adherence;
5. sleep/recovery;
6. next-week plan;
7. adjustments;
8. uncertainties.

### Monthly body-composition review
- trend and forecast;
- plateau analysis;
- strength retention;
- adherence;
- adjust target carefully.

### 4–6 week running block
- baseline;
- volume progression;
- easy/quality/long-run balance;
- performance indicators;
- next block.

### Quarterly strategy
- goal progress;
- sustainability;
- major experiment conclusions;
- questions for a professional where appropriate.

## 21.7 Safety

- no diagnosis;
- no treatment or medication changes;
- severe or unusual values are presented as data requiring professional review, not conclusions;
- never recommend dangerous deficits or abrupt running load jumps;
- always expose data completeness.

## 21.8 Models

- anomaly summary: Luna;
- weekly/monthly/block: Terra;
- quarterly: Terra/Sol based on routing policy.

## 21.9 Feedback categories

- body composition;
- running;
- strength;
- nutrition;
- sleep/recovery;
- data omission;
- numerical error;
- safety concern;
- plan realism.

---

# 22. Personal Systems & Automation

## 22.1 Mission

Operate the AI Operations platform itself: schedules, connectors, cost, quality, prompt/model routing, storage, reliability, and cross-manager health.

## 22.2 Responsibilities

- AI budgets and forecast;
- provider usage reconciliation;
- schedule health;
- stale sources;
- failed jobs;
- connector permissions;
- prompt/model versions;
- feedback review;
- cost/quality optimisation;
- storage growth;
- R2/Postgres capacity;
- backup/restore;
- runbooks;
- environment drift.

## 22.3 Workflows

### Daily cost/capacity
- actual vs expected;
- upcoming reservations;
- cap risk;
- failed expensive calls;
- model downgrade opportunities;
- silent unless warning.

### Weekly platform/quality
- workflow success rates;
- latency;
- estimate error;
- feedback;
- data freshness;
- prompt/model recommendations;
- email report.

### Monthly cost report
- all headline spend metrics;
- recurring/on-demand;
- amortised on-demand;
- historical comparison;
- forecast accuracy;
- storage costs;
- recommended target/cap, but never change cap automatically.

### Weekly/monthly feedback review
- map negative feedback to prompt, model, source, or validation issue;
- create versioned improvement proposal;
- run AI eval suite;
- promote only if quality gates pass.

## 22.4 Model policy

Most Systems work is deterministic. Luna summarises. Terra handles weekly/monthly quality synthesis.

## 22.5 Feedback categories

- spend calculation;
- forecast;
- platform diagnosis;
- routing recommendation;
- quality analysis;
- missing trace;
- false alert.

---

# 23. Digital Estate, Device & Security Operations

## 23.1 Mission

Manage local files, storage, software, backups, device health, and security through a secure Windows worker.

## 23.2 Worker architecture

Python 3.12+ application packaged for Windows.

Components:
- Windows service or scheduled background agent;
- system tray optional but not required;
- outbound polling;
- local SQLite state;
- cryptographic device identity;
- resumable inventory;
- action executor;
- self-update only through signed releases and explicit policy.

Polling:
- heartbeat every 15 minutes while running;
- job polling every 5 minutes while work is queued;
- exponential backoff while idle.

## 23.3 Initial inventory

Read-only scan collects:
- configured folder tree;
- file path represented by encrypted/path-token strategy in cloud where possible;
- size;
- extension;
- timestamps;
- SHA-256 for candidate duplicate sets;
- MIME guess;
- repository detection;
- uncommitted Git state;
- installed software via WinGet/registry;
- drive capacity;
- Defender status;
- firewall;
- BitLocker;
- Windows Update;
- backup freshness;
- selected startup items.

Default exclusions:
- BrightSG directories and repositories;
- work credentials;
- `.ssh` private keys;
- password-manager storage;
- browser credential stores;
- system protected directories;
- `node_modules`, virtualenvs, caches during full hashing unless explicitly needed;
- game installations unless authorised.

## 23.4 Site workflow

1. user launches on-demand scan and sets budget;
2. fresh MFA;
3. choose allowlisted folders/drives and scan type;
4. worker collects metadata when online;
5. raw inventory archived;
6. deterministic analysis identifies obvious clutter/duplicates;
7. Terra analyses ambiguous organisation groups within budget;
8. site displays proposed plan:
   - move;
   - rename;
   - archive;
   - quarantine;
   - ignore;
   - delete-after-quarantine;
9. user selects/edits actions;
10. fresh MFA approval signs immutable manifest;
11. worker verifies signature/expiry and executes;
12. every result returned;
13. failures never trigger uncontrolled retry;
14. quarantined files retained 30 days.

## 23.5 Canonical structure

The platform proposes, not blindly imposes, a structure based on:

```text
Personal/
Career/
Development/
Media/
Games/
Archive/
Temporary/
```

The real plan must be derived from existing content and preserve meaningful project structure.

## 23.6 Security

- no remote shell;
- no arbitrary command field in manifests;
- action types are strict enums;
- destination must be within approved roots;
- path traversal rejected;
- symlinks/reparse points handled safely;
- manifest contains hashes/preconditions;
- changed files are skipped and reported;
- deletion requires quarantine and separate purge approval.

## 23.7 Schedules

- low-cost local heartbeat weekly;
- deep organisation on demand;
- optional monthly surplus-budget analysis;
- security critical findings may email immediately;
- cloud tasks wait safely while PC is off.

## 23.8 Feedback categories

- file classification;
- proposed location;
- duplicate detection;
- unsafe action;
- missing folder;
- security finding;
- storage recommendation;
- software inventory.

---

# 24. Travel Planning Operations

## 24.1 Mission

Plan and monitor trips, not daily commuting.

## 24.2 Launch form

Required:
- destination or candidate destinations;
- date/date range;
- origin;
- travellers;
- budget;
- constraints;
- preferences;
- run hard cap;
- search limit;
- model ceiling.

## 24.3 Workflow

- current entry and document requirements;
- transport;
- accommodation;
- itinerary;
- local movement;
- expected cost;
- weather/season;
- risks;
- packing/document checklist;
- booking dependencies;
- source citations;
- calendar proposal.

## 24.4 Watches

User may create:
- price watch;
- disruption check;
- readiness check;
- weather check.

Each watch has:
- cadence;
- expiry;
- trigger threshold;
- individual monthly allowance or draw from the original on-demand run budget;
- email only when trigger condition changes.

## 24.5 Models

- full plan: Terra medium with web search;
- narrow check: Luna;
- no Sol by default.

## 24.6 Feedback categories

- destination fit;
- itinerary;
- cost;
- source quality;
- requirement accuracy;
- transport;
- accommodation;
- timing;
- omitted constraint.

---

# 25. Consumer & Procurement Operations

## 25.1 Mission

Ensure meaningful products and services are well specified, researched, purchased at appropriate value, and tracked through return/warranty lifecycle.

## 25.2 Launch form

- item/service;
- purpose;
- hard requirements;
- preferences;
- budget;
- required date;
- market/country;
- existing products;
- on-demand AI hard cap;
- search limit;
- model ceiling.

## 25.3 Workflow

1. convert request to weighted requirements;
2. research current candidates;
3. exclude non-compliant products;
4. compare price, total ownership cost, reliability, warranty, return policy;
5. retain citations and retrieval time;
6. output:
   - best overall;
   - best value;
   - premium only if justified;
   - reasons not to buy;
   - uncertainty;
   - purchase timing;
7. optionally create price watch;
8. after purchase, parse receipt/order email and create return/warranty reminders.

## 25.4 Models

- full research: Terra medium with web search;
- price/return checks: Luna;
- no Sol by default.

## 25.5 Feedback categories

- requirements misunderstood;
- candidate omitted;
- incorrect specification;
- price;
- source quality;
- ranking;
- recommendation unsuitable;
- warranty/returns.

---

# 26. Google integrations

## 26.1 OAuth

Use server-side OAuth 2.0 web application flow.

- state and PKCE where supported;
- encrypted refresh token;
- incremental scopes;
- explicit connection status;
- reconnect/revoke;
- no service-account impersonation of personal Gmail.

## 26.2 Scope minimisation

Implement and document exact scopes. Prefer:
- Calendar read access plus narrow event write only if needed;
- Gmail read/search and send;
- Drive file metadata/content access only to selected folders/files where API capabilities allow.

The UI must show:
- connected account;
- scopes;
- last sync;
- revoke button;
- affected workflows.

## 26.3 Gmail routing

Configurable Gmail labels:
- Finance/Statements
- Finance/Payslips
- Career/Evidence
- Career/Jobs
- Travel/Bookings
- Procurement/Orders

Sync:
- use history IDs/cursors;
- archive attachments to R2;
- preserve message/thread IDs;
- never mark read/archive/delete by default;
- sending limited to notification recipient.

## 26.4 Google Calendar

- incremental sync;
- selected calendar IDs;
- all times stored UTC plus source timezone;
- recurring events expanded only for planning horizon while recurrence rule retained;
- write operations limited to a dedicated AI Operations calendar and approval policy.

## 26.5 Google Drive

Drive is an integration source, not primary unlimited archive.

Use for:
- existing Finance system import;
- CV/portfolio documents;
- user-selected source folders;
- optional report export.

Do not assume long-term bulk storage in Drive.

---

# 27. Apple bridge and health ingestion

## 27.1 Apple bridge security

- per-device token;
- endpoint rate limit;
- device label;
- revocation;
- payload schema version;
- maximum payload size;
- idempotency key;
- replay prevention.

## 27.2 Reminder payload

Include:
- external ID;
- list;
- title;
- notes;
- due date;
- completion;
- recurrence;
- priority;
- last modified.

## 27.3 Calendar payload

Include:
- external ID;
- calendar;
- title;
- start/end;
- all-day;
- location;
- notes;
- recurrence;
- status;
- last modified.

Sensitive notes may be excluded through Shortcut configuration.

## 27.4 Health endpoint

Support:
- JSON;
- CSV bundle;
- compressed payload;
- signed/device token authentication;
- chunking;
- backfill;
- source/device metadata.

The ingestion API returns:
- accepted batch ID;
- counts;
- duplicate count;
- rejected records with reason;
- checksum.

---

# 28. API and Edge Function surface

Implement versioned endpoints/functions. Exact URL form may follow Supabase conventions.

## Authenticated user functions
- `manager-list`
- `manager-settings-get/update`
- `workflow-list`
- `workflow-run-on-demand`
- `workflow-cancel`
- `schedule-list/create/update/disable`
- `approval-list/decide`
- `report-list/get/export`
- `feedback-submit`
- `spend-summary`
- `trace-query/get`
- `connection-list/start-oauth/revoke`
- `device-register/revoke`
- `digital-scan-create`
- `digital-plan-approve`
- `data-export-request`

## Scheduler/internal
- `scheduler-dispatch`
- `job-worker`
- `openai-webhook`
- `archive-compaction`
- `quality-review`
- `notification-dispatch`

## Integrations
- `google-oauth-callback`
- `google-sync`
- `apple-bridge-ingest`
- `apple-bridge-actions`
- `health-ingest`
- `github-sync`
- `worker-poll`
- `worker-submit-result`
- `worker-heartbeat`

Every endpoint requires:
- typed request/response;
- auth policy;
- rate limit;
- idempotency where relevant;
- audit/trace;
- tests;
- documented error codes.

---

# 29. Frontend information architecture

## 29.1 Global navigation

```text
Overview
Operations
Managers
  Finance
  Career
  Personal
  Health & Performance
  Systems & Automation
  Digital Estate
  Travel
  Procurement
Reports
Approvals
Insights
  Spend & Forecasting
  AI Traces & Audit
  Feedback & Quality
Data Sources
Automations
Devices
Settings
```

## 29.2 Overview

Cards:
- today;
- urgent actions;
- next scheduled runs;
- latest reports;
- data freshness;
- actual monthly spend;
- adjusted month-end forecast;
- recurring cap;
- waiting approvals.

## 29.3 Manager pages

Each manager page includes:
- mission/status;
- current KPIs;
- latest report;
- next runs;
- sources/freshness;
- actions;
- schedule controls;
- configuration;
- run history;
- on-demand launch where allowed;
- feedback summary.

## 29.4 Responsive design

- iPhone-first responsive support;
- desktop dense analytical views;
- no horizontal overflow at 390px viewport;
- tables switch to cards or controlled horizontal scroll;
- accessible keyboard navigation;
- charts have textual summaries and data-table alternatives.

## 29.5 Visual standards

- clean professional operations-dashboard aesthetic;
- restrained palette;
- clear manager identifiers;
- status colours meet contrast;
- skeleton loading;
- meaningful empty/error states;
- no decorative animations that obscure state.

---

# 30. Testing and quality gates

## 30.1 Unit tests

Minimum:
- cost calculation;
- budget reservation;
- forecast formula;
- scheduler dates/DST;
- idempotency;
- model routing;
- validators;
- source deduplication;
- health metrics;
- finance reconciliation;
- digital plan safety;
- encryption wrappers;
- notification dedupe.

Coverage target:
- 90% lines/branches for core budget, auth, scheduler, cryptography, and local action safety;
- 80% overall meaningful code coverage;
- no coverage gaming.

## 30.2 Database tests

- migrations up/down strategy or forward-only validation;
- constraints;
- indexes;
- RLS;
- AAL2 functions;
- queue lease concurrency;
- immutable audit;
- partitioning;
- archive manifest integrity.

## 30.3 Integration tests

Use provider fixtures for:
- Google OAuth/token refresh;
- Gmail history;
- Calendar sync;
- Drive download;
- Apple bridge;
- Health exporter;
- GitHub owner allowlist;
- OpenAI response/webhook;
- R2 upload/download;
- Windows worker protocol.

## 30.4 AI evaluations

Create a versioned evaluation suite per manager.

Each case contains:
- synthetic input;
- expected required facts;
- prohibited claims/actions;
- numerical truth;
- section requirements;
- source requirements;
- cost ceiling.

Metrics:
- schema validity;
- factual/numerical accuracy;
- evidence coverage;
- instruction adherence;
- unsafe action rate;
- omission rate;
- user-style usefulness;
- cost.

Prompt/model promotion requires:
- no regression on safety/critical facts;
- overall quality improvement or equal quality at lower cost;
- saved evaluation artifact.

## 30.5 Playwright

Test:
- login and MFA mock flow;
- unauthorised rejection;
- overview;
- schedules;
- on-demand budget form;
- approval flow;
- finance/health/career report;
- spend charts period changes;
- trace tree;
- feedback thumbs-down categories;
- Google connection states;
- Apple/Health source status;
- Digital Estate scan and approval;
- mobile viewport;
- accessibility.

Run Chromium and WebKit on PR. Firefox may run nightly if CI time is constrained.

Use screenshot comparisons for:
- Overview desktop/mobile;
- Operations;
- Spend;
- Trace detail;
- each manager report page.

## 30.6 Security tests

- RLS/IDOR;
- CSRF;
- XSS in imported email/file/model output;
- prompt injection boundaries;
- secret redaction;
- OAuth state;
- webhook signature;
- worker replay;
- path traversal;
- symlink/reparse attacks;
- budget bypass;
- AAL1 vs AAL2;
- rate limits.

## 30.7 Performance

Targets under representative synthetic data:
- primary dashboard server response p95 < 1.5s excluding cold start;
- interaction ready < 3s on standard broadband/mobile;
- trace list query < 1s for 100k trace events with indexes;
- scheduler dispatch < 5s for 500 due schedules;
- queue claim safe under 10 concurrent workers;
- charts render 10k aggregated points smoothly; downsample larger sets.

---

# 31. Git, PR, CI, and Goal Mode protocol

This protocol is mandatory for every pass.

## 31.1 Repository safety

At pass start:

```bash
git remote -v
gh repo view --json nameWithOwner,isPrivate
```

The owner must be `Matthew-Irving5`. If not, stop.

Never run GitHub commands against BrightSG.

## 31.2 Pass preflight

1. Read:
   - `AI_OPERATIONS_BUILD_SPEC.md`
   - `AGENTS.md`
   - `CODEX_PASS_PROMPTS.md`
   - `docs/build/PASS_LEDGER.md`
   - latest ADRs.
2. Verify clean worktree.
3. `git fetch --all --prune`.
4. Check the previous pass PR:
   - exists;
   - required checks passed;
   - merged into `main`.
5. If it is not merged, do not start the new pass.
6. Checkout `main`.
7. `git pull --ff-only origin main`.
8. Run existing baseline tests.
9. Create branch:
   - `pass-01-foundation`
   - through `pass-07-final-hardening`.
10. Mark pass `IN_PROGRESS` in the pass ledger.

Pass 1 must implement a cross-platform Node helper that automates this preflight and fails safely.

## 31.3 Goal Mode

For each pass:

1. Start a fresh Codex conversation from repository root.
2. Select `gpt-5.6-terra`.
3. Set reasoning to `medium`.
4. Use `/plan` only to inspect the pass and produce an internal implementation plan.
5. Then invoke `/goal` with the exact pass goal from `CODEX_PASS_PROMPTS.md`.
6. The goal’s stopping condition is the pass definition of done plus successful PR checks and merge.
7. Codex must continue fixing issues until the stopping condition is met or a genuine external blocker occurs.

## 31.4 During implementation

- Inspect existing tests and workflows before changing code.
- Add or expand tests for every changed behaviour.
- Update documentation and ADRs.
- Run targeted tests frequently.
- Use Playwright MCP for frontend flows and console/network inspection.
- Do not weaken tests to pass.
- Do not hide failures with blanket retries, skips, `any`, or ignored exceptions.
- Keep scope within the pass, but fix directly caused defects.

## 31.5 Before PR

Run:
- formatting;
- lint;
- typecheck;
- unit;
- database/RLS;
- Edge Function;
- worker tests if relevant;
- build;
- Playwright relevant suite;
- security checks;
- full CI-equivalent script.

Produce:
- `docs/build/evidence/pass-XX.md`
  - summary;
  - files/features;
  - migrations;
  - tests and results;
  - screenshots/trace references;
  - security considerations;
  - known limitations only if explicitly accepted by spec.

Mark pass `READY_FOR_REVIEW`.

## 31.6 PR

- commit deliberately;
- push branch;
- create PR with pass template;
- include acceptance checklist and test evidence;
- enable squash auto-merge;
- monitor all GitHub Actions using `gh pr checks --watch`;
- inspect failed logs;
- fix and push;
- repeat until all required checks pass;
- wait until auto-merge completes;
- verify merge commit is on `origin/main`.

If auto-merge is unavailable, report that as a repository configuration blocker before continuous passes begin; do not assume manual merge.

## 31.7 Completion and compaction

After merge:
- update local `main`;
- verify clean status;
- confirm production/staging deployment status required by the pass;
- mark handoff complete in the conversation;
- invoke `/compact`;
- end the conversation.
- Start the next pass in a fresh Codex conversation.

---

# 32. GitHub Actions

Create at minimum:

## `ci.yml`
PR:
- install/cache;
- format check;
- lint;
- typecheck;
- unit tests;
- build;
- changed-file policy;
- generated types current.

## `database.yml`
- local Supabase;
- apply migrations from empty DB;
- pgTAP/RLS;
- seed;
- migration drift.

## `edge-functions.yml`
- Deno format/lint/test;
- contract tests;
- bundle/deploy dry run.

## `windows-worker.yml`
- Windows runner;
- Ruff;
- mypy/pyright;
- pytest;
- package smoke;
- path safety tests.

## `e2e.yml`
- deploy/start full synthetic stack;
- Playwright Chromium/WebKit;
- accessibility;
- screenshots;
- traces uploaded on failure.

## `security.yml`
- CodeQL;
- dependency review;
- secret scan;
- npm/pip audit;
- custom RLS/security tests.

## `deploy-staging.yml`
On merge main:
- deploy Supabase migrations/functions staging;
- deploy Cloudflare staging;
- smoke tests.

## `deploy-production.yml`
After staging succeeds:
- environment-specific production deploy;
- migrations with backup/check;
- production smoke using safe read-only account/session;
- rollback instructions/artifacts.

## `archive-maintenance.yml`
Scheduled monthly:
- compact eligible partitions to Parquet;
- upload R2;
- verify;
- report metrics;
- no AI required.

Required branch checks include all relevant workflows. Enable auto-merge only when required checks pass.

---

# 33. Documentation deliverables

Codex must maintain:

- `README.md`: developer quickstart.
- `docs/architecture/system-overview.md`
- `docs/architecture/data-flow.md`
- `docs/architecture/security-model.md`
- `docs/architecture/ai-runtime.md`
- `docs/operations/runbooks.md`
- `docs/operations/cost-controls.md`
- `docs/operations/backup-restore.md`
- `docs/onboarding/production-setup.md`
- `docs/onboarding/apple-shortcuts.md`
- `docs/onboarding/health-export.md`
- `docs/onboarding/windows-worker.md`
- `docs/build/PASS_LEDGER.md`
- ADRs for material decisions.
- OpenAPI/contract documentation.
- Data dictionary generated from migrations.
- Threat model.
- Disaster recovery plan.
- Human setup validation command.

---

# 34. Seven-pass implementation plan

These passes are deliberately large because Codex runs in Goal Mode with Terra medium. Each pass must produce a complete, production-quality vertical slice and must not defer acceptance criteria to a later pass unless explicitly stated.

## Pass 1 — Foundation, infrastructure, authentication, and CI

Branch: `pass-01-foundation`

Deliver:
- monorepo scaffold;
- locked toolchain;
- Next.js shell and design system;
- local Supabase;
- core migrations for identity, managers, workflows, budgets, traces, audit, integrations;
- RLS;
- single-user auth;
- TOTP/AAL2 flows;
- MFA step-up component;
- environment validation;
- Cloudflare/Supabase deployment configuration;
- R2 adapters and local test adapter;
- GitHub Actions base suite;
- branch protection/auto-merge documentation;
- pass helper scripts;
- base dashboard/navigation;
- synthetic seed;
- security headers;
- complete tests.

Acceptance:
- unauthenticated user cannot access app/data;
- non-allowlisted user rejected;
- AAL1 cannot access app;
- development stack one-command start;
- staging deploy succeeds;
- CI required checks pass;
- no secrets in repo.

## Pass 2 — Orchestration, AI runtime, budgets, tracing, feedback, and email

Branch: `pass-02-platform-engine`

Deliver:
- scheduler/queue;
- workflow engine;
- OpenAI Responses API integration;
- structured outputs;
- background/webhook;
- model/pricing catalog;
- cost reservation;
- recurring/on-demand budgets;
- forecast formulas;
- Gmail notification dispatcher;
- reports/actions/approvals;
- Operations Centre;
- Spend & Forecasting;
- Traces & Audit;
- feedback and quality UI;
- Systems Manager workflows;
- AI eval harness;
- provider mocks;
- full tests.

Acceptance:
- scheduled synthetic workflow runs end to end;
- hard cap blocks recurring call;
- on-demand separate budget works;
- expected/actual/adjusted metrics correct;
- trace contains all steps/costs;
- email sends in staging test;
- thumbs-down categories stored;
- no duplicate run/email under concurrency.

## Pass 3 — Google/Apple integrations and Personal Operations

Branch: `pass-03-personal-integrations`

Deliver:
- Google OAuth;
- Gmail/Calendar/Drive incremental sync;
- connection UI;
- Apple Reminder/Calendar bridge endpoint and setup guide;
- personal profile/location/time preferences;
- reminders/routines/actions;
- Personal Operations workflows and page;
- daily/weekly emails;
- travel-time provider interface;
- data freshness;
- integration tests and Playwright flows.

Acceptance:
- synthetic Google sync idempotent;
- OAuth state/token encryption tested;
- reminder/calendar snapshot imports;
- morning plan uses all sources;
- empty midday scan sends nothing;
- mobile UI passes;
- scopes/revoke visible.

## Pass 4 — Health and Finance Operations

Branch: `pass-04-health-finance`

Deliver:
- Health ingestion/backfill/dedup/normalisation;
- health metrics and manager workflows/UI;
- Screen Time experimental adapter;
- finance upload/Gmail/Drive/Sheet compatibility;
- statement parsing and validation;
- transaction/category/close schema;
- finance reports/workflows/UI;
- archival raw objects;
- strict safety/validation;
- manager-specific feedback;
- comprehensive tests/evals.

Acceptance:
- previous-day health file processes with revisions/duplicates;
- weekly health report produced;
- finance sample statement reconciles;
- incomplete finance data clearly blocks/qualifies report;
- numerical ground-truth tests pass;
- sensitive download requires MFA;
- reports email correctly.

## Pass 5 — Career, Travel, and Procurement Operations

Branch: `pass-05-career-travel-procurement`

Deliver:
- GitHub connector owner allowlist;
- career evidence/skills/opportunities/market research;
- Career UI and workflows;
- Travel on-demand workflow, watches, UI;
- Procurement on-demand workflow, price/return watches, UI;
- bounded web research/citations;
- individual run budgets;
- feedback/evals;
- email outputs.

Acceptance:
- BrightSG owner test fails closed;
- only Matthew-Irving5 fixtures accepted;
- market claims cited;
- travel/procurement run cannot exceed cap/search limit;
- price watch dedup;
- on-demand spend excluded from recurring cap but included combined reporting.

## Pass 6 — Digital Estate Windows worker and long-term archival

Branch: `pass-06-digital-estate`

Deliver:
- Python worker;
- pairing/device identity;
- heartbeat/poll/results;
- inventory and software/security collectors;
- scan/on-demand budget UI;
- organisation plan;
- MFA approval;
- signed action manifest;
- safe executor/quarantine;
- Digital Estate page;
- archive compaction/Parquet;
- backup/restore workflows;
- R2 storage monitoring;
- Windows CI and security tests.

Acceptance:
- no inbound worker port;
- replay/signature/path traversal tests pass;
- altered file precondition prevents move;
- deletion only via quarantine;
- offline task waits;
- verified Parquet archive retrieval works;
- restore drill documented and tested.

## Pass 7 — Full integration, hardening, production onboarding, and final quality

Branch: `pass-07-final-hardening`

Deliver:
- complete cross-manager integration;
- final dashboard and interactive chart polish;
- performance/index optimisation;
- full threat model and security hardening;
- complete Playwright desktop/mobile suite;
- AI eval baseline and routing promotion rules;
- data export;
- connection/credential/device management;
- production onboarding wizard;
- schedule approval;
- operational runbooks;
- disaster recovery;
- final synthetic demo;
- production deploy;
- no TODOs/placeholders;
- final audit against every specification item.

Acceptance:
- requirements traceability matrix shows every requirement implemented/tested;
- all CI passes;
- staging and production smoke pass;
- only allowlisted AAL2 user can access;
- all eight managers runnable;
- schedules operate cloud-side;
- PC-off cloud workflows proven;
- costs/traces/feedback complete;
- final security scan has no unresolved high/critical finding;
- documentation sufficient for operation without Codex context.

---

# 35. Final definition of done

AI Operations is complete only when:

- all seven PRs are merged;
- production is deployed on a free generated hostname;
- production uses separate Supabase/R2/OpenAI/Google configuration;
- MFA is mandatory;
- all eight manager pages and workflows are implemented;
- scheduled cloud workflows run with the PC off;
- notification emails are sent to the configured account;
- Apple/Google/Health bridges have production setup paths;
- local worker queues while offline and executes only approved manifests;
- recurring and on-demand budget semantics are correct;
- expected, actual, original forecast, and adjusted forecast are visible and historically stored;
- full traces, audit, feedback, and quality review exist;
- historical data is retained and tiered;
- CI/CD, backups, security, and restore are operational;
- no production placeholder exists;
- the requirements traceability matrix has no missing item.

---

# 36. Required production onboarding checklist

The implementation must provide a guided checklist for the user to complete once:

1. production Supabase secrets;
2. Cloudflare/R2 secrets;
3. OpenAI project key and provider hard limit;
4. Google OAuth redirect and consent;
5. initial login/password;
6. Microsoft Authenticator TOTP;
7. Gmail test notification;
8. Apple Shortcut bridge installation;
9. Health exporter connection and historical backfill;
10. source app permissions;
11. Windows worker installation/pairing;
12. Personal Operating Profile;
13. Finance source mapping;
14. GitHub personal account connection;
15. initial schedule review/enable;
16. backup/restore test;
17. full production acceptance.

No schedule that spends money or emails the user may be enabled before this checklist records acceptance.

---

# 37. Source-of-truth references for implementation

Codex must use the configured OpenAI Docs MCP and primary provider documentation during implementation. Important current platform facts reflected in this design include:

- Codex project configuration and MCPs are defined through `config.toml`; Goal Mode is started with `/goal`, and `/compact` compacts the chat.
- The OpenAI Responses API supports structured outputs, web search, background requests, and webhooks.
- GPT-5.6 model prices and cache-write/cached-input accounting must be represented as versioned data, not assumptions.
- OpenAI project hard spend limits can stop API traffic.
- Supabase RLS integrates with Auth; TOTP provides AAL2.
- Supabase Cron can invoke Edge Functions.
- Cloudflare Workers support cron triggers and R2 provides an object-storage free tier.
- Google Workspace private user data uses OAuth web-server flow.
- Apple Health requires user-authorised ingestion; Screen Time is restricted and remains experimental.

When documentation conflicts with this file because a provider API changed, preserve the product requirement and adapt the implementation through an ADR. Never silently remove the requirement.

---

# 38. Pass 8 completion sequencing and blocked-goal protocol

Pass 8 is the completion pass after the seven historical passes. It must finish
deterministic production behavior, observability, security, integrations, UI,
worker, archive/recovery, tests, and CI before enabling live OpenAI agents.

## 38.1 Deterministic-first sequencing

Real agents are intentionally the final integration stage. Synthetic fixtures and
provider mocks must exercise the same reservation, usage, trace, audit,
validation, report, action, notification, and feedback paths as live calls.

Before any live provider call, the system must prove:

- strict Structured Outputs and validation;
- model, prompt, version, tool, and correlation identifiers;
- redacted trace trees and audit records;
- estimated and actual currency/token accounting;
- transactional reservations and hard-cap enforcement;
- provider usage reconciliation;
- bounded retry and failure behavior;
- report/action/feedback linkage;
- no model authority over recipients, permissions, hard caps, or approvals.

The first live test must be one deterministic synthetic call using the lowest-cost
permitted model, no web search, no autonomous action, and no unbounded background
work. The initial aggregate ceiling is $2 unless the operator configures a lower
provider/application limit. Agent activation then proceeds manager by manager only
after evaluation, safety, evidence, and cost gates pass.

## 38.2 Identity and secret handling

The locked production application identity remains
`matthewirving99@gmail.com`. `Matthew-Irving5` is the approved GitHub owner and
display label, not a replacement login identity. Passwords, tokens, `.env` values,
provider keys, MFA secrets, and recovery material must never be written to source,
tests, documentation, screenshots, or logs.

## 38.3 External blockers and operator handoff

Normal code, test, deployment, and integration failures are implementation work,
not blockers. A genuine external blocker is limited to missing/invalid credentials,
denied provider permissions, unavailable provider resources, required MFA/device or
account consent, or another action only the operator can perform.

After the same blocker occurs for three consecutive goal turns, Codex must mark the
active goal `blocked`. The handoff must include the exact blocker, evidence and
checks run, completed work, precise operator action, exact verification steps, and
the command or prompt that resumes work. Codex must not echo secrets or leave the
goal active while repeatedly reporting the same blocker.

## 38.4 Operator-owned acceptance actions

The guided production checklist must distinguish Codex-verifiable work from
operator actions: Supabase account/password setup, Microsoft Authenticator TOTP,
Google OAuth consent, the Gmail delivery test, Apple Shortcut and Health Export
authorization, Windows worker installation/pairing, personal and finance mapping,
backup/restore acceptance, schedule review, and final production acceptance.

No spend or email schedule may be enabled until these actions are recorded and the
immutable acceptance record exists.

---

# 39. Codex final instruction

Build the system exactly as specified. Optimise for correctness, security, low operating cost, traceability, and long-term maintainability. Do not optimise for demo speed at the expense of production completeness.
