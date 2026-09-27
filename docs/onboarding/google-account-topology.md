# Google account topology operator checklist

Google accounts have fixed, separate roles. Complete the real-account steps below in each isolated Supabase deployment. Do not paste OAuth codes, tokens, client secrets, or refresh tokens into tickets, logs, screenshots, or this checklist.

| Runtime    | Account                               | Role                  | Allowed access                                                                    |
| ---------- | ------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Production | `matthewirving99@gmail.com`           | Personal data source  | Calendar, Tasks, and explicitly selected Drive files                              |
| Production | `matthew.irving.ai@gmail.com`         | AI Operations mailbox | Gmail read and send; delivery is addressed to the locked personal account         |
| Staging    | `matthew.irving99@gmail.com`          | Personal data source  | Synthetic/staging validation only; no production database or archive              |
| Staging    | `matthew.irving.ai.staging@gmail.com` | AI Operations mailbox | Staging Gmail read and send; delivery is addressed to the locked personal account |

## Google Cloud setup

- [ ] Create and verify separate OAuth clients in the staging and production Google Cloud projects. Never share client credentials between environments.
- [ ] Register the exact redirect URI `https://jqtssfrfocnibffdkqch.supabase.co/functions/v1/google-oauth-callback` in the staging OAuth client and `https://epmgvknrydadzitzupzx.supabase.co/functions/v1/google-oauth-callback` in the production OAuth client.
- [ ] Enable Google Calendar API, Google Tasks API, Google Drive API, and Gmail API only in the project that needs them. Enable Gmail API in the corresponding production or staging project before mailbox consent.
- [ ] Configure each OAuth consent screen for the intended account and deployment. Complete any Google verification or test-user restrictions required for the Gmail scopes.
- [ ] Preserve the deployed `PUBLIC_APP_ORIGIN` value. The server uses this approved origin to bind the callback, account role, and staging/production environment.
- [ ] In the staging Supabase project (`jqtssfrfocnibffdkqch`), set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and `APP_TOKEN_ENCRYPTION_KEY` as Edge Function secrets. Set the same names independently in production Supabase (`epmgvknrydadzitzupzx`) with that environment's own client and redirect URI. Do not commit them or copy them to browser configuration.
- [ ] Confirm the GitHub staging and production deployment environments still target their matching Supabase project refs and that each project has its own OAuth client credentials. Report only pass/fail; never copy secret values into the acceptance record.

## Connect and verify accounts

- [ ] Open `https://ai-operations-staging.ai-operations.workers.dev/data-sources`, sign in with the locked personal application account, and complete fresh MFA. Connect the personal data source first. Confirm the Google consent screen shows `matthewirving99@gmail.com` and the Data Sources card lists Calendar, Tasks, and selected Drive file access without Gmail access.
- [ ] On the same staging Data Sources page, connect the staging communication mailbox. Confirm the consent screen shows `matthew.irving.ai.staging@gmail.com`, then run the MFA-gated Gmail delivery test and verify the message reaches `matthewirving99@gmail.com`.
- [ ] Open `https://ai-operations-production.ai-operations.workers.dev/data-sources`, sign in with the locked personal application account, and complete fresh MFA. Connect the personal data source first and confirm `matthewirving99@gmail.com` is shown with only the personal data scopes.
- [ ] On the production Data Sources page, connect the production communication mailbox. Confirm `matthew.irving.ai@gmail.com`, run the MFA-gated Gmail delivery test, and verify receipt at `matthewirving99@gmail.com`.
- [ ] Confirm staging delivery used the staging mailbox and deployment, while production delivery used the production mailbox and deployment. Neither environment may read the other's stored credentials or archive.
- [ ] Verify that attempting to connect the staging mailbox in production, the production mailbox in staging, or a mailbox in the personal-data role is rejected.
- [ ] Verify an existing combined Google grant is marked for reauthentication and cannot sync until revoked at Google and reconnected through the role-specific flow.
- [ ] Confirm callback audit evidence contains the role, environment, exact granted scopes, and a redacted verified account identity. Confirm credentials remain encrypted and unavailable to browser sessions.
- [ ] Record provider console check results and redacted request/correlation IDs in the restricted operational log. Do not record credentials, OAuth codes, email contents, or personal data.

## Release gate

The migration disables every existing combined Google connection and pauses its sync until the operator reconnects it with the narrow role-specific grant. It retains the encrypted credential so the authenticated revoke flow can request revocation at Google. The old broad grant cannot safely be relabeled as a personal-data grant because the provider refresh token itself still carries Gmail consent. Plan the production migration as a controlled window with the operator ready to reconnect; once applied, do not roll back to old code or restore broad scopes. Recover through forward code/schema fixes and role-specific reconnection.

Apply and validate the new migration in staging first. Complete both staging account connections and the Gmail delivery test before approving the production deployment. After the production migration/deployment succeeds, reconnect the production personal and mailbox roles, validate delivery, and verify audit evidence. Keep schedules disabled until the operator completes the production checks, confirms staging/production separation, and records `LIVE E2E SIGN-OFF: PASS` in the project acceptance record.
