# ADR 0010: Gate-bound authentication after worker registration redirect

## Status

Accepted, 2026-09-16.

## Context

The Devices registration flow completes a fresh MFA challenge and creates a
short-lived, user-bound `worker_device_register` gate before redirecting back
to Devices. Supabase Auth can legitimately return the browser's pre-MFA AAL1
access token on the resumed request even though the MFA event and gate were
created successfully. Requiring the resumed JWT to report AAL2 therefore
rejects valid registrations at the control-plane boundary.

## Decision

The registration and revocation Edge Functions authenticate the allowlisted
user, then delegate elevation to the one-time gate RPC. The RPC locks and
validates the gate, checks its action, user binding, expiry, and replay state,
and consumes it in the same transaction as the device mutation. Gate creation
continues to require AAL2 and a recent MFA reauthentication event.

## Consequences

The flow remains fresh-MFA protected without depending on a redirect-time JWT
claim. A stolen or replayed gate cannot be used by another user, after expiry,
or twice. Other application reads and writes retain their normal AAL2/RLS
requirements.
