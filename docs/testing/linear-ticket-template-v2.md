# Required-core AI-to-AI implementation ticket template

Tickets are planned and researched in advance. Each Codex conversation gets one focused ticket. The five body sections below are mandatory; existing issues may also have dated superseding amendments. No startup readback or broad re-planning phase.

## Heading

Precise implementation outcome. One stable boundary, not a whole subsystem.

## Problem

- Current main implementation facts: existing symbol/route/RPC and exact missing behaviour.
- Why it matters to one downstream consumer.

## Acceptance

- Explicit inputs/outputs/schema/enum/error codes and concrete values.
- Positive, negative, idempotency, permission and relevant boundary outcomes.
- Each item is proved by a test listed below.

## Key files

- Existing paths with exact symbols and expected modification.
- Prospective new paths marked new/proposed, never described as existing.
- Shared interface owner if multiple parallel tickets could conflict.

## Supporting info

- Exact Linear blockers and their promised contracts.
- Approved canonical pattern and runtime identity/permissions.
- Relevant Figma/UI references if any. Explicit forbidden scope.
- Proposed risk exposure (low/medium/high/unknown) with actual potentially affected permissions, side effects, shared APIs and release/runtime surfaces. This is a proposal, NOT self-approved risk classification; independent policy AI-203 decides when active.
- Shared write-surface claim, implementation blocker vs separate release-owned proof and whether production activation is currently permitted.
- A ticket blocked by a future file specifies interface shape now.

## Testing

- Local setup only for affected runtime. Exact commands, test files and assertions.
- Test changed behaviour plus direct and transitive affected contracts, no unrelated system journey.
- Changed UI: Codex-led local manual browser walkthrough (main path, denial/error path, keyboard/viewport/persistence). No required scheduled/browser E2E after AI-192 activation; no browser/staging/MFA for unrelated backend work.
- Hosted-only check, if unavoidable, is assigned to a separate release acceptance ticket.
- **Implementation Done** after local functional proof, actually required PR/security checks and merged commit. **Released** only after exact protected production SHA and observation. Always follow `docs/testing/risk-adaptive-delivery.md` and actual GitHub gates until cutover.

## Authoring self-critique

Confirm it is missing no existing symbol, caller identity, grant, deployment import, fixture, generated type, negative case, shared ownership or dependency. Reject tickets whose expected result cannot be demonstrated without implementing another broad feature.
