# Backup and restore

## Contract and targets

All R2 buckets are private. Cloudflare R2 encrypts objects at rest with Cloudflare-managed AES-256-GCM keys; the application records that provider-managed protection as metadata. The weekly application bundle is additionally encrypted with AES-256-GCM and a dedicated 256-bit backup key kept in the operator's secret manager. It is not the application token-encryption key. Only the opaque key-version label is stored in restore-drill metadata. Original uploaded bytes are copied exactly and verified by SHA-256; JSON/NDJSON archive compression and Parquet partitioning remain governed by the existing archive producer.

The recovery targets are operational goals, not a service-level guarantee:

- RPO: at most 24 hours for operational PostgreSQL state when the configured Supabase plan's daily logical backup is enabled; at most seven days for the complete database-plus-R2 application export.
- RTO: one business day for a manual restore into a clean isolated Supabase target and separate archive bucket. Use the existing guarded hosted recovery target where available, or an isolated local Supabase project plus loopback S3-compatible storage; the local path does not require a third hosted Supabase project.
- Run the isolated restore drill monthly with synthetic staging records. Never restore production data into staging or write a restore over production.

The operator must confirm daily database backup availability in the Supabase plan. The application export command below is manual; scheduling it weekly and reviewing the run evidence are operational setup steps. Until an isolated target is configured and a successful drill is recorded, these targets are not verified.

## Isolated staging restore

The restore command refuses production targets. Use synthetic staging data only, and restore into a clean isolated target. The hosted `staging-recovery` option retains its dedicated Supabase project and private R2 recovery bucket checks. The `local-recovery` option uses a separate local Supabase project and an S3-compatible archive endpoint bound to `127.0.0.1` or `::1`; it does not consume a third hosted project. The source archive bucket, encrypted-backup bucket, and recovery bucket must be three distinct buckets. For local recovery, keep the workdir outside the repository, use a unique project ID and port block, and start only the isolated local stack. For example, when the configured target uses the unique `aiops-ai45-recovery` project ID and non-default ports, start its database service with:

```powershell
corepack pnpm exec supabase start --workdir $env:AI_OPS_LOCAL_RECOVERY_WORKDIR --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor --yes
```

The local importer copies the SQL dump into the exact validated database container and runs `psql --single-transaction --set ON_ERROR_STOP=1`; do not pass a multi-statement `supabase db dump` file to `supabase db query --file` or interpolate SQL through a shell. Do not provision hosted resources or generate substitute cloud credentials as part of a drill; the operator owns account setup.

Put these values in the process environment through the approved secret manager. Never pass secret values as command-line arguments, echo them, or add them to source, fixtures, logs, or evidence:

