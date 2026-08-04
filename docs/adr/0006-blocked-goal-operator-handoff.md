# ADR 0006: Blocked-goal operator handoff

## Status

Accepted for Pass 8.

## Decision

Codex continues through ordinary implementation and test failures. A missing
credential, denied provider permission, unavailable external resource, or required
MFA/device/account action is an external blocker. After the same blocker appears in
three consecutive goal turns, the active goal is marked `blocked` and the handoff
must include evidence, the exact operator action, verification steps, and the
resume command or prompt.

## Rationale

The workflow prevents both unsafe guessing around provider boundaries and an
indefinitely active goal that only repeats the same operator request.
