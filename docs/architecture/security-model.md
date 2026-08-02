# Security model

The sole production identity is allowlisted in the database. Authenticated routes require Supabase AAL2, privileged actions require MFA completed within five minutes, and RLS defaults to deny. Browser clients receive only public Supabase configuration; privileged operations are JWT-verified Edge Functions. Audit payloads are redacted.

State-changing Next.js routes reject requests without a same-origin `Origin` header. Supabase session cookies are server-managed. Service-role credentials, access tokens, database passwords, Cloudflare tokens, and R2 credentials remain server/deployment secrets and must never be bundled into frontend output.