- `SUPABASE_ACCESS_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- `AI_OPS_BACKUP_SOURCE_ENV=staging`, `AI_OPS_STAGING_PROJECT_REF`, the known `AI_OPS_PRODUCTION_PROJECT_REF` safety reference, `AI_OPS_STAGING_ARCHIVE_BUCKET`, and `AI_OPS_STAGING_BACKUP_BUCKET`.
- `AI_OPS_STAGING_BACKUP_KEY_VERSION` (an opaque label) and `AI_OPS_STAGING_BACKUP_ENCRYPTION_KEY` (canonical base64 for exactly 32 secret bytes).
- For the existing hosted recovery target only: `AI_OPS_STAGING_RECOVERY_PROJECT_REF`, `AI_OPS_STAGING_RECOVERY_ARCHIVE_BUCKET`, and `AI_OPS_RESTORE_TARGET_ENV=staging-recovery`. For a local target: `AI_OPS_LOCAL_RECOVERY_WORKDIR`, `AI_OPS_LOCAL_RECOVERY_ARCHIVE_BUCKET`, `AI_OPS_LOCAL_RECOVERY_S3_ENDPOINT` (loopback only), `AI_OPS_LOCAL_RECOVERY_S3_ACCESS_KEY_ID`, `AI_OPS_LOCAL_RECOVERY_S3_SECRET_ACCESS_KEY`, and `AI_OPS_RESTORE_TARGET_ENV=local-recovery`.
- `AI_OPS_R2_SOURCE_ACCESS_KEY_ID` / `AI_OPS_R2_SOURCE_SECRET_ACCESS_KEY`, `AI_OPS_R2_BACKUP_ACCESS_KEY_ID` / `AI_OPS_R2_BACKUP_SECRET_ACCESS_KEY`, and `AI_OPS_R2_RECOVERY_ACCESS_KEY_ID` / `AI_OPS_R2_RECOVERY_SECRET_ACCESS_KEY`. Scope each credential to its named bucket and the required read or write actions.

From a clean repository checkout, create and verify the encrypted export, then restore it. To verify an older backup after key rotation, load the matching secret and key-version label from the secret manager before running `verify` or `restore`:

```powershell
corepack pnpm backup:restore create
corepack pnpm backup:restore verify <backup-key> staging
corepack pnpm backup:restore restore <backup-key> staging
```

Keep the returned backup key, checksum, migration version, object count, and key-version label in the approved redacted operational log. The commands do not print credentials. `create` exports database rows plus every referenced source object, trace archive object, and archive manifest object; it checks hashes and sizes, encrypts the manifest/database/object bytes, uploads the bundle to the separate backup bucket, and verifies the downloaded encrypted bytes and decryption. `restore` applies the repository migrations to the isolated project, restores the application dump, copies the exact object bytes to the recovery bucket, verifies every recovered object's SHA-256 and size, compares critical row counts, and writes the redacted passed-drill record only to the selected recovery target (hosted staging target or local isolated database).

The export keeps the synthetic Auth users required by application references, but omits sessions, refresh tokens, one-time tokens, MFA challenges, and MFA factors. Enrol a fresh recovery-only authenticator before testing an MFA-gated application read; do not copy a production authenticator secret into recovery.

After the CLI reports success, run the representative trace/evidence read or report journey against the recovery deployment and confirm the restored file is readable. Corrupt or remove only a disposable copy in the isolated recovery bucket and verify the owner-scoped archive endpoint returns `archive_integrity_mismatch` or `archive_object_missing`; never alter the source archive or the backup bundle. Record the request ID and sanitized outcome, then discard the disposable recovery fixture using the approved cleanup process. A successful CLI restore alone does not satisfy the ticket's live sign-off: the application journey and disposable-object failure check must also pass.

## Current staging gate and resume

AI-65's canary evidence covers its configured-resource check. The operator has confirmed a two-project Supabase limit; local recovery is the accepted target when no third hosted project is available, while the hosted recovery mode remains guarded for deployments that have one. A staging backup bucket and versioned key are configured, but no hosted backup/restore has run in this task. The root release queue controls the staging-source run; the local synthetic round-trip is the current required boundary proof. Record `LIVE E2E SIGN-OFF: PASS` only after the issue's required representative read journey and authorized staging-source acceptance pass.

When the root release queue grants the staging-source slot, load the already configured source, backup and encryption settings into the process environment and seed only a synthetic staging fixture. For `local-recovery`, set the local workdir, distinct archive bucket, loopback endpoint and local credentials; confirm the recovery bucket is empty, then run `create`, `verify` and `restore` from a clean merged checkout. The restore command requires the production safety ref and rejects a target matching source or production. Do not provision a third hosted Supabase project. If the issue's representative application read prompts for real login or MFA, stop before sign-in and ask for the operator's headed-browser handoff. Corrupt or remove only a disposable object in the local recovery bucket after verifying restore success.

## Production incident recovery

Production restore is intentionally not exposed by this command. Follow the separately approved incident procedure, obtain explicit operator authorization and fresh MFA, preserve the existing production database and R2 objects, and restore only through the incident's controlled recovery plan. Do not use a dashboard SQL editor or point the staging drill at production.
