# AI Operations — Authoritative Agent Functional Specification & Technical Implementation Plan

**Repository:** `Matthew-Irving5/AI-Operations`  
**Document status:** **LOCKED FUNCTIONAL SOURCE OF TRUTH**  
**Specification version:** `1.1.0`  
**Effective date:** `2026-09-26`  
**Primary timezone:** `Europe/London`  
**Scope:** Agent functionality, agent/user communication, agent/agent communication, command authority, shared state, tool authority, execution semantics, capability quality, and the implementation required to reach the target architecture.

**Amendment 1.1.0 (2026-09-27):** lock the Google account topology and replace Planner's Apple Calendar/Reminders output contract with Google Calendar + Google Tasks. Apple Shortcut/mobile ingestion remains for Health and other input-only datasets that Google does not replace.

---

## 0. Authority, precedence and change control

This document is the permanent functional contract for the AI Operations agent system.

The following precedence applies:

1. **This specification** is authoritative for manager responsibilities, communication, conversation state, command authority, agent-to-agent contracts, tool/capability authority, execution semantics, freshness requirements, and capability-regression behaviour.
2. `AI_OPERATIONS_BUILD_SPEC.md` remains authoritative for the existing product stack, infrastructure and engineering/security requirements **where those requirements do not conflict with this specification**.
3. `AGENTS.md` defines repository execution discipline for coding agents, but must not narrow or reinterpret the functionality defined here.
4. Prompts, workflow definitions, database schemas, UI behaviour, tests and current code are implementations of the specification. They are not permitted to silently redefine it.

Where an older build rule says a user must approve an action again or perform a content-based MFA step, this specification controls command semantics:

- an instruction received through an authenticated Web Chat session or a verified, allowlisted Gmail sender is already an authoritative user command;
- the platform must **not** downgrade that command because the content appears risky, sensitive or destructive;
- this does **not** create capabilities the platform does not possess, bypass provider permissions, permit arbitrary shell execution, bypass database/RLS authentication, or bypass hard machine capability boundaries;
- an agent-generated proposal remains non-authoritative and must never self-authorise.

Functional changes require an explicit amendment to this document. Each amendment must change the specification version, describe the changed rule, update affected acceptance/regression tests, and identify any migration required. Prompt or model changes alone never amend the product contract.

### 0.1 Repository safety boundary

Runtime and implementation-time GitHub access is restricted to repositories owned by `Matthew-Irving5`.

`BrightSG` is permanently denied. No agent, evaluation runner, research process, worker or coding agent may inspect, search, clone, query, retain metadata from, or modify a repository owned by `BrightSG`.

### 0.2 Design objective

After this specification is implemented, agent functionality is considered conceptually complete. Future work should be implementation, tuning, evidence-backed improvement and explicit specification amendment—not repeated redesign of what the agents are supposed to be.

---

# Part I — Authoritative Agent Functional Specification

## 1. Product operating model

AI Operations is a private, single-user, always-on operations system. Its agents are durable managers with persisted state, evidence, policies, conversations, actions, schedules and quality tests. They are not isolated chat personas.

The common manager lifecycle is:

> **Collect → Validate → Build Context → Analyse → Decide → Propose Actions → Persist State → Produce Output → Queue Communication → Audit**

Deterministic software owns identity, validation, arithmetic, scheduling, idempotency, state transitions, permissions, freshness, cost reservation, deduplication and execution preconditions. Models own interpretation, synthesis, prioritisation, research, recommendations and other genuinely reasoning-heavy work.

### 1.1 Global ownership model

**Specialist managers own domain judgement.**

**Planner / Executive Assistant owns:**
- the user's time and schedule;
- cross-domain priorities;
- Google Calendar and Google Tasks;
- routine outbound user communication;
- consolidation of specialist requests;
- recovery when the user's real behaviour differs from a plan.

**Personal Systems & Automation owns:**
- platform execution machinery;
- queues, schedules, retries and dead letters;
- integrations and freshness;
- model runtime, prompts, costs and tracing;
- capability evaluation and regression prevention;
- operational health and platform reliability.

Examples:
- Health decides what training is appropriate; Planner decides when it fits.
- Career decides how much project work remains; Planner allocates the time.
- Finance decides whether a financial opportunity is worthwhile; Planner normally communicates or schedules the resulting action.
- Systems ensures the workflow actually ran and was observable; Systems does not replace specialist domain judgement.

### 1.2 Command authority is separate from capability

A verified user command is authoritative, but authority does not imply unlimited execution.

A command can fail only for a concrete reason such as:
- the target or parameters are ambiguous;
- the requested capability does not exist;
- the target is outside a preconfigured execution boundary;
- a provider denies the operation;
- a required dependency is unavailable;
- an execution precondition is stale;
- the request contradicts a newer explicit user instruction;
- the operation is explicitly outside product scope, such as autonomous investment execution, autonomous purchasing, arbitrary remote shell execution, or accessing a denied repository.

It must **not** fail merely because a classifier labels the content “high risk”.

---

## 2. The eight permanent managers

The permanent manager codes remain:

| Manager | Canonical code | Primary role |
|---|---|---|
| Finance Operations | `finance` | Personal CFO and financial opportunity manager |
| Health & Performance Operations | `health` | Personal trainer, performance analyst and adherence manager |
| Travel Planning Operations | `travel` | End-to-end trip planning and trip-state manager |
| Consumer & Procurement Operations | `procurement` | Requirement-led product and purchase-lifecycle researcher |
| Personal Operations / Planner / Executive Assistant | `personal` | Day-to-day coordinator, calendar owner and communication consolidator |
| Career Operations & Frontier AI Intelligence | `career` | Career strategy, projects, job sniper and frontier AI radar |
| Digital Estate, Device & Security Operations | `digital_estate` | Digital organisation, endpoint posture and constrained local execution |
| Personal Systems & Automation | `systems` | AI Operations platform operator and quality governor |

No future coding pass may collapse these managers into a generic assistant.

---

## 3. Finance Operations

### 3.1 Mission

Act as the user's **personal CFO and financial opportunity manager**.

Finance must maintain a coherent financial state, perform reliable closes and reporting, identify genuine incremental gains, preserve uncertainty, and support long-term house/FIRE/retirement decisions.

### 3.2 Required responsibility set

Finance owns:
- statement intake and financial-source completeness;
- account and transaction state;
- reconciliation;
- income, expenditure, categories and transfers;
- monthly close and post-close CFO analysis;
- cash flow and budgets;
- account balances and liquidity classes;
- investments and net worth;
- credit history relevant to decisions;
- rewards, memberships and loyalty;
- stoozing;
- savings optimisation;
- house planning;
- FIRE and retirement modelling;
- quarterly, calendar-year and UK tax-year reviews;
- anomalies, deadlines and open financial actions;
- financial-product and low-effort income opportunities;
- evidence and assumptions behind financial recommendations.

It must replace all useful behaviour from the legacy **Finance Closing Manager**, **Monthly CFO**, Finance Strategy/Decisions instructions, reminder dispatcher and other active finance workflows.

### 3.3 Monthly close contract

The close lifecycle is:

1. **Intake** — identify period, inventory every supplied statement/file/written addition, map source to account and period, flag duplicates/overlaps/unreadable sources, and identify expected active accounts with no evidence.
2. **Stage** — parse into staging/import records before committing canonical transactions. Prefer machine-readable structured data, then text documents; scanned/OCR-derived data must carry lower confidence.
3. **Reconcile** — apply account-class arithmetic and preserve evidence of the reconciliation.
4. **Classify** — use user-confirmed merchant rules first, then prior confirmed patterns, matched internal transfers, provider metadata, high-confidence proposals, otherwise review.
5. **Question** — ask one consolidated set, grouped **Blocking → Important → Accepted Automatic Treatment**. Do not interrupt after each uncertain line item.
6. **Resolve** — apply the user's answers, append reusable rules when appropriate, rerun reconciliation, and surface only newly unresolved material questions.
7. **Pre-close preview** — show accounts included, missing-account explanations, transaction count, income, expenditure, transfers, investment movements, balances, unusual items, assumptions, reconciliation status and data quality.
8. **Approve** — close only after an explicit user command equivalent to `Close the month`.
9. **Commit** — persist approved transactions, snapshots, credit/reward/membership changes, rules, close receipt, close fingerprint and provenance.
10. **Analyse** — run the monthly CFO analysis against the immutable closed period.
11. **Follow-up** — ask useful questions derived from missing data, limitations, findings, actions, expiring assumptions and opportunities. Follow-ups should be grouped **Blocking → Important → Additional → Optional** and should not repeat permanently answered questions.

A missing active account must be flagged. Missing evidence is never proof of zero activity.

Closed history is append-only/correctable by explicit reopen/correction flow. Historical records are not silently overwritten.

### 3.4 Accounting invariants to preserve

Unless explicitly changed by user policy:
- a card purchase is expenditure when incurred; later card repayment is an internal transfer;
- transfers between owned accounts are not spending;
- stoozing principal is ring-fenced and not counted as emergency cash, house resources or FIRE assets;
- rewards are tracked separately from core net worth;
- student-loan treatment may be shown in adjusted views but is not silently folded into headline net worth;
- pension pot movement must not be described as investment performance when contributions or other flows are incomplete;
- unsupported dates, balances, contributions, merchants and categories must not be invented.

### 3.5 Materiality defaults

Materiality is a configurable standing policy. The migrated default from the legacy finance system is:
- under approximately £10: may be auto-categorised when evidence is reasonable;
- approximately £10–£50: review when confidence is low;
- above approximately £50: request confirmation unless a confirmed rule applies;
- uncertain income, transfers, investments and reimbursements always remain reviewable.

These thresholds affect categorisation confidence, not command authority.

### 3.6 Opportunity Finder

Finance must continuously identify **incremental** value rather than generic advice.

#### Cashback and rewards
Use actual historical transactions and merchant behaviour to detect:
- cashback portals;
- card-linked offers;
- reward programmes;
- better payment-card selection;
- merchant-specific schemes;
- legitimate stacking;
- memberships or loyalty programmes supported by observed usage.

Calculate realistic incremental value after fees, displaced rewards and effort.

#### Bank switching and credit/current-account openings
Before recommending a new current or credit account:
- retrieve the latest available credit report;
- consult the platform's actual known account-opening/application ledger;
- calculate the rolling six-month window;
- reconcile known openings against credit-report lag.

Standing hard rule:

> **Maximum two newly opened current or credit accounts in any rolling six-month period unless the user explicitly overrides it.**

Standing policy unless explicitly amended:
- Santander remains the permanent main account and is not a donor-switch account.
- Chase is not automatically designated as the donor account.

#### Other opening promotions
Research savings products, investment/pension/ISA transfers, fintech offers and other legitimate guaranteed or near-guaranteed opening incentives. Evaluate net benefit, tax, fees, risk, effort, lock-up, liquidity and credit/mortgage implications.

#### Low-effort income
Do not surface generic side-hustle spam. Default relevance threshold:
- roughly £50+ expected net benefit; **or**
- roughly £25+/hour active-effort value;
unless the opportunity is exceptionally effortless or strategically valuable.

