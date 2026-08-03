# Security model

The sole production identity is allowlisted in the database. Authenticated routes require Supabase AAL2, privileged actions require MFA completed within five minutes, and RLS defaults to deny. Browser clients receive only public Supabase configuration; privileged operations are JWT-verified Edge Functions. Audit payloads are redacted.

State-changing Next.js routes reject requests without a same-origin `Origin` header and authenticate the user with Supabase `getUser` before an access token is relayed to a JWT-verified Edge Function. Supabase session cookies are server-managed. Service-role credentials, access tokens, database passwords, Cloudflare tokens, and R2 credentials remain server/deployment secrets and must never be bundled into frontend output.

The browser is protected with a restrictive CSP, frame denial, no-referrer policy, disabled camera/microphone/geolocation permissions, MIME sniffing protection, and HSTS. Database tables use RLS and authenticated table mutations are removed where a privileged action must pass an Edge Function’s AAL2, allowlist, validation, idempotency, and audit checks. Schedule enabling additionally requires the recorded production acceptance; the service function verifies it server-side and does not trust UI state.
