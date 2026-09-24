# Production setup

Create isolated Supabase, Cloudflare R2, OpenAI, Gmail, and Google OAuth resources for production. Configure only server-side secrets in the deployment environment. Invite the allowlisted account, enrol TOTP, validate AAL2, then complete the acceptance checklist before enabling schedules. Production and staging must use separate Supabase projects, R2 buckets, OAuth clients, OpenAI projects, Cloudflare environments, and credentials.

## Release checklist

The Settings checklist is the authoritative acknowledgement record. Complete its first sixteen entries only after independently verifying the evidence below. The final acceptance is recorded only after fresh MFA and is immutable evidence in `production_acceptances`; it is not a substitute for the checks.

1. Set production Supabase, Cloudflare/R2 and OpenAI secrets in GitHub environments and Edge Function secrets; do not enter them in the web application.
2. Configure the production OAuth client, approved redirect URI, least-privilege Google scopes, and a Gmail test notification to the configured known address.
3. Sign in as the allowlisted account, enrol Microsoft Authenticator TOTP, and verify an AAL2 session.
4. Install the Apple Shortcut bridge and the Windows worker; confirm the worker is paired with fresh MFA and that private keys remain DPAPI-protected on the machine.
5. Import a Health export and controlled source fixtures; review source permissions, personal profile, finance mapping, and GitHub connection scope.
6. Verify OpenAI provider hard limits, monthly recurring/on-demand caps, and the first schedule set with all schedules disabled.
7. Run an encrypted backup and a staging-only restore drill with synthetic data. Record the checksum, manifest count, representative read-back and date in the operational log.
8. After all sixteen entries are recorded, use the final Settings control under fresh MFA. Enable schedules one by one and verify their first redacted trace and notification.

`Deploy production` is triggered only from a successful staging deployment on `main` (or an explicitly approved workflow dispatch). It applies forward migrations, deploys every Edge Function, and requires the production login smoke check before it succeeds. If any step fails, keep schedules disabled, investigate in staging, and deploy a forward fix; never roll production schema backward.

For Pass 3, configure `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_SYNC_SECRET`, and a 32-byte base64
`APP_TOKEN_ENCRYPTION_KEY` only in Edge Function secrets. Register the callback URL exactly with
Google. Google access is read-only for Gmail, Calendar, and Drive; no Gmail message is marked read,
archived, or deleted. The server refreshes encrypted credentials, records reauthentication failures,
and keeps Drive as a selected source rather than the archive of record.

For Pass 4, configure separate private Health and Finance archive gateways plus their matching
secrets: `HEALTH_ARCHIVE_GATEWAY_URL`, `HEALTH_ARCHIVE_GATEWAY_SECRET`, `HEALTH_INGEST_SECRET`,
`FINANCE_ARCHIVE_GATEWAY_URL`, and `FINANCE_ARCHIVE_GATEWAY_SECRET`. The Finance gateway is the
authenticated `POST /api/internal/finance-archive` route on the environment's Cloudflare Worker;
it writes only to the private `ARCHIVE_BUCKET` R2 binding, verifies the content SHA-256, and
returns only an R2 key and byte count. The gateway secret is configured as both a Cloudflare
Worker secret and a Supabase Edge Function secret; it never appears in browser code or logs.
Do not enable either import until the gateway, private bucket policy, and synthetic staging
validation are complete.

## Personal GitHub connection

The Career connection is read-only and hard-allowlisted to `Matthew-Irving5`. Create a GitHub
fine-grained personal access token for that owner with repository metadata read permission only;
do not grant contents write, administration, workflow, issue, pull-request, or organisation
permissions, and never use a `BrightSG` token. Add the token as the masked GitHub Actions
environment secret `GITHUB_PERSONAL_READ_TOKEN` in both `staging` and `production`. The deployment
workflow copies it into the matching Supabase Edge Function secret; it is never sent to browser
code or stored in Postgres.

After deployment, open **Career**, choose **Connect and sync personal GitHub**, complete the
in-page fresh MFA challenge, and wait for the repository evidence count and retrieval timestamp to
refresh. The sync stores only repository IDs, names, owner, source URL, and retrieval provenance;
it performs no writes to GitHub and sends no outreach. The Settings GitHub checklist item remains
locked until a recent server-verified evidence record exists. If the action fails, retain the
displayed code, stage, HTTP status, and request ID; `github_connection_unavailable` means the
environment secret is missing, while `github_provider_unauthorised` means the token was rejected
by GitHub.