#### Opportunity record
Every surfaced, deferred or rejected opportunity must persist:
- source/evidence;
- expected gross benefit;
- expected net benefit;
- effort estimate;
- payout probability/confidence;
- eligibility;
- deadline/expiry;
- credit impact;
- mortgage impact when relevant;
- tax impact;
- liquidity impact;
- risks;
- prerequisites;
- decision reason;
- current status;
- prior surfacing/completion;
- incremental benefit versus any already-completed version.

Do not repeatedly recommend a completed action with no new incremental benefit.

### 3.7 Cash, house and FIRE

Preserve **actual cash surplus** historically.

For forward House/FIRE projections, use the latest **three reliable closed months of Normalised Cash Surplus**. If fewer than three reliable closed months exist, use those available. Do not use an expanding lifetime average. One-offs may be adjusted for projection only; the historical actual remains unchanged.

House planning must:
- separate deposit resources, LISA resources, emergency reserve and other ring-fenced cash;
- show sensitivity rather than a falsely exact affordability number;
- date live mortgage/lender evidence;
- distinguish planning from guaranteed eligibility.

FIRE/retirement modelling must:
- separate bridge-accessible assets, pension wealth and house resources;
- distinguish nominal from real/current-purchasing-power values;
- model scenario assumptions transparently;
- preserve approved assumptions and require explicit user authority before changing standing strategic assumptions.

### 3.8 Finance outputs and prohibitions

Finance may produce reports, attention items, recommendations, research and typed execution requests for platform data maintenance.

Finance must not:
- autonomously transfer money;
- autonomously invest, trade or open an account;
- present product availability, tax treatment, mortgage eligibility or credit approval as guaranteed;
- silently modify closed history or strategic assumptions;
- leak raw financial documents in routine email.

---

## 4. Health & Performance Operations

### 4.1 Mission

Act as an active personal trainer, performance analyst and adherence manager.

### 4.2 Canonical data path

Prefer:

> **device/app → Apple Health → Apple Shortcut/mobile ingestion → AI Operations**

Do not add separate direct integrations where Apple Health already provides a reliable aggregation path.

### 4.3 Responsibilities

Health owns:
- running, strength, activity and body composition;
- weight and trend interpretation;
- sleep, recovery and workload;
- nutrition context where supplied;
- training plans and progression;
- missed-session/adherence detection;
- adaptation and deload decisions;
- performance and goal forecasting;
- intervention when repeated misses indicate the plan is not working in real life.

Missing data is **not** proof of inactivity. Incomplete capture must lower confidence and may trigger a data-quality question, not an “inactive” conclusion.

Health decides **what training is appropriate**. Planner decides **when it fits**.

Normal path:
> Health finding → Planner Attention Item → Planner communicates/reschedules.

Health may communicate directly when the user explicitly addresses Health or when specialist explanation is needed, but it should not independently spam Calendar/Reminders.

### 4.4 Required behavioural rule

Repeated missed sessions must cause an intervention such as:
- identify the adherence pattern;
- test whether workload/scheduling/recovery assumptions are wrong;
- propose a modified training plan;
- ask Planner to reschedule;
- track whether the intervention improved adherence.

Passive “you missed another session” reporting is insufficient.

---

## 5. Travel Planning Operations

### 5.1 Mission

Own the complete travel lifecycle from feasibility to return.

### 5.2 Responsibilities

Travel owns:
- destinations and feasibility;
- routing;
- flights, trains, cars and local transport;
- accommodation;
- attractions and itinerary;
- baggage;
- visas/documents/readiness;
- airport/station/transfers;
- end-to-end trip cost;
- booking/confirmation state supplied by the user;
- packing/readiness;
- price/availability watches;
- disruption monitoring.

### 5.3 Evidence labelling

Every time-sensitive claim must be labelled as one of:
- **current verified**;
- **indicative**;
- **historical**;
- **unknown**.

Use exact/live prices when available. Calculate total trip cost including mandatory baggage, taxes, transfer requirements and other unavoidable charges rather than ranking on headline fare alone.

Travel must not autonomously book or spend money.

Planner owns calendar/task integration. Finance may handle payment/reward optimisation.

---

## 6. Consumer & Procurement Operations

### 6.1 Mission

Turn a user need into a requirement-led, evidence-backed recommendation and maintain the resulting purchase lifecycle.

### 6.2 Responsibilities

Procurement owns:
- requirement extraction;
- hard constraints and preference weighting;
- market research;
- comparisons;
- quality/reliability;
- independent reviews and failure modes;
- price and total ownership cost;
- compatibility;
- warranty/returns;
- purchase and receipt state supplied by the user;
- return/warranty deadlines;
- price watches and lifecycle replacements.

Research begins with requirements, not a bestseller list.

Do not rank primarily by affiliate lists, popularity, retailer ranking or GitHub-star-equivalent metrics.

Finance may support affordability/cashback. Planner owns deadlines and reminders.

Procurement must not autonomously purchase.

---

## 7. Personal Operations / Planner / Executive Assistant

### 7.1 Mission

Act as the primary day-to-day coordinator and the default user-facing manager.

### 7.2 Responsibilities

Planner owns:
- daily and weekly planning;
- Google Calendar and Google Tasks;
- priorities and routines;
- commitments and deadlines;
- time allocation and conflict detection;
- travel/preparation buffers;
- missed-task recovery;
- specialist communication consolidation;
- project scheduling;
- training scheduling;
- waiting-for/response tracking;
- morning/evening planning interactions and meaningful exceptions.

### 7.3 Flexible planning

A plan is not a brittle script. If reality diverges:

> **observe → reconcile → reprioritise → reschedule → continue**

Planner must not let the remainder of a day/week “fail” merely because the user ignored one suggested block.

Calendar semantics must distinguish:
- `hard_external_commitment`;
- `user_approved_important_commitment`;
- `soft_ai_managed_block`;
- `routine`.

Soft blocks are movable. Hard external commitments are not moved by AI without an explicit user command.

### 7.4 Communication consolidation

Planner consumes specialist attention items and should combine compatible items into a useful briefing instead of letting eight managers independently message the user.

Default configurable interaction pattern may include:
- morning plan/brief;
- meaningful midday exception only;
- evening reconciliation;
- weekly plan.

Cadence remains user-configurable.

---

## 8. Career Operations & Frontier AI Intelligence

### 8.1 Mission

Maximise the user's career trajectory as an AI engineer through career strategy, skill development, project/portfolio execution, job opportunity discovery and early identification of important AI/software developments.

### 8.2 Project/portfolio management

For every significant project persist:
- objective;
- career value;
- milestones;
- completeness;
- evidence produced;
- remaining work;
- blockers;
- target deadline/status.

Career decides the work needed for career value. Planner schedules the time.

### 8.3 Job Opportunity Sniper

Continuously search for exceptional roles with preference for:
- strong demonstrated skill fit;
- recently posted/open roles;
- direct employer career pages and primary sources;
- niche sources where useful;
- realistic experience requirements;
- meaningful progression;
- evidence-backed compensation and location fit.

Evaluate:
- hard requirements;
- experience requirements;
- skills;
- salary evidence/confidence;
- remote/hybrid/location;
- progression;
- technical relevance;
- freshness/open-state confidence;
- evidence of why the user has an edge.

Never claim “low competition” or “less saturated” without evidence.

### 8.4 AI Technology Radar

Research:
- arXiv;
- OpenReview;
- conference proceedings;
- research labs;
- technical primary sources;
- repositories, releases and commits;
- issues/discussions;
- benchmarks and evaluation tools;
- package releases;
- standards;
- paper/code links.

Do **not** use GitHub stars as a primary quality measure.

Evaluate:
- novelty;
- significance;
- empirical improvement;
- benchmark quality;
- reproducibility;
- implementation quality;
- maintenance;
- documentation;
- licence;
- security;
- performance;
- integration burden;
- developer experience;
- adoption evidence;
- independent validation.

Candidate lifecycle:

> `discovered → triaged → investigating → validated → watch → adopt → incorporated → rejected`

Rejection reasons are persisted so poor candidates are not repeatedly rediscovered as “new”.

### 8.5 Experimental validation

Important software may be evaluated only in an **isolated disposable environment**:
- no production credentials;
- no user-machine access;
- no mounted personal data;
- no private repository tokens beyond a narrowly scoped candidate checkout if explicitly required;
- per-run CPU/memory/time limits;
- ephemeral storage;
- default-deny network policy with explicitly required egress;
- captured build/test/benchmark logs and artefacts;
- destruction after the run.

Arbitrary frontier repositories must never run directly on the Windows worker.

### 8.6 GitHub invariant

Career runtime may access only repositories owned by `Matthew-Irving5`. `BrightSG` is permanently denied even if a token technically grants access.

---

## 9. Digital Estate, Device & Security Operations

### 9.1 Mission

Maintain organisation, health and security of the personal digital estate using evidence and constrained execution.

### 9.2 Responsibilities

Digital owns:
- files/folders and storage;
- duplicate/clutter analysis;
- software inventory;
- startup/persistence state;
- endpoint-security posture;
- OS/update posture;
- trusted malware-scan coordination;
- suspicious process/file investigation;
- PII/secrets exposure;
- API-key and credential **metadata**;
- rotation/expiry/exposure state;
- password-manager/MFA/passkey posture;
- sensitive-folder protection;
- cleanup, quarantine/archive and purge;
- limited backup/recovery where required for safe operations.

Use trusted endpoint tooling rather than inventing an AI malware scanner.

Never place a plaintext password vault or raw secret into model context.

### 9.3 Local execution boundary

The Windows worker remains outbound-only and executes only signed, typed, expiring actions with explicit preconditions.

Arbitrary command/shell execution is forbidden.

When a new local capability is required, add a new explicit action type with:
- exact target semantics;
- validated parameter schema;
- allowlisted root/capability boundary;
- hash/mtime or equivalent preconditions where applicable;
- bounded cardinality;
- signed manifest;
- expiry;
- idempotency;
- result receipt.

Default agent-generated cleanup path:

> `detect → propose → user authority where required → execute → quarantine/archive → eventual purge`

However, a verified direct user command may explicitly request a consequential operation such as permanent deletion. That instruction must not be rejected merely because it is destructive. If a typed permanent-delete capability exists, the platform may create the corresponding signed execution request immediately; if it does not exist, the receipt must say `unsupported_capability` rather than inventing a shell command or demanding content-based MFA.

### 9.4 Credentials

Track metadata only:
- provider;
- credential type;
- created/rotated/expiry dates;
- scope;
- storage location/class;
- exposure state;
- recommended action.

Do not rotate solely because a credential is old. Rotate/revoke when expiry, exposure, provider policy or scope justifies it.

---

## 10. Personal Systems & Automation

### 10.1 Mission

Operate AI Operations itself.

### 10.2 Responsibilities

Systems owns:
- scheduler and orchestration;
- queues, leases, retries and dead letters;
- run state and resumability;
- integration health/freshness;
- notification delivery;
- OpenAI runtime;
- model routing;
- prompt lifecycle;
- deterministic budgets/cost controls;
- audit and tracing;
- platform security;
- operational dashboards;
- capability-quality evaluation;
- backup/restore of platform-critical state;
- incident detection and recovery.

### 10.3 Capability Regression Gate — mandatory

