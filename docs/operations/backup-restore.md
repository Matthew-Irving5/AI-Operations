# Backup and restore

Production backups are encrypted and stored separately from operational data. Archive exports use Parquet with Zstandard compression, a SHA-256 manifest, and a read-back verification before hot data is eligible for removal.

Restore drills run in staging only and use synthetic data. The operator verifies the encrypted backup key, SHA-256 checksum, manifest record count, and a representative read-back before recording a passed drill. A production restore requires documented approval, fresh MFA, and a separate incident runbook; it must not be performed from the dashboard.
