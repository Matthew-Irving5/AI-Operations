---
name: ai-operations-local-parity
description: Select only the needed local platform/role compatibility checks using current Supabase/Cloudflare contracts and the evidence snapshot.
---
# Real-role local parity
1. Read docs/testing/platform-local-parity.md and query only the ticket-specific entry of docs/testing/platform-live-role-catalog-20261111.json via jq. It includes 121 tables and 150 RPCs for each live environment; it is a dated observation, not permanent authority. Read current migrations/manifest/ACL tests before deciding any permission change.
2. For SQL: run isolated local Supabase with exact migrations; test SQL roles and RPC grants, not merely service_role JWT assumptions. Check generated types and migration history if changed. Run the exact local role matrix in `supabase/tests/local_required_role_permissions.sql`; it detects forbidden service_role INSERT/SELECT and guest reads before staging.
3. For Edge: match auth-manifest.json, supabase/config.toml, imports and actual caller. Run focused Deno and permission regressions.
4. For Cloudflare: test changed middleware/routes in local workerd/OpenNext preview; do not treat Next dev as production Worker. Use local bindings; never connect test code to production writes.
5. For providers: fake deterministic responses and failure paths locally, state what actual hosted OAuth/secret/network boundary remains unverified.
6. Record only applicable commands/results in PR evidence. No redundant readback or unrelated suite.