For every manager maintain:
- functional acceptance tests;
- golden scenarios;
- hard rules;
- prohibited behaviours;
- required outputs;
- evidence expectations;
- tool/authority constraints;
- cost expectations where relevant;
- cross-manager boundary tests.

Any change to a manager prompt, model, output schema, workflow, routing policy, tool set, execution contract or source-of-truth mapping must pass the relevant capability suite **before promotion**.

TypeScript/Python/unit tests are necessary but insufficient.

### 10.4 Prompt governance

Prompts are:
- versioned;
- tied to manager/spec version;
- evaluated;
- traceable to calls;
- reversible;
- promoted only after capability evaluation.

Prompts implement manager responsibilities. They do not define or amend them.

---

# Part II — Shared Agent Runtime / Communication Specification

## 11. One canonical conversation system

Gmail and Website Chat are transports over **one** persistent conversation engine. They must never create separate memories or separate domain state.

A conversation can begin in Gmail, continue on the website, and later continue by email while retaining the same conversation identity and owning manager.

### 11.1 Canonical entities

#### `conversations`
Required fields:
- `id uuid`;
- `user_id`;
- `status: open | closed | archived`;
- `originating_channel: gmail | web_chat`;
- `originating_manager_code`;
- `current_manager_code`;
- `subject`;
- `gmail_thread_id nullable`;
- `created_at`, `updated_at`, `last_message_at`;
- `execution_state_summary`;
- `metadata jsonb`.

#### `conversation_messages`
Required fields:
- `id`;
- `conversation_id`;
- `user_id`;
- `direction: inbound | outbound | internal`;
- `sender_kind: user | manager | system | external`;
- `manager_code nullable`;
- `channel: gmail | web_chat | internal`;
- `semantic_type: statement | request | command | correction | cancellation | clarification | response`;
- `authority: verified_user | agent_generated | system_generated | external_untrusted`;
- body text and/or encrypted/R2 body reference;
- `gmail_message_id`, `gmail_rfc_message_id`, `gmail_thread_id` nullable;
- `in_reply_to`, `references` nullable;
- `provider_received_at`, `created_at`;
- immutable raw/body hash;
- deduplication key;
- processing/routing status;
- correlation ID.

Messages are append-only. Corrections append new facts and supersession links rather than rewriting message history.

#### `conversation_attachments`
Required fields:
- message/conversation link;
- source-object/R2 reference;
- original filename;
- detected MIME;
- byte size;
- SHA-256;
- malware/security scan status;
- extraction status/reference;
- data classification;
- retention state.

#### `conversation_transfers`
Persist:
- from manager;
- to manager;
- reason;
- source message;
- initiated/accepted timestamps;
- status.

#### `conversation_entity_links`
Link a conversation/message to:
- workflow run;
- report;
- action/execution request;
- finance close/opportunity;
- travel trip/watch;
- procurement item;
- health plan/finding;
- career project/opportunity/radar candidate;
- digital finding/plan;
- planner commitment/time block.

Conversation history is context, not a substitute for typed domain state.

---

## 12. Gmail as the primary lightweight mobile interface

### 12.1 Mailbox roles

The platform must support multiple Google connections with explicit roles.

Minimum roles:
- `personal_data_source` — **`matthewirving99@gmail.com`**. This is the canonical Google data account for Google Drive files/processing, Google Calendar reads/writes, and Google Tasks reads/writes/notifications.
- `ai_operations_mailbox` — **`matthew.irving.ai@gmail.com`** in production. This account is communication-only: inbound user emails and outbound AI Operations replies/briefings. It is not a Drive, Calendar or Tasks data source.
- `ai_operations_mailbox_staging` — **`matthew.irving.ai.staging@gmail.com`** in staging. It mirrors the production mailbox permissions and behaviour but is isolated from production conversations and data.

Do not assume one Google account per user/provider. Account role is a security boundary and must be enforced server-side.

These addresses are canonical deployment configuration values and must not be scattered as hard-coded constants through feature code. A single central account-role configuration is authoritative.

Do **not** create one mailbox per manager. All managers share the canonical AI Operations mailbox; routing is handled by canonical conversation/thread ownership, explicit routing metadata, or Planner default. Plus-address aliases may optionally route to specialists, for example `+finance`, `+health`, `+career`, `+travel`, `+procurement`, `+digital`, `+systems`, but they remain aliases of the one mailbox rather than separate accounts.

Routing priority:
1. existing canonical conversation/Gmail thread owner;
2. explicit destination alias;
3. Planner default.

Subject text is human-readable context only and must not be the sole routing signal.

### 12.2 Inbound architecture

Target flow:

> **Gmail mailbox → `users.watch` → Google Cloud Pub/Sub → authenticated push Edge Function → `users.history.list` → fetch new Gmail message(s) → canonical conversation/message → route manager → execute → persist response → Gmail `messages.send` in same thread**

Implementation must follow current Google Workspace guidance:
- use a Pub/Sub topic authorised for Gmail API publishing;
- maintain `historyId` per mailbox connection;
- renew Gmail `users.watch` at least within Google's expiry requirement; default to daily renewal;
- treat Pub/Sub as a change signal, not as the canonical message payload;
- use `history.list` from the last durable cursor;
- implement periodic history reconciliation because push notifications can be delayed or dropped;
- acknowledge authenticated Pub/Sub pushes with successful HTTP status only after the event is durably accepted for processing;
- deduplicate both push events and Gmail message IDs.

Primary references:
- https://developers.google.com/workspace/gmail/api/guides/push
- https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions

### 12.3 Pub/Sub authentication

The push endpoint must validate the Pub/Sub OIDC token:
- signature against Google keys;
- issuer;
- audience;
- token expiry;
- expected push service-account identity;
- verified email claim.

A public unauthenticated JSON body is never enough to invoke Gmail ingestion.

### 12.4 Verified user sender authority

Gmail retrieval proves the system is reading the correct AI Operations mailbox. It does **not**, on its own, prove the RFC `From` header belongs to the user.

A Gmail message is `verified_user` authority only when all applicable checks pass:
1. message was retrieved through the OAuth connection whose role is `ai_operations_mailbox`;
2. exactly one normalised sender identity matches the configured user-email allowlist;
3. relevant `Authentication-Results` evidence shows aligned authenticated delivery (DMARC pass, or aligned DKIM/SPF policy accepted by the implementation);
4. contradictory `Sender`, `Resent-*` or other identity headers are rejected unless explicitly supported by policy;
5. the message is not a system-generated copy of the platform's own outbound message.

Quoted previous messages and forwarded bodies are **context/evidence**, not fresh user commands by themselves. The user's newly authored text controls interpretation unless the user explicitly instructs the agent to execute something contained in quoted material.

Failed sender verification may persist the message as external/untrusted evidence if policy allows, but it must never become user command authority.

### 12.5 OAuth and scopes

OAuth remains server-side with encrypted refresh-token storage.

Role-specific scopes:
- `personal_data_source` (`matthewirving99@gmail.com`): minimum scopes required for selected Google Drive ingestion/processing, Google Calendar read/write, and Google Tasks read/write. Gmail send/read is not required for AI Operations communication on this role unless a separate explicitly approved ingestion workflow later requires it.
- `ai_operations_mailbox` (`matthew.irving.ai@gmail.com`): minimum Gmail scopes required to read conversation messages/attachments and send replies; no Drive, Calendar or Tasks scopes.
- `ai_operations_mailbox_staging` (`matthew.irving.ai.staging@gmail.com`): the same Gmail-only permission model as production, pointed only at staging infrastructure.

Connection-role changes, mailbox bootstrap and credential administration may remain protected by site authentication/AAL2. Once the channel is established, **individual verified commands do not require content-based reauthentication**.

### 12.6 Thread fidelity

Outbound replies must persist and use:
- Gmail `threadId`;
- RFC `Message-ID` of sent message;
- `In-Reply-To`;
- `References`;
- canonical conversation ID;
- correlation ID internally.

A send retry must be idempotent and must not create duplicate replies.

### 12.7 Gmail failure modes

Handle:
- duplicate Pub/Sub signals;
- expired/invalid history IDs;
- watch expiry;
- OAuth refresh failure;
- sender verification failure;
- message fetch failure;
- attachment fetch failure;
- transient Gmail send failure;
- permanent send failure;
- provider outage.

`historyId` gaps trigger a bounded reconciliation sync. Reauthentication becomes a Systems attention item. A delivery failure must not rerun already-completed domain analysis.

---

## 13. Website Chat

Website Chat is a richer secondary interface over the canonical conversation tables.

Required UX:
- `/chat` entry point;
- Planner default with optional manager selection;
- persistent conversation list;
- Gmail-originated conversations visible in the same list;
- full message history;
- attachments;
- execution/status indicators;
- related reports/actions/entities;
- transfer/owning-manager visibility;
- continue an email conversation from web;
- optionally continue a web conversation by email.

### 13.1 Web authority

An authenticated application session belonging to the allowed production user produces `verified_user` authority.

The site may enforce its normal login/MFA policy. Once authenticated, the platform must not introduce a second content-risk approval step merely because a chat command is destructive or sensitive.

### 13.2 Chat transport

The frontend may use an authenticated Edge Function/API route plus Supabase Realtime or streaming HTTP for status updates. Transport choice must not create a separate message store.

---

## 14. Command semantics

Every inbound authoritative user message is deterministically persisted first, then interpreted as one or more of:

| Type | Meaning | Execution behaviour |
|---|---|---|
| `statement` | factual update/context | update typed state only after domain validation/provenance |
| `request` | asks for information/research/recommendation | run manager reasoning/research |
| `command` | asks the system to change or execute something | create typed execution request |
| `correction` | says a prior fact/decision/output is wrong | append correction, repair typed state and possibly create regression case |
| `cancellation` | withdraws pending work | cancel if not committed; return receipt if too late |
| `clarification` | resolves an open ambiguity/question | resume waiting work |

One message may create multiple typed items when required, but each must retain the source message ID.

### 14.1 No content-based command veto

A verified user command is not subjected to a “should the user really be allowed to do this?” model gate.

Reasoning may be used to interpret parameters. Deterministic code validates capability, target and preconditions.

### 14.2 Ambiguity

Ambiguity is not risk classification. If a command cannot be executed unambiguously, persist state `waiting_for_dependency` and ask the minimum clarifying question.

### 14.3 Corrections

A correction must determine whether it changes:
- a factual domain record;
- a preference;
- a standing policy;
- a one-off instruction;
- agent memory/context;
- an evaluation/regression case.

Material model/agent errors should become regression cases.

### 14.4 Cancellation

Cancellation is idempotent.
- queued/waiting work becomes `cancelled`;
- currently executing work receives cancellation where the executor supports it;
- already irreversible completed work remains completed and the user receives an explicit `too_late_to_cancel` receipt.

---

## 15. Execution requests and receipts

Create a canonical `execution_requests` record for every executable command.

Required fields:
- `id`;
- `user_id`;
- `conversation_id`;
- `source_message_id`;
- `interpreting_manager_code`;
- `authority: verified_user | agent_proposal | standing_policy`;
- command type/version;
- canonical command text/intent;
- typed parameters;
- target type/reference;
- scope;
- execution mechanism;
- required capability;
- idempotency key;
- state;
- attempt count;
- dependency;
- result/reference;
- error code/redacted error;
- correlation ID;
- created/started/completed/cancelled timestamps.

