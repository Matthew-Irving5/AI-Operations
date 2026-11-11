---
name: ai-operations-integrate
description: Enforce existing AI Operations boundary, role, migration and deployment contracts with targeted local checks; retain failure learning.
---
# Integrate through actual platform contracts
1. Load for DB, Edge, Worker, provider, auth, orchestration and deployment changes. Read the six-section ticket and match its named real interface and caller.
2. Read ONLY relevant IDs in references/integration-rules.md and references/failure-ledger.md. Inspect real source: call site, validated payload, caller principal, SQL grants, consumer, deployment import map and runtime.
3. Reuse existing RPC/wrapper/manifest. Do not create broad service-role grants, bypass MFA, duplicate persistence paths or change release controls.
4. Run ticket-scoped local contract proof under the actual role, including denied cases and immediate blast radius. See docs/testing/platform-local-parity.md. No universal startup tests or automatic staging.
5. On a confirmed escaped integration/infra defect, add the smallest permanent regression/diagnostic plus deduplicated rule/incident evidence in the fix commit.
6. If current deployment/parity cannot be emulated, flag the specific hosted-only boundary to the release owner; never claim local verification established it.
