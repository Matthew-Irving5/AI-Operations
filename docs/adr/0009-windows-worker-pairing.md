# ADR 0009: Device-specific Windows worker pairing

## Status

Accepted for Pass 8 implementation.

## Decision

Each Windows worker generates an Ed25519 key locally. The dashboard registers
only its public key after fresh MFA and issues a ten-minute, one-use pairing
code. Pairing exchanges that code for a random per-device bearer secret; only
the SHA-256 hash is stored in Supabase. The worker stores the private key and
secret in Windows DPAPI-protected files and sends the secret only over HTTPS to
the Supabase Functions control plane.

Worker heartbeat, polling, and result submission authenticate against the
device hash and are rejected immediately after revocation. Scan results are
accepted only after Ed25519 verification against the registered public key.
Checklist completion is a server-side evidence decision, not a client toggle.

The private deployment release is intentionally unsigned to avoid a paid
Authenticode certificate. CI publishes a SHA-256 checksum and provenance with
the commit SHA and an explicit `signed: false` field. Windows may show
“Unknown publisher”; transport, pairing, device authentication, and result
signature verification remain mandatory controls.

## Consequences

Compromise of one worker does not authenticate another device or expose a
deployment-wide secret. Pairing and revocation require fresh MFA, while the
outbound-only worker remains installable as a scheduled Windows task. Operators
must retain the release, checksum, and DPAPI-backed local files; losing
them requires revoking and registering a new device.