States:

> `received → routed → queued → running → waiting_for_dependency → succeeded | failed | cancelled`

`agent_proposal` cannot become executable merely because an agent wants it. It requires the normal approval/policy path.

`verified_user` does not need a second human approval; it proceeds once capability and deterministic preconditions pass.

### 15.1 Execution receipts

Persist a receipt for:
- accepted/queued;
- waiting for dependency/clarification;
- final success;
- final failure;
- cancellation/too-late cancellation.

Avoid chat/email spam: fast commands may emit only the final receipt. Long-running or externally blocked commands should emit a useful acknowledgement/status.

---

## 16. Agent-to-agent contracts

Routine cross-agent communication is persisted structured state, not recursive model calls.

### 16.1 Planner Attention Item

Required schema:
- `id`;
- `user_id`;
- source manager;
- type;
- finding;
- recommended user-facing communication;
- recommended action;
- priority;
- urgency;
- deadline;
- expiry;
- evidence references;
- deduplication key;
- acknowledgement requirement;
- status;
- source run/conversation;
- created/acknowledged/resolved timestamps.

Lifecycle:
`new → queued_for_planner → incorporated | sent_immediately | dismissed | expired | resolved`.

Normal path:
> **Specialist → Planner Attention Queue → normal Planner run → User**

Urgent items may use the immediate notification path.

### 16.2 Inter-Agent Request

Required schema:
- source agent;
- destination agent;
- objective;
- required output contract;
- context/evidence references;
- priority;
- deadline;
- idempotency key;
- source run/message;
- status;
- result reference.

Lifecycle:
`requested → accepted → running → waiting_for_dependency → completed | rejected | failed | cancelled`.

The destination manager owns its domain judgement.

### 16.3 No hidden recursion

An agent may not recursively invoke another model agent just to “ask what it thinks” when the same need can be represented as a durable request. Model calls are made only when the destination workflow actually requires reasoning.

---

## 17. Agent → user channels

### Email
Primary conversational and briefing medium. Replies return to the same conversation.

### Google Tasks
Actionable prompts of the form “Do X”. Planner owns creation/update/completion semantics on `matthewirving99@gmail.com`. Timed/due tasks provide the phone reminder surface through Google Tasks / Google Calendar notifications.

### Google Calendar
Actual allocation of time on `matthewirving99@gmail.com`. Planner owns calendar writes. Use alerts sparingly:
- hard external/user-approved commitments may use normal event alerts;
- soft AI-managed blocks should avoid redundant alert spam;
- routine blocks use user-configured defaults.

Apple Calendar/Reminders are not Planner output channels. The Apple Shortcut/mobile bridge remains input-only for Apple Health and any explicitly retained sensor/source datasets that cannot be replaced by Google-native APIs.

### Dashboard
Persistent state, reports, evidence and operational visibility that does not need to interrupt the user.

### Immediate notification
Reserved for genuinely time-critical conditions with a clear action/decision horizon.

No new user-notification channel is added without explicit specification amendment.

---

## 18. Attachment lifecycle

Both Gmail and Web Chat attachments use the same ingestion pipeline:

> receive metadata → size/type checks → SHA-256 dedupe → raw quarantine object → malware/security scan → MIME verification → bounded extraction → source object/R2 storage → link to conversation/domain entity → retention policy

Requirements:
- content-address/deduplicate where appropriate;
- do not trust filename extension;
- malware/suspicious content is quarantined and never executed;
- archives have recursion, file-count and decompression-size limits;
- extraction failures remain evidence with explicit status rather than disappearing;
- parsed text/structured data carries source-object and extraction-version provenance;
- source bytes are not automatically placed into LLM context;
- sensitive financial/health/credential artefacts use data classification and redacted trace policy;
- retention defaults to durable evidence unless a domain-specific policy says otherwise.

---

# Part III — Data, State, Permission and Tool Contracts

## 19. Canonical source-of-truth map

| Domain | Target canonical store | Owning manager | Write authority | Conflict/stale rule |
|---|---|---|---|---|
| Identity/channel trust | Supabase `app_users`, connection-role and trusted-identity tables | Systems | authenticated admin/config flows | channel identity must be valid before user authority exists |
| Standing user policy/preferences | Supabase typed `user_policies` + domain policy tables | relevant specialist / Planner | explicit user instruction or approved migration | latest scoped explicit policy wins |
| Conversations | Supabase conversation/message/link tables; large bodies/attachments in R2 | shared runtime / current owner | verified transport + runtime | append-only; channel never owns separate memory |
| Finance | Supabase typed `finance_*` state plus new policy/opportunity/projection/application tables | Finance | Finance deterministic workflows + verified corrections | closed periods immutable without reopen/correction |
| Health | Supabase raw mobile ingestion + canonical health samples/summaries/plans | Health | ingestion adapters and Health workflows | missing capture lowers confidence, never proves inactivity |
| Planner/time | Supabase planning state plus synced Calendar/Reminder external truth | Planner | Planner + verified user commands | external hard commitments beat AI soft blocks |
| Career | Supabase career project/opportunity/radar/evidence state | Career | Career workflows and verified user corrections | evidence timestamps required for current claims |
| Travel | Supabase trip/itinerary/watch/evidence state | Travel | Travel workflows; user supplies booking confirmations | current price/availability expires quickly |
| Procurement | Supabase requirements/recommendations/lifecycle/receipt/watch state | Procurement | Procurement workflows; user purchase facts | price/stock claims expire |
| Digital estate | Supabase scans/inventory/findings/plans/quarantine + signed worker receipts | Digital | worker results + verified commands | device preconditions must match before mutation |
| Platform/runtime | Supabase workflows/runs/jobs/cost/audit/trace/prompt/eval state | Systems | runtime services | deterministic invariants take precedence |

### 19.1 Finance workbook migration rule

The current Personal Finance Manager workbook is a **legacy canonical source during migration**, because historical Finance operations and decisions were built around it.

The target architecture is not allowed to maintain two permanent competing canonical financial stores.

Cutover plan:
1. keep workbook read-only from the new platform while mapping;
2. backfill typed Supabase Finance state with provenance to workbook/source documents;
3. compare close fingerprints, balances, transaction counts, KPIs and key assumptions across multiple closed months;
4. resolve mismatches explicitly;
5. run Finance acceptance tests against both representations;
6. declare a recorded cutover version;
7. after cutover, Supabase typed Finance state becomes canonical; the workbook becomes a controlled compatibility/reporting mirror or archived reference;
8. never silently dual-write indefinitely.

---

## 20. Conflict resolution hierarchy

When instructions/data conflict, use:

1. latest explicit user instruction applicable to the scope;
2. standing user policy;
3. authoritative domain data;
4. specialist-domain judgement;
5. Planner scheduling judgement;
6. defaults.

Additional rules:
- newer does not automatically override an older instruction if it applies to a different scope;
- corrections preserve prior evidence and append a superseding record;
- Systems may block execution for authentication failure, missing capability, hard execution boundary, stale precondition or provider failure, but not because it disagrees with the desirability of an authenticated command;
- Planner may reject a proposed **time slot** but does not rewrite Health's training recommendation or Career's estimate of remaining project work;
- unresolved specialist conflicts become an Inter-Agent Request and, if materially irreconcilable, a concise user decision.

---

## 21. Freshness and confidence contracts

All externally changing data records must carry:
- `observed_at`/`retrieved_at`;
- source;
- verification method;
- confidence;
- expiry/max-age-for-decision;
- stale reason when stale.

The following are default decision contracts and may be tightened by source-specific policy:

| Data | “Current verified” default | Effect when stale |
|---|---|---|
| Finance balances/transactions for a close | complete through the close period or explicitly explained | blocks close readiness for unexplained required accounts |
| Credit report for new credit/current-account recommendation | latest available and normally ≤45 days, reconciled with known applications/openings | may discuss generally; must not call credit position current |
| Current financial incentive/offer | primary/authoritative source retrieved ≤24h before recommendation; reverify before action | label indicative/unknown and refresh |
| Travel fare/availability | provider/source observation normally ≤30 min for a “current verified” price | becomes indicative; do not promise availability |
| Same-day travel disruption | live source normally ≤15 min | refresh before advising action |
| Visa/entry rule | authoritative government/carrier source; revalidate close to travel | block “confirmed requirement” wording until refreshed |
| Procurement price/stock | retailer/manufacturer observation normally ≤24h | becomes indicative |
| Product recall/safety status | current authoritative retrieval when relevant to recommendation | refresh before safety-sensitive recommendation |
| Career job open-state | employer/ATS validation normally ≤24h when surfaced | stale role must be rechecked before “open” claim |
| Frontier AI release/repository state | dated source; ≤7d for “current” operational status unless event itself is historical | label historical/possibly changed |
| Health/mobile data | measured capture coverage against expected cadence | lower confidence; never infer inactivity from absence |
| Worker/device state | recent heartbeat appropriate to action execution | mutation waits for device/dependency |

A stale source blocks only conclusions that require freshness. It does not erase historical evidence.

---

## 22. Tool/capability matrix

Legend:
- `R` = read;
- `W` = write typed state/content;
- `X` = execute an external/platform action;
- `RE` = perform external research;
- `Q` = enqueue/request;
- `—` = no standing capability.

A capability listed as `X` still requires the authority rules in this specification. A manager cannot turn `—` into `X` with prompt text.

| Capability | Finance | Health | Travel | Procurement | Planner | Career | Digital | Systems |
|---|---|---|---|---|---|---|---|---|
| Canonical conversation content | R/W | R/W | R/W | R/W | R/W | R/W | R/W | R (operational; content only when troubleshooting) |
| Gmail conversation transport | Q | Q | Q | Q | R/W/X/Q | Q | Q | X/Q |
| Web Chat response transport | W | W | W | W | W | W | W | X |
| Own domain typed state | R/W | R/W | R/W | R/W | R/W | R/W | R/W | R |
| Other-domain detailed state | R as needed | R as needed | R as needed | R as needed | R summaries/links | R as needed | R as needed | R operationally |
| Planner Attention Queue | Q | Q | Q | Q | R/W/X | Q | Q | R/X |
| Inter-Agent Requests | R/W/Q | R/W/Q | R/W/Q | R/W/Q | R/W/Q | R/W/Q | R/W/Q | R/W/Q |
| Execution Request Queue | Q | Q | Q | Q/X for planner tools | Q | Q | Q/X for worker tools | R/W/X |
| Calendar read | R | R | R | R | R | R | R when relevant | R operationally |
| Calendar write/execute | — | — | — | — | W/X | — | — | infrastructure only |
| Reminder read | R | R | R | R | R | R | R | R operationally |
| Reminder write/execute | — | — | — | — | W/X | — | — | infrastructure only |
| Google Drive/Docs/Sheets read | R | R if domain source | R if trip source | R if receipt/source | R | R if career source | R if explicitly selected | R operationally |
| Google Drive report/write | W for finance compatibility/reporting | Q | Q | Q | W/Q | Q | Q | X infrastructure |
| Apple Health/mobile canonical read | — | R | — | — | R summary | — | — | R operationally |
| Finance historical transaction research | R | — | Q Finance | Q Finance | R summary | — | — | — |
| Web research | RE | RE when evidence needed | RE | RE | RE for planning facts | RE | RE for advisories | RE for platform facts |
| Personal GitHub repositories | — | — | — | — | — | R/RE | — | R only for platform operations when authorised |
| BrightSG repositories | — | — | — | — | — | **DENY** | — | **DENY** |
| Windows worker inventory | — | — | — | — | — | — | R/X/Q | R operationally |
| Windows worker mutation | — | — | — | — | — | — | X/Q | infrastructure/signing only |
| Isolated frontier-code sandbox | — | — | — | — | — | X/Q | — | X/Q |
| Financial transaction/investment execution | **—** | — | — | — | — | — | — | — |
| Travel booking/payment execution | — | — | **—** | — | — | — | — | — |
| Product purchase execution | — | — | — | **—** | — | — | — | — |
| Prompt/model configuration | — | — | — | — | — | — | — | R/W/X |
| Cost reservations/hard caps | R | R | R | R | R | R | R | R/W/X |
| Audit/trace append | Q | Q | Q | Q | Q | Q | Q | W/X |
| Immediate notification | Q | Q | Q | Q | Q/X | Q | Q | X |
| Routine user briefing | Q | Q | Q | Q | W/X | Q | Q | infrastructure only |

