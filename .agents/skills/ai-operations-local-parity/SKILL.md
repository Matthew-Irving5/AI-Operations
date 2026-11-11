---
name: ai-operations-local-parity
description: Select only the needed local platform/role compatibility checks using current Supabase/Cloudflare contracts and the evidence snapshot.
---
# Real-role local parity
1. Read docs/testing/platform-local-parity.md and relevant current repo migration/manifest/ACL test; the recorded table is a snapshot, not forever authoritative.
2. For SQL: run isolated local Supabase with exact migrations; test SQL roles and RPC grants, not merely service_role JWT assumptions. Check generated types and migration history if changed.
3. For Edge: match auth-manifest.json, supabase/config.toml, imports and actual caller. Run focused Deno and permission regressions.
4. For Cloudflare: test changed middleware/routes in local workerd/OpenNext preview; do not treat Next dev as production Worker. Use local bindings; never connect test code to production writes.
5. For providers: fake deterministic responses and failure paths locally, state what actual hosted OAuth/secret/network boundary remains unverified.
6. Record only applicable commands/results in PR evidence. No redundant readback or unrelated suite.
