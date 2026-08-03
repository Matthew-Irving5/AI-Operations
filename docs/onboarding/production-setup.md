# Production setup

Create isolated Supabase, Cloudflare R2, OpenAI, Gmail, and Google OAuth resources for production. Configure only server-side secrets in the deployment environment. Invite the allowlisted account, enrol TOTP, validate AAL2, then complete the acceptance checklist before enabling schedules.

For Pass 3, configure `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_SYNC_SECRET`, and a 32-byte base64
`APP_TOKEN_ENCRYPTION_KEY` only in Edge Function secrets. Register the callback URL exactly with
Google. Google access is read-only for Gmail, Calendar, and Drive; no Gmail message is marked read,
archived, or deleted. The server refreshes encrypted credentials, records reauthentication failures,
and keeps Drive as a selected source rather than the archive of record.

For Pass 4, configure separate private Health and Finance archive gateways plus their matching
secrets: `HEALTH_ARCHIVE_GATEWAY_URL`, `HEALTH_ARCHIVE_GATEWAY_SECRET`, `HEALTH_INGEST_SECRET`,
`FINANCE_ARCHIVE_GATEWAY_URL`, and `FINANCE_ARCHIVE_GATEWAY_SECRET`. Each gateway must verify the
content SHA-256 and return an R2 key and byte count. Do not enable either import until the gateway,
private bucket policy, and synthetic staging validation are complete.