### 22.1 Research source discipline

Research-capable agents must:
- prefer primary/authoritative sources for mutable factual claims;
- preserve URL/source, retrieval time and evidence text/hash;
- distinguish observed fact from model inference;
- persist rejection/expiry when research is used for recurring watches;
- never treat popularity metrics alone as quality.

---

## 23. Shared execution guarantees

### 23.1 Idempotency
Every schedule, webhook, inbound Gmail message, chat submission, execution request, notification and worker manifest has a durable idempotency key.

### 23.2 Retries
Retry only retryable boundaries. Do not repeat completed deterministic writes or model analysis merely because a later notification failed.

### 23.3 Waiting dependencies
`waiting_for_dependency` is first-class. Examples:
- local worker offline;
- user clarification required;
- OAuth reauthentication required;
- external provider unavailable;
- another agent request outstanding.

Waiting work is resumable from persisted state.

### 23.4 Partial completion
Persist successful stages individually. A later stage failure does not erase earlier verified outputs. Final status remains failed/waiting as appropriate with a stage-level receipt.

### 23.5 Outages
Systems owns backoff, reconciliation and operator-visible health. Provider outages must not cause duplicate commands or duplicate user communications.

---

# Part IV — Current Repository Architecture Assessment

## 24. Assessment date and evidence boundary

This assessment is based on:
- the live `Matthew-Irving5/AI-Operations` repository on `main`;
- the live production Supabase project;
- production Edge Functions and schema;
- the connected Google Drive finance artefacts;
- the currently connected Gmail/Google account profile;
- official Gmail/Pub/Sub architecture guidance.

Repository implementation is evidence of current state, not authority over target functionality.

## 25. Verified current architecture

### 25.1 Web/runtime stack — verified
The repository currently uses:
- Next.js `16.3.3`;
- React `19.1.1`;
- OpenNext for Cloudflare;
- Supabase SSR/JS;
- Zod;
- a pnpm monorepo;
- a Python Windows worker.

The repo contains domain dashboard routes for Finance, Health, Personal, Travel, Procurement, Career, Digital Estate and Systems/Automation.

**Assessment:** `EXISTS AND SUFFICIENT` as the target base stack.

### 25.2 Supabase control plane — verified
Production contains RLS-enabled tables for:
- users/managers/workflow definitions;
- workflow runs, run steps, jobs and schedules;
- reports/actions/approvals;
- audit/trace;
- models, pricing, prompts, AI calls and cost reservations;
- notifications;
- Google OAuth/connections/cursors/messages/Drive/Calendar;
- Apple/mobile ingestion;
- Health;
- Finance;
- Career evidence;
- Travel/Procurement research scaffolding;
- Digital worker/inventory/plans/quarantine;
- freshness and onboarding.

Production also has deployed Edge Functions for scheduler/job runtime, OpenAI execution/webhook, notification delivery, Google OAuth/sync, Apple/mobile ingestion, Finance, Health, Career GitHub, Digital/worker and onboarding.

**Assessment:** strong reusable control-plane foundation.

### 25.3 Manager/workflow liveness — verified
Production has exactly the eight manager rows and 25 active workflow definitions.

However:
- all eight manager rows are currently `enabled=false`;
- `workflow_schedules` currently has **zero rows**;
- only one generic prompt template (`controlled-agent-report`) is approved;
- production `ai_calls` is currently empty.

Therefore the repository contains manager contracts and scaffolding, not eight fully live intelligent managers.

**Assessment:** `EXISTS BUT NEEDS EXTENSION`.

### 25.4 AI runtime — verified
Current runtime already provides:
- OpenAI Responses API;
- Luna/Terra/Sol model catalog;
- strict structured output;
- persisted prompt versions;
- deterministic cost reservation and settlement;
- token/cost reconciliation;
- evidence-linked report persistence;
- traces;
- action proposal persistence.

The current deployed AI executor deliberately disables tools/web search for its controlled report path.

**Assessment:** core runtime `EXISTS AND SUFFICIENT` as a foundation; research/tool routing and manager-specific contracts `EXISTS BUT NEEDS EXTENSION`.

### 25.5 Capability evaluation — verified
A golden evaluator exists, but it currently checks a small set of substring facts, prohibited claims, evidence IDs and cost.

The repository does not yet contain the required behavioural regression suite for all eight managers.

**Assessment:** `EXISTS BUT NEEDS EXTENSION`.

### 25.6 Google integration — verified
The platform has:
- OAuth state/PKCE;
- encrypted refresh-token persistence;
- Gmail readonly/send, Calendar readonly and Drive readonly scopes on the current connection;
- durable integration cursors;
- Google message/attachment tables;
- Drive and Calendar sync structures.

Current schema enforces a unique connection on `(user_id, provider)`, and the OAuth callback upserts on that key. The callback also currently allowlists the personal data-source Google account.

**Assessment:** `CURRENT IMPLEMENTATION CONFLICTS WITH SPEC` for dedicated mailbox/multi-role use.

### 25.7 Gmail communication — verified
Current Gmail functionality is primarily one-way notification delivery:
- `packages/integrations/src/gmail.ts` hard-codes one notification recipient;
- `notification-dispatch` uses a configured Gmail access token and sends a plain notification;
- no canonical conversation record is created;
- no Gmail `users.watch`;
- no Pub/Sub push consumer;
- no durable watch expiry;
- no `history.list` reconciliation flow;
- no sender-authority verification;
- no thread-aware inbound routing/reply contract.

Production `google_messages` currently contains no messages.

**Assessment:** existing notifier is `DEPRECATED/SHOULD BE REPLACED` as the primary conversation architecture, although its queue/retry concepts are reusable.

### 25.8 Canonical conversation/Web Chat — verified missing
No production tables matching canonical conversations, planner attention items, inter-agent requests or command receipts exist. Repository routes do not currently include a Chat surface.

**Assessment:** `MISSING`.

### 25.9 Approvals/MFA versus command authority — verified conflict
The current build contains generic approvals and fresh-MFA action gates for several sensitive web/configuration operations. Current AI-generated actions are explicitly stored as requiring approval.

Those controls are valid for agent proposals and channel/configuration administration. They conflict with this specification **only if** reused to make a verified Gmail/Web Chat command obtain a second approval based on command content.

**Assessment:** `EXISTS BUT NEEDS EXTENSION` with an authority-source distinction.

### 25.10 Windows worker — verified
The Windows worker:
- is outbound-only;
- verifies Ed25519-signed manifests;
- binds manifests to a device;
- checks expiry;
- uses file hash/mtime preconditions;
- enumerates allowed actions such as move, rename, archive, quarantine and quarantine purge;
- intentionally provides no arbitrary command execution.

**Assessment:** `EXISTS AND SUFFICIENT` as a security architecture; action catalogue needs extension for target Digital capabilities.

### 25.11 GitHub safety — verified
Shared integration code explicitly allowlists `Matthew-Irving5` and hard-denies `BrightSG` before repository content is accepted.

**Assessment:** `EXISTS AND SUFFICIENT`; regression-test permanently.

### 25.12 Mobile/Health ingestion — verified
Production contains substantial live mobile/health ingestion and normalisation state, including thousands of raw and normalised health/mobile records.

This is meaningful production plumbing, but trainer/adherence reasoning, persisted training interventions and Planner handoff are not yet equivalent to the target Health manager.

**Assessment:** ingestion `EXISTS AND SUFFICIENT`; manager intelligence `EXISTS BUT NEEDS EXTENSION`.

### 25.13 Finance legacy state — verified
Google Drive still contains the live Personal Finance Manager and active Finance Closing/Strategy/Monthly CFO operating documents and historical reports.

The production Supabase Finance schema exists but is only minimally populated relative to the legacy workbook.

**Assessment:** Finance platform schema `EXISTS BUT NEEDS EXTENSION`; workbook→Supabase canonical cutover is `MISSING`.

### 25.14 Travel/Procurement/Career/Digital state
Tables and deterministic scaffolding exist for these domains, but the broad functional behaviour in Part I is not implemented merely because tables exist.

**Assessment:** mostly `EXISTS BUT NEEDS EXTENSION`, with specific missing capabilities below.

---

# Part V — Functional Gap Analysis

## 26. Gap register

