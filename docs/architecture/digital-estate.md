# Digital Estate worker boundary

The Windows worker is a Python 3.12 process that initiates outbound HTTPS requests only. It has no HTTP server, shell endpoint, or arbitrary-command facility.

Pairing begins in the authenticated dashboard after fresh MFA. The dashboard registers only an Ed25519 public key and a short-lived, single-use pairing code. The private key is generated locally and protected with Windows DPAPI; it never enters the browser, database, logs, or repository. A revoked device is rejected by every worker endpoint.

The worker polls for read-only scans and short-lived, individually signed action manifests. Manifest bytes are canonically JSON encoded and Ed25519 verified before execution. The executor accepts only move, rename, archive, quarantine, and separately-approved purge intents; it checks device binding, expiry, allowlisted roots, reparse points, destination existence, source hash, and source modification time. Ordinary deletion is not an executor operation. Quarantine is retained for at least 30 days.

Inventory results contain opaque path tokens and metadata, not local absolute paths. Sensitive, credential, browser, cache, virtual-environment, and dependency locations are excluded before collection. The cloud service verifies every scan result against the registered public key before accepting it.

Archive records are Parquet with Zstandard compression and SHA-256 verification. Private R2 object access is a deployment concern; Postgres stores only manifest metadata. A restore drill always uses staging and synthetic data.
