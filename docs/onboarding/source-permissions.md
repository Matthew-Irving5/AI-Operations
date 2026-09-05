# Source app permissions

Use **Data Sources** as the authoritative review surface. Do not copy tokens, OAuth credentials, or
personal source contents into onboarding evidence.

## Google

1. Confirm the connected account is the locked production Google identity.
2. Confirm the granted scopes are exactly Gmail read-only, Gmail send, Calendar read-only, and
   Drive read-only. Gmail send exists only for notifications to the configured known recipient.
3. Load available Calendar and Drive sources, select only those AI Operations may read, and save.
   Empty selections import nothing.
4. Run **Sync now**. Confirm Gmail, Calendar, and Drive each show **Fresh**, a last-success time,
   and the expected cadence. A partial provider failure must remain visible against that dataset.
5. Confirm **Reconnect** is available for expired consent and that **Revoke** requires fresh MFA.

OAuth callback failures return to **Data Sources** with an allowlisted explanation and a correlation
reference. The page distinguishes expired state, incomplete scopes, Google profile lookup failure,
missing or unverified profile email, the wrong authorised account, token exchange failure, and safe
storage/configuration failures. Use the displayed recovery action first; use the reference to find
the matching redacted `google_oauth_failed` audit event if diagnosis is still required. Callback
URLs and audit records never contain the authorization code, access or refresh token, client secret,
or the unexpected Google email address.

## Apple Shortcut

Confirm the existing device is active, its last-seen time is current, and its Reminder permission
is restricted to `Fitness Plan`, `Household & Personal`, and `AI Actions`. Confirm Health,
Calendar, Reminders, Location, and Screen Time each show current collection evidence. Missing
Resting Heart Rate samples are acceptable, and no historical Health backfill is required.

Do not alter the signed Shortcut for this checklist item. Revocation is an emergency recovery
control and invalidates the existing device token after a single-use MFA gate.

## Success condition

The Settings checkbox becomes available only when the active Google connection has saved Calendar
and Drive selections, all three Google datasets are currently fresh, an active Apple device exists,
and all five Apple datasets are currently fresh. Review the displayed scopes and selections, then
record the checklist item. Schedules remain disabled until final production acceptance.