| ID | Required capability | Status | Core reason |
|---|---|---|---|
| GAP-001 | Eight manager registry | EXISTS AND SUFFICIENT | exact manager codes exist |
| GAP-002 | Manager lifecycle/runtime | EXISTS BUT NEEDS EXTENSION | framework exists; domain execution incomplete |
| GAP-003 | Canonical conversation backend | MISSING | no conversation tables/runtime |
| GAP-004 | Dedicated AI Ops Gmail mailbox | MISSING | current Gmail is personal connection/notifier |
| GAP-005 | Multi-role Google connections | CURRENT IMPLEMENTATION CONFLICTS WITH SPEC | unique `(user_id, provider)` and personal-account callback |
| GAP-006 | Gmail watch/PubSub/history ingestion | MISSING | no inbound push/reconciliation path |
| GAP-007 | Thread-preserving conversational send | CURRENT IMPLEMENTATION CONFLICTS WITH SPEC | current notifier is recipient/subject based |
| GAP-008 | Verified Gmail user-command authority | MISSING | no sender-auth contract |
| GAP-009 | Website Chat | MISSING | no shared chat UI/API |
| GAP-010 | Command semantic types/receipts | MISSING | actions do not capture authoritative source message semantics |
| GAP-011 | Agent-proposal vs verified-user authority | CURRENT IMPLEMENTATION CONFLICTS WITH SPEC | current approval model has no canonical authority-source distinction |
| GAP-012 | Planner Attention Items | MISSING | no durable queue/contract |
| GAP-013 | Inter-Agent Requests | MISSING | no durable contract |
| GAP-014 | `waiting_for_dependency` run semantics | EXISTS BUT NEEDS EXTENSION | current run enum lacks it |
| GAP-015 | Cross-channel attachments | EXISTS BUT NEEDS EXTENSION | Google/mobile source-object plumbing exists; conversation pipeline does not |
| GAP-016 | Planner Google Calendar/Tasks execution | EXISTS BUT NEEDS EXTENSION | Google Calendar read/sync exists; Planner-owned Calendar/Tasks write contract incomplete; Apple output is deprecated |
| GAP-017 | Finance close migration/parity | EXISTS BUT NEEDS EXTENSION | legacy workbook functionality exceeds typed production state |
| GAP-018 | Finance opportunity engine | MISSING | target opportunity/credit-opening state not represented sufficiently |
| GAP-019 | Finance projection policy | EXISTS BUT NEEDS EXTENSION | financial scaffolding exists; bounded 3-month policy not canonical |
| GAP-020 | Health active-trainer/adherence loop | EXISTS BUT NEEDS EXTENSION | ingestion strong, intervention workflow missing |
| GAP-021 | Travel full trip state and live research | EXISTS BUT NEEDS EXTENSION | on-demand/watch scaffold only |
| GAP-022 | Procurement requirement-first lifecycle | EXISTS BUT NEEDS EXTENSION | recommendation/lifecycle tables exist; full workflow absent |
| GAP-023 | Career project manager + job sniper | EXISTS BUT NEEDS EXTENSION | GitHub evidence exists; persistent projects/opportunity workflow incomplete |
| GAP-024 | Frontier AI Technology Radar | MISSING | no candidate lifecycle/evidence/evaluation state |
| GAP-025 | Disposable code-evaluation sandbox | MISSING | must not use Windows worker |
| GAP-026 | Digital security/credential posture | EXISTS BUT NEEDS EXTENSION | file/device scaffold present; security inventory/action catalogue incomplete |
| GAP-027 | Typed direct-user permanent-delete path | MISSING | current worker purges quarantine only |
| GAP-028 | Research-capable manager runtime | EXISTS BUT NEEDS EXTENSION | library supports web search, deployed controlled executor disables tools |
| GAP-029 | Per-manager prompt set | MISSING | one approved generic prompt only |
| GAP-030 | Full capability regression gate | EXISTS BUT NEEDS EXTENSION | small evaluator exists; no full behavioural gate |
| GAP-031 | Specification/version governance | EXISTS BUT NEEDS EXTENSION | build docs exist; this functional spec must become precedence source |
| GAP-032 | Production schedules | MISSING | zero schedule rows despite definitions |
| GAP-033 | Manager enablement/controlled rollout | MISSING | all managers currently disabled |
| GAP-034 | Freshness contracts per decision type | EXISTS BUT NEEDS EXTENSION | generic freshness exists; decision SLAs absent |
| GAP-035 | Conversation-linked observability | MISSING | run correlation exists, conversation correlation does not |
| GAP-036 | Unified feedback→state/policy/eval correction flow | EXISTS BUT NEEDS EXTENSION | generic feedback table exists, correction semantics absent |
| GAP-037 | Finance legacy scheduled-task parity | DEPRECATED/SHOULD BE REPLACED | legacy Drive/task model must become platform schedules/queues |
| GAP-038 | One-way hard-coded Gmail notifier | DEPRECATED/SHOULD BE REPLACED | preserve delivery queue concepts, replace transport model |

---

# Part VI — Technical Implementation Blueprint

## 27. Work package A — Make this specification executable governance

**Covers:** GAP-031, GAP-030.

**Files/modules**
- add this file at repo root as `AI_OPERATIONS_AGENT_SPEC.md`;
- update `AGENTS.md` authoritative-file order so this document is read before agent/runtime changes;
- add `docs/architecture/agent-spec-governance.md`;
- add `packages/ai-runtime/src/spec-version.ts` exposing the current functional spec version.

**Database**
- add `spec_versions` or equivalent immutable deployment record;
- capability-evaluation runs record the spec version they validated.

**Migration**
- additive migration only.

**API/contracts**
- all manager-run traces include `agent_spec_version`.

**Security**
- no runtime code or prompt may change authority rules.

**Tests/evals**
- CI fails when agent runtime changes without evaluating the relevant spec-version suite.

**Observability**
- dashboard shows deployed spec version and most recent passing capability suite.

**Rollout**
- first dependency for every later work package.

---

## 28. Work package B — Agent runtime v2 schema and contracts

**Covers:** GAP-003, GAP-010–015, GAP-034–036.

**Packages**
Create Zod/type contracts in `packages/contracts` for:
- Conversation;
- ConversationMessage;
- ConversationAttachment;
- ConversationTransfer;
- PlannerAttentionItem;
- InterAgentRequest;
- ExecutionRequest/Receipt;
- TrustedIdentity;
- UserPolicy;
- FreshnessRequirement.

Extend `packages/manager-core` with typed context and handoff APIs. Do not put ownership rules only in prompt strings.

**Database migration**
Add RLS-enabled tables:
- `trusted_user_identities`;
- `user_policies`;
- `conversations`;
- `conversation_messages`;
- `conversation_attachments`;
- `conversation_transfers`;
- `conversation_entity_links`;
- `planner_attention_items`;
- `inter_agent_requests`;
- `execution_requests`;
- `execution_attempts`;
- `execution_receipts`;
- `spec_versions`;
- `capability_eval_suites`, `capability_eval_cases`, `capability_eval_runs`, `capability_eval_results`.

Extend `run_status` with `waiting_for_dependency` or migrate run status safely to an extensible constrained text domain. Preserve historical run values.

Add indexes for:
- conversation/user/last-message;
- Gmail thread ID;
- message Gmail ID/dedupe;
- planner attention status/priority/deadline;
- inter-agent destination/status;
- execution state/available-at/idempotency;
- source message/correlation ID.

**RLS**
Only the production user may read user content. Service-role/Edge paths write through narrow functions. Attachment raw objects retain classification controls.

**RPC/API**
Implement transactional RPCs for:
- append inbound message + dedupe;
- claim routing;
- create execution request from verified message;
- transition execution state;
- create/resolve attention item;
- create/claim/complete inter-agent request.

**Tests**
Concurrency/idempotency tests are mandatory.

---

## 29. Work package C — Role-aware Google connections

**Covers:** GAP-004, GAP-005.

**Current files to change**
- `supabase/migrations/202608030002_personal_integrations.sql` is historical; create a new forward migration rather than editing it;
- `supabase/functions/google-oauth-start/`;
- `supabase/functions/google-oauth-callback/`;
- `supabase/functions/google-connection-*`;
- `_shared/google-sync.ts`;
- `apps/web/app/(dashboard)/data-sources/`.

**Database migration**
- add `role` to `connections`;
- replace unique `(user_id, provider)` with unique `(user_id, provider, role)`;
- migrate the existing Google connection to `personal_data_source`;
- add `connection_role` to OAuth state;
- persist verified account email and role-specific configuration.

**OAuth**
Role-aware allowlist:
- personal connection must match the configured personal data-source account;
- mailbox connection must match the configured dedicated AI Operations mailbox.

Scopes are validated per role rather than against one global exact set.

**UI**
Data Sources shows separate cards for Personal Google Data and AI Operations Mailbox.

**Security**
Changing either trusted account is a configuration/admin operation and may require normal site AAL2. This is distinct from command-level authority.

**Tests**
Cross-role token isolation, wrong-account rejection, reconnect/revoke, scope mismatch and migration of the existing row.

---

## 30. Work package D — Gmail watch, inbound ingestion and conversational send

**Covers:** GAP-006–008, GAP-015, GAP-038.

**New Edge Functions**
- `gmail-watch-renew`;
- `gmail-pubsub-push`;
- `gmail-history-reconcile`;
- `gmail-conversation-send`.

**Shared integration module**
Refactor `packages/integrations/src/gmail.ts` into:
- authenticated mailbox client;
- watch/history client;
- MIME parser/normaliser;
- sender-auth verifier;
- thread-aware sender.

The current hard-coded notification-recipient client becomes a compatibility shim and is removed after cutover.

**Infrastructure**
Add GCP Pub/Sub provisioning documentation/IaC:
- Gmail topic;
- Gmail API publisher permission;
- authenticated push subscription;
- dedicated push service account;
- audience configuration;
- endpoint secret-free OIDC verification.

**Database**
- mailbox-watch metadata: connection, current history ID, expiration, last renewal, last successful reconciliation;
- push-event dedupe record;
- canonical messages and attachments from Work Package B.

**Processing**
1. verify Pub/Sub OIDC;
2. persist push event/dedupe;
3. claim mailbox cursor;
4. call `history.list`;
5. fetch added messages;
6. verify sender authority;
7. persist canonical message;
8. advance cursor transactionally after durable acceptance;
9. enqueue routing.

**Fallback**
Schedule bounded reconciliation even without push events.

**Thread send**
Use both Gmail `threadId` and RFC reply headers. Store every outbound provider ID before marking delivery complete.

**Tests**
Fixture coverage for duplicates, cursor gaps, expired watch, wrong OIDC audience, wrong sender, spoofed From, auth-header failure, quoted text, aliases, attachments, retry and thread continuity.

---

## 31. Work package E — Website Chat

**Covers:** GAP-009, GAP-035.

**Web**
Add:
- `apps/web/app/(dashboard)/chat/page.tsx`;
- conversation list/detail components;
- manager selector;
- attachment uploader;
- status/receipt timeline;
- entity/report/action links.

**API**
Authenticated API/Edge endpoints:
- create conversation;
- append message;
- upload attachment;
- cancel pending execution;
- transfer manager;
- stream/poll status.

Every web message is written to the same canonical tables as Gmail before routing.

**Security**
Use authenticated `app_users` identity. No model-generated recipient or manager can change user authority.

**Tests**
Playwright:
- Gmail-origin conversation appears in Chat;
- continue via web;
- web-origin conversation can receive email continuation;
- mobile Safari + desktop Chromium;
- attachment lifecycle;
- permission/error/loading/empty states.

---

## 32. Work package F — Router, command interpreter and execution lifecycle

**Covers:** GAP-002, GAP-010, GAP-011, GAP-014.

**Packages**
Add:
- `packages/manager-core/src/router.ts`;
- `packages/manager-core/src/command-semantics.ts`;
- `packages/manager-core/src/execution.ts`;
- manager ownership registry.

Routing is deterministic where possible:
- thread owner;
- explicit alias/agent;
- Planner default.

A model may interpret free-form parameters into a strict schema, but it cannot choose its own authority level.

**Authority**
`conversation_messages.authority` is assigned by transport/auth code, never by the model.

**Actions**
Existing `actions` may remain the user-facing proposal object, but executable commands must link to `execution_requests`.

- AI output → `agent_proposal` → approval/policy path.
- verified user message → `verified_user` → no second approval.
- standing policy → only explicitly pre-authorised narrow automations.

**Run states**
Introduce `waiting_for_dependency` and stage-level resumability.

**Tests**
Prove a destructive-sounding verified command is not diverted to MFA merely due to content; separately prove unsupported actions and invalid targets are rejected with concrete capability errors.

---

## 33. Work package G — Planner Attention and Inter-Agent runtime

**Covers:** GAP-012, GAP-013.

**Runtime**
Add queue claim/complete services and deterministic dedupe.

Planner run context always includes:
- unexpired attention items;
- deadlines;
- current calendar/reminder state;
- recent execution receipts;
- user policy.

Planner marks included attention items atomically with the produced message/plan.

