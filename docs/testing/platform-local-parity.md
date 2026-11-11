# Platform parity snapshot for local-first tickets

Read-only verified 2026-11-11 against AI-Operations-Production and AI-Operations-Staging on Supabase Postgres 17.6.1.155, eu-west-2. This is not a guarantee of hosted equivalence. Never copy actual production secrets or user data locally.

## Verified table-level ACL (both production and staging)

All sampled tables have RLS enabled. Values below are direct table privileges; column grants, effective RLS and RPC permissions also matter.

- actions: anon SELECT no; authenticated SELECT yes; service_role SELECT no, INSERT yes, UPDATE no.
- conversations: anon/authenticated SELECT no; service_role SELECT/INSERT/UPDATE yes.
- conversation_messages: anon/authenticated SELECT no; service_role SELECT/INSERT/UPDATE yes.
- google_drive_files: anon/authenticated SELECT no; service_role SELECT/INSERT/UPDATE yes.
- inter_agent_requests: anon/authenticated SELECT no; service_role SELECT/INSERT/UPDATE yes.
- model_pricing: anon/authenticated SELECT no; service_role SELECT yes, INSERT/UPDATE no.
- trace_events: anon SELECT no; authenticated SELECT yes; service_role SELECT no, INSERT yes, UPDATE no.
- workflow_runs: anon SELECT no; authenticated SELECT yes; service_role SELECT yes, INSERT no, UPDATE yes.


Consequences: service_role may insert actions but cannot directly SELECT them; it cannot directly INSERT workflow_runs, and cannot SELECT protected trace_events. Correct solution is an existing authorised RPC or safe reader, not a broad GRANT.

## Live environment state

- Production: 103 applied migrations, last 20261029130000_ai41_scan_retention.
- Staging: 104 applied migrations; extra 20261106134300_ai39_version_tool_call_pricing.
- Both report 43 deployed Edge Functions in the connected inventory. Match is not proof that function source and all secrets are identical.
- Supabase security advisor warnings include mutable function search paths, public citext extension and public-callable SECURITY DEFINER functions. Review exact purpose and authorisation before changing any grants.

## Local parity procedure

- Pin Node/pnpm, Supabase CLI, Deno, Next/OpenNext and Wrangler to repository versions.
- Apply the full current main migration chain into an isolated local database. Run direct role/RPC tests, including supabase/tests/rpc_security.sql and supabase/tests/local_application_role_acl_parity.sql when relevant.
- Regenerate packages/db/src/database.types.ts after real schema changes; run environment:drift -- repo-local.
- Read actual Supabase function manifest in supabase/functions/_shared/auth-manifest.json and import maps in supabase/config.toml. Verify changed Edge function's caller and imported workspace closure.
- Use local Cloudflare workerd via approved repository preview tooling when Worker runtime is implicated. Miniflare/workerd is not a production-network simulator for all possible properties.
- Run fixture/provider errors locally. Real hosted OAuth, MFA, live credentials and network behaviours need a release-owned targeted proof, never an unconditional per-ticket walkthrough.
- These observed grants are snapshots. For an ACL-changing ticket compare current target catalogs before writing final acceptance requirements.

Official documentation: https://supabase.com/docs/guides/local-development/testing/overview and https://developers.cloudflare.com/workers/local-development/
