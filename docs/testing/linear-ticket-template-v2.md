# Six-section AI-to-AI implementation ticket template

Tickets are planned and researched in advance. Each independent Codex conversation gets one complete ticket. No startup readback or broad re-planning phase.

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
- A ticket blocked by a future file specifies interface shape now.

## Testing
- Local setup only for affected runtime. Exact commands, test files and assertions.
- Test changed behaviour plus direct and transitive affected contracts, no unrelated system journey.
- Explicit no browser/no staging/no MFA if irrelevant.
- Hosted-only check, if unavoidable, is assigned to a separate release acceptance ticket.
- Done after local functional proof, required lightweight PR checks and merged commit.

## Authoring self-critique
Confirm it is missing no existing symbol, caller identity, grant, deployment import, fixture, generated type, negative case, shared ownership or dependency. Reject tickets whose expected result cannot be demonstrated without implementing another broad feature.