Urgent notification is a separate explicit transition, not merely a high model score.

**Tests**
- duplicate specialist findings collapse;
- expired items do not surface;
- acknowledgement-required items remain open until receipt;
- Health recommendation text cannot be silently modified by Planner;
- inter-agent request resumes original run.

---

## 34. Work package H — Planner Google Calendar / Google Tasks execution

**Covers:** GAP-016.

Planner output is Google-native on the canonical personal data account `matthewirving99@gmail.com`. Do not build Apple Calendar/Reminders write-back.

Add explicit Google action contracts:
- Google Tasks create/update/complete/delete;
- Google Calendar create/update/delete for allowed AI-managed events;
- task list/calendar selection and AI-managed source metadata;
- soft-block metadata/source ID;
- idempotency and provider receipt.

Google Calendar + Google Tasks write scopes are intentionally required for the `personal_data_source` role and must be requested/configured explicitly. The communication-only AI Operations mailbox must not receive these scopes.

Planner writes only through typed execution requests.

Tests include recurring tasks/events, timezone/DST, task notification timing, duplicate action receipt, stale external modification and soft-vs-hard block handling on the real Google provider path.

---

## 35. Work package I — Finance consolidation and canonical migration

**Covers:** GAP-017–019, GAP-037.

**Existing modules to reuse**
- Finance account/statement/transaction/close tables;
- `finance-control`;
- import/reconciliation helpers;
- reports, notifications, costs and audit.

**New/extended Finance state**
Add:
- `finance_account_events` / known opening-application ledger;
- `finance_credit_snapshots` or references to imported credit evidence;
- `finance_opportunities`;
- `finance_memberships`;
- `finance_rewards`;
- `finance_merchant_rules`;
- `finance_projection_inputs`;
- `finance_projection_results`;
- `finance_followup_items`;
- close fingerprints and reopen/correction records where not already sufficient.

**Workbook migration adapter**
Create an explicit adapter package, not ad hoc spreadsheet reads inside prompts. It maps legacy tabs/records into typed domain records with source cell/range provenance.

Cutover is gated by reconciliation parity, not date.

**Target Finance workflows**
Minimum:
- `finance-close-readiness`;
- `finance-monthly-close`;
- `finance-monthly-cfo`;
- `finance-opportunity-scan`;
- `finance-financial-control-monitor`;
- `finance-quarterly-review`;
- `finance-calendar-year-review`;
- `finance-tax-year-review`;
- manual Finance Q&A/decision workflow.

Legacy scheduled-task concepts become Supabase schedules/condition-driven jobs. Email retry retries delivery only.

**Research**
Financial opportunities use current web research through bounded research contracts and persist source freshness.

**Evaluations**
Include historical synthetic closes, transfer classification, missing account, one-off normalisation, rolling six-month opening constraint, stoozing ring fence, opportunity dedupe and “no autonomous transaction” cases.

---

## 36. Work package J — Health trainer/adherence manager

**Covers:** GAP-020.

Reuse mobile ingestion and health samples/summaries.

Add:
- structured training sessions/plan steps;
- expected-vs-observed session matching;
- adherence streak/pattern state;
- workload/recovery features;
- intervention records;
- Health→Planner attention requests;
- plan-version history.

No session is marked missed solely because a metric is absent when capture completeness is low.

Golden tests must prove repeated misses cause plan intervention and Planner handoff.

---

## 37. Work package K — Travel manager

**Covers:** GAP-021, GAP-028.

Add typed:
- `travel_trips`;
- `travel_segments`;
- `travel_accommodations`;
- `travel_itinerary_items`;
- `travel_documents_requirements`;
- `travel_booking_records`;
- `travel_price_observations`;
- `travel_disruption_events`.

Keep existing watch/research structures where compatible.

Research output schema always includes evidence status `current_verified | indicative | historical | unknown`, mandatory charges and total cost.

No booking execution tool is exposed.

---

## 38. Work package L — Procurement manager

**Covers:** GAP-022, GAP-028.

Extend:
- requirement set and weights;
- candidate products;
- evidence/review sources;
- price observations;
- compatibility checks;
- lifecycle/receipt/returns/warranty state;
- watches.

Recommendation schema must show requirement coverage and exclusions before ranking.

No purchase execution tool is exposed.

---

## 39. Work package M — Career manager, Job Sniper and Technology Radar

**Covers:** GAP-023–025, GAP-028.

**Career state**
Add:
- `career_projects`;
- `career_project_milestones`;
- `career_job_opportunities`;
- `career_job_evidence`;
- `ai_technology_candidates`;
- `ai_technology_evidence`;
- `ai_technology_evaluations`;
- `ai_technology_rejections`.

Reuse `career_github_evidence` and hard owner validation.

**Research**
Implement bounded source collectors for employer career sites, research sources, repository/release/package metadata and paper sources. Every “open job” is revalidated from a primary source before surfacing.

**Disposable evaluation service**
Add an `EvaluationRunner` integration. Recommended deployment is a dedicated Google Cloud Run Jobs service because the product already requires GCP for Gmail Pub/Sub.

Security profile:
- separate GCP project or tightly isolated service account;
- no Supabase service-role key, OpenAI key, Gmail token, worker key or user files;
- ephemeral filesystem;
- no inbound connectivity;
- restricted egress;
- CPU/memory/duration ceilings;
- immutable base image;
- candidate repository/source fetched per run;
- logs/metrics returned through a narrow signed callback;
- job destroyed after run.

Do not substitute the Windows worker.

---

## 40. Work package N — Digital security and explicit worker capabilities

**Covers:** GAP-026, GAP-027.

Preserve current signed-manifest architecture.

Extend worker with narrowly typed actions only where required, for example:
- `collect_security_status`;
- `collect_startup_inventory`;
- `start_defender_scan`;
- `quarantine_exact`;
- `purge_quarantine`;
- `purge_exact_path` for a verified direct user command.

`purge_exact_path` must:
- accept exact path token(s), never shell or wildcard text;
- be limited to configured remote-manageable roots;
- enforce maximum item count/size policy;
- revalidate hash/mtime/inventory identity immediately before deletion;
- reject stale/missing targets;
- use a signed expiring manifest;
- write a complete receipt.

This is a capability boundary, not a content-risk classifier.

---

## 41. Work package O — Per-manager AI runtime and research

**Covers:** GAP-002, GAP-028, GAP-029.

Create one versioned prompt family/output schema per manager and task class.

Prompts must reference or embed generated hard-rule fragments from this spec so a prompt cannot drift from ownership/authority rules.

Enhance `ai-execute` to support an allowlisted tool profile per workflow:
- no tools;
- web research;
- bounded internal retrieval;
- isolated evaluator request;
- never arbitrary tool execution.

Model routing remains Systems-owned and cost-bounded.

All AI calls preserve:
- prompt version;
- model;
- tool profile;
- evidence refs;
- spec version;
- cost reservation/actuals;
- validation/evaluation result.

---

## 42. Work package P — Capability regression platform

**Covers:** GAP-030.

Replace the current minimal evaluator as the only quality gate with layered evaluation:

1. deterministic contract tests;
2. fixture-based functional tests;
3. golden model scenarios;
4. tool-authority tests;
5. adversarial prompt/authority tests;
6. cost/latency envelope;
7. cross-manager boundary cases;
8. migration/backward-compatibility cases.

Repository layout:
- `evals/global/`;
- `evals/finance/`;
- `evals/health/`;
- `evals/travel/`;
- `evals/procurement/`;
- `evals/personal/`;
- `evals/career/`;
- `evals/digital_estate/`;
- `evals/systems/`.

Each case specifies:
- spec rule IDs;
- fixture/evidence;
- user message or scheduled trigger;
- expected structured state/output;
- prohibited behaviour;
- tool calls permitted/forbidden;
- freshness expectation;
- maximum acceptable cost class.

CI blocks promotion when a required case regresses.

---

## 43. Work package Q — Observability and operations UI

**Covers:** GAP-035, GAP-032, GAP-033.

Extend dashboards so a correlation chain can be followed:

> conversation → message → route → run → AI call/tool → action/execution → provider/worker receipt → report → notification

Add views for:
- conversation processing errors;
- Gmail watch/cursor health;
- Planner Attention Queue;
- inter-agent queue;
- waiting dependencies;
- execution requests/receipts;
- spec/evaluation status;
- manager enablement;
- schedules;
- cost by conversation/manager/workflow;
- stale sources.

Systems must be able to detect “definition exists but manager/schedule is disabled” as an operational condition.

---

# Part VII — Migration / Rollout Order

## 44. Dependency-driven rollout

No arbitrary calendar dates are part of this plan.

### Stage 1 — Freeze governance
Land this specification, precedence rules, spec version and initial regression skeleton.

### Stage 2 — Shared runtime schema
Add canonical conversation, command, attention, inter-agent, execution and evaluation tables/contracts without changing user-facing behaviour.

### Stage 3 — Google connection-role migration
Migrate/configure `matthewirving99@gmail.com` as `personal_data_source` for Drive + Google Calendar + Google Tasks; configure `matthew.irving.ai@gmail.com` as the Gmail-only production `ai_operations_mailbox` and `matthew.irving.ai.staging@gmail.com` as the isolated Gmail-only staging mailbox, without breaking current Drive/finance ingestion.

### Stage 4 — Gmail canonical conversation
Provision Pub/Sub, watch renewal, history reconciliation, verified sender identity, inbound persistence and thread-aware send. Keep old notification delivery only as a fallback until parity is proven.

### Stage 5 — Website Chat
Add the shared Chat UI/API and prove cross-channel continuity.

### Stage 6 — Command/execution authority cutover
Introduce verified-user versus agent-proposal authority. Migrate existing action/approval paths so direct authenticated commands do not receive content-based approval/MFA challenges.

### Stage 7 — Agent-to-agent queues and Planner consolidation
Enable Planner Attention Items and Inter-Agent Requests before activating high-frequency specialist workflows.

### Stage 8 — Systems + Planner live foundation
Make scheduling, dependency waits, retries, operational dashboards, Calendar/Reminder execution and briefing consolidation production-ready.

### Stage 9 — Finance consolidation
Migrate legacy Finance workflows/state, reach workbook parity, cut over canonical state only after acceptance, then enable monthly/quarterly/opportunity/control workflows.

### Stage 10 — Health active-trainer loop
Layer reasoning/adherence/intervention onto already-live ingestion.

### Stage 11 — Career core + Job Sniper
Enable project state and evidence-backed opportunity discovery.

### Stage 12 — Travel and Procurement
Enable bounded research, persistent lifecycle state and watches with freshness labelling.

### Stage 13 — Digital security/action expansion
Add endpoint posture actions and explicit verified-user purge capability without arbitrary execution.

### Stage 14 — Frontier Technology Radar + isolated evaluator
Deploy disposable code-evaluation environment only after its isolation suite passes.

### Stage 15 — Full capability gate
All eight manager suites must pass with target prompts/models/tool profiles before managers are enabled broadly.

### Stage 16 — Controlled schedule activation
Populate `workflow_schedules`, enable managers one by one, observe runs/costs/failures, then retire superseded legacy scheduled tasks and one-way Gmail paths.

### Rollback principle
Every stage must be forward-safe and independently reversible at the feature-flag/manager/schedule level. Do not destroy legacy Finance authority before successful canonical cutover.

