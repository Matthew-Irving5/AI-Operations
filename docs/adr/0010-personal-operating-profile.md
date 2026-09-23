# ADR 0010: Personal Operating Profile contract

## Decision

Personal planning configuration is saved through the authenticated
`personal-profile` Edge Function, not directly from browser SQL. The function
requires the approved account and a fresh AAL2 session, validates every field,
encrypts approved location addresses with `APP_TOKEN_ENCRYPTION_KEY`, and
returns only location metadata (`hasAddress`, label, type, and buffers).

Weekly preferences are stored as one row per weekday. Profile, locations,
commitments, and routines use stable UUIDs so retries are idempotent. Every
successful save writes a redacted audit event; failures include a stable code,
stage, HTTP status, request ID, safe detail, and remediation text.

The `personal_profile` onboarding item is evidence-gated. It can only be
completed after the server verifies the profile, Europe/London timezone, at
least one approved location, all required planning fields, and all seven
weekday preference rows. No address, secret, or raw request body is returned
to the browser or written to audit data.

## Consequences

The Personal page has an explicit loading/error/success state and can report
the exact failing boundary without exposing sensitive values. A partial save
reports which persistence stage failed and can be safely retried. Users must
complete fresh MFA before changing this high-sensitivity planning context.