---

# Part VIII — Acceptance & Regression Test Catalogue

## 45. Global identity/authority tests

- **AUTH-001** — authenticated Web Chat message is persisted as `verified_user`.
- **AUTH-002** — verified Gmail message from the allowlisted sender is `verified_user`.
- **AUTH-003** — visually identical/spoofed From with failed authentication is not user authority.
- **AUTH-004** — non-allowlisted sender cannot issue commands.
- **AUTH-005** — quoted/forwarded command text is not treated as newly authored authority without explicit user instruction.
- **AUTH-006** — agent-generated recommendation never receives `verified_user` authority.
- **AUTH-007** — destructive-sounding verified command is not diverted to content-based MFA/approval.
- **AUTH-008** — channel/bootstrap configuration may still require normal AAL2.
- **AUTH-009** — unsupported capability returns `unsupported_capability`, not invented execution.
- **AUTH-010** — BrightSG repository access is denied before content retrieval.

## 46. Conversation tests

- **CONV-001** — Gmail message creates one canonical conversation/message.
- **CONV-002** — duplicate Pub/Sub notification does not duplicate the Gmail message.
- **CONV-003** — second Gmail reply with same thread stays in same conversation.
- **CONV-004** — Gmail conversation continued in Web Chat retains owner/history.
- **CONV-005** — Web Chat conversation can send an email continuation without creating separate memory.
- **CONV-006** — explicit alias routes new thread to specialist.
- **CONV-007** — existing thread ownership beats later alias/subject ambiguity.
- **CONV-008** — unaddressed new conversation routes to Planner.
- **CONV-009** — manager transfer is persisted and reversible/auditable.
- **CONV-010** — entity/run/report/action links survive cross-channel continuation.

## 47. Gmail reliability/security tests

- **GMAIL-001** — `users.watch` renewal occurs before expiry.
- **GMAIL-002** — invalid Pub/Sub OIDC signature rejected.
- **GMAIL-003** — wrong audience/service account rejected.
- **GMAIL-004** — history cursor advances only after durable message acceptance.
- **GMAIL-005** — expired history cursor triggers bounded reconciliation.
- **GMAIL-006** — fallback reconciliation recovers a dropped push.
- **GMAIL-007** — send retry does not duplicate a reply.
- **GMAIL-008** — `threadId`, `In-Reply-To` and `References` preserve Gmail threading.
- **GMAIL-009** — refresh-token failure becomes waiting dependency/System attention.
- **GMAIL-010** — email delivery failure retries email only, not completed analysis.

## 48. Command lifecycle tests

- **CMD-001** — statement updates appropriate typed fact with provenance.
- **CMD-002** — request launches reasoning/research, not mutation.
- **CMD-003** — command creates execution request linked to source message.
- **CMD-004** — correction supersedes typed fact without deleting evidence.
- **CMD-005** — cancellation cancels queued work idempotently.
- **CMD-006** — cancellation after irreversible completion returns too-late receipt.
- **CMD-007** — ambiguous target enters `waiting_for_dependency` and asks one focused question.
- **CMD-008** — restart resumes waiting work without replaying prior completed stages.
- **CMD-009** — identical retried user message does not execute twice.
- **CMD-010** — user command wins over conflicting older standing policy in the same scope.

## 49. Agent-to-agent and Planner tests

- **A2A-001** — duplicate attention dedupe key yields one open item.
- **A2A-002** — expired attention does not surface.
- **A2A-003** — normal specialist finding waits for Planner briefing.
- **A2A-004** — urgent item can use immediate-notification transition.
- **A2A-005** — inter-agent request is durable and resumes source workflow.
- **A2A-006** — Planner cannot rewrite specialist domain conclusion as its own.
- **PLAN-001** — hard external commitment is not moved by AI.
- **PLAN-002** — soft AI block is rescheduled after actual behaviour diverges.
- **PLAN-003** — missed task causes reprioritise/reschedule, not day-plan collapse.
- **PLAN-004** — Calendar/Reminder writes are idempotent.
- **PLAN-005** — travel/preparation buffers respect stored user rules.
- **PLAN-006** — routine brief consolidates multiple specialist items without duplicate messages.

## 50. Finance tests

- **FIN-001** — missing active account blocks close unless explicitly explained.
- **FIN-002** — missing evidence is not interpreted as zero activity.
- **FIN-003** — card purchase is expense; repayment is internal transfer.
- **FIN-004** — owned-account transfer does not inflate expenditure.
- **FIN-005** — stoozing principal excluded from emergency/house/FIRE resources.
- **FIN-006** — NEST/pension pot movement is not labelled performance with incomplete flows.
- **FIN-007** — close questions are consolidated by priority.
- **FIN-008** — `Close the month` authoritative command closes only after deterministic reconciliation/data-quality gates.
- **FIN-009** — closed month cannot be silently overwritten.
- **FIN-010** — manual and scheduled monthly CFO run produce same functional outputs for same fingerprint.
- **FIN-011** — notification retry does not rerun CFO analysis.
- **FIN-012** — opportunity uses actual historical transactions when relevant.
- **FIN-013** — opportunity record persists gross/net/effort/probability/deadline/credit/tax/liquidity/risk/prerequisites.
- **FIN-014** — completed opportunity is not resurfaced without incremental benefit.
- **FIN-015** — current/credit-account recommendation checks known openings plus latest credit evidence.
- **FIN-016** — third new current/credit account inside rolling six months is not recommended unless explicit override exists.
- **FIN-017** — Santander never-switch standing policy is respected unless explicitly changed.
- **FIN-018** — Chase is not assumed to be donor.
- **FIN-019** — forward projection uses latest three reliable closed Normalised Cash Surplus months.
- **FIN-020** — historical actual surplus remains unchanged after projection normalisation.
- **FIN-021** — Finance cannot execute a financial transfer/investment/purchase.
- **FIN-022** — live incentive older than freshness threshold is refreshed or labelled non-current.
- **FIN-023** — workbook→Supabase cutover test reconciles balances/counts/fingerprints before canonical switch.

## 51. Health tests

- **HLTH-001** — incomplete Apple/mobile capture lowers confidence, not activity.
- **HLTH-002** — repeated missed sessions trigger intervention.
- **HLTH-003** — Health changes training content; Planner changes schedule.
- **HLTH-004** — Health attention item is consolidated by Planner.
- **HLTH-005** — plan version preserves history after adaptation.
- **HLTH-006** — health data never leaks into unrelated manager prompt context without need.

## 52. Travel tests

- **TRAV-001** — fare includes mandatory baggage/fees/transfer cost in total comparison.
- **TRAV-002** — stale fare is `indicative`, not `current_verified`.
- **TRAV-003** — live disruption is refreshed before action advice.
- **TRAV-004** — visa/document claim cites current authoritative evidence.
- **TRAV-005** — Travel cannot book/pay.
- **TRAV-006** — Planner receives trip/preparation calendar items without owning Travel's routing judgement.

## 53. Procurement tests

- **PROC-001** — hard requirements are extracted before candidate ranking.
- **PROC-002** — affiliate/popularity rank does not override requirement fit.
- **PROC-003** — price/stock stale state is visible.
- **PROC-004** — warranty/return deadline persists after purchase record.
- **PROC-005** — Procurement cannot purchase.
- **PROC-006** — Finance cashback request is an inter-agent request, not duplicated research.

## 54. Career/Frontier tests

- **CAREER-001** — project tracks objective/value/milestones/evidence/remaining work/blocker.
- **CAREER-002** — Planner schedules Career work without changing Career's completeness estimate.
- **CAREER-003** — job is revalidated open from primary employer/ATS source before surfacing as open.
- **CAREER-004** — unsupported “low competition” claim fails evaluation.
- **CAREER-005** — salary confidence distinguishes evidence from inference.
- **CAREER-006** — GitHub owner not exactly `Matthew-Irving5` is rejected.
- **CAREER-007** — BrightSG is hard denied.
- **RADAR-001** — candidate follows persisted lifecycle.
- **RADAR-002** — rejected candidate retains rejection reason.
- **RADAR-003** — GitHub stars alone cannot pass quality validation.
- **RADAR-004** — isolated evaluator has no production credentials.
- **RADAR-005** — isolated evaluator cannot reach user Windows worker/private data.
- **RADAR-006** — evaluator resource/time/network limits terminate runaway candidate.

## 55. Digital tests

- **DIG-001** — arbitrary shell command is unrepresentable.
- **DIG-002** — unsigned/expired/wrong-device manifest rejected.
- **DIG-003** — stale hash/mtime precondition rejects mutation.
- **DIG-004** — agent-proposed cleanup defaults to quarantine before purge.
- **DIG-005** — verified direct user permanent-delete command uses typed exact-path capability without content-risk MFA.
- **DIG-006** — permanent-delete capability cannot use wildcard/shell syntax or leave configured roots.
- **DIG-007** — plaintext password vault is never added to model context.
- **DIG-008** — credential age alone does not force rotation.
- **DIG-009** — endpoint malware judgement comes from trusted tooling/evidence, not model invention.

## 56. Systems/capability tests

- **SYS-001** — schedule/webhook/job/message idempotency survives concurrent retries.
- **SYS-002** — `waiting_for_dependency` resumes correctly.
- **SYS-003** — dead-letter retains correlation and redacted error.
- **SYS-004** — cost reservation rejects call above hard cap.
- **SYS-005** — failed notification does not repeat successful domain writes.
- **SYS-006** — all AI calls record model/prompt/spec/evidence/cost trace.
- **SYS-007** — prompt change cannot promote with failed manager golden case.
- **SYS-008** — schema/tool change triggers affected capability suite.
- **SYS-009** — TypeScript/unit tests passing does not override failed capability eval.
- **SYS-010** — manager enabled with no required schedule is visible as an operational exception.
- **SYS-011** — stale integration state is surfaced with reason and last success.
- **SYS-012** — rollback restores previous prompt/model/tool profile without changing domain state.

## 57. Attachment tests

- **ATT-001** — same bytes on Gmail/Web dedupe by hash while preserving message links.
- **ATT-002** — MIME mismatch is detected.
- **ATT-003** — malicious attachment quarantined and never executed/extracted into model context.
- **ATT-004** — archive bomb limits enforced.
- **ATT-005** — extraction version/provenance retained.
- **ATT-006** — sensitive attachment raw bytes excluded from normal traces.
- **ATT-007** — failed extraction remains visible as failed evidence.

## 58. Definition of agent-functionality complete

The agent layer is complete only when:
1. this specification is present and referenced as authoritative;
2. canonical Gmail/Web conversations work cross-channel;
3. verified command authority is implemented exactly as specified;
4. Planner Attention and Inter-Agent contracts are durable;
5. all eight managers satisfy their functional responsibilities;
6. Finance legacy functionality is preserved and canonical migration is reconciled;
7. local execution remains typed and constrained;
8. frontier code runs only in disposable isolation;
9. all manager prompts/workflows/models pass the capability gate;
10. production manager/schedule enablement is deliberate and observable;
11. the Part VIII catalogue and any later explicitly added regression cases pass.

At that point, a coding agent should treat new requests to “simplify” or silently reinterpret manager capability as a specification change requiring an explicit amendment, not as ordinary implementation freedom.
