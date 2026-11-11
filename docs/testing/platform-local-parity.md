# Local platform parity

Read-only snapshot: 11 November 2026. Production and staging use PostgreSQL 17.6.1.155 in eu-west-2.

## Machine-readable ACL inventory

- See platform-local-parity.csv for exact table-level grants recorded against both live Supabase projects.
- These are table privileges, not complete column grants, row policies or RPC permissions.
- All eight sampled tables have RLS enabled.
- The service_role does not have direct SELECT on actions or trace_events.
- The service_role does not have direct INSERT on workflow_runs.
- Use existing restricted RPC and reader patterns. Do not widen grants.

## Known environment differences

- Production: 103 migrations; last version 20261029130000.
- Staging: 104 migrations, including the additional AI-39 version 20261106134300.
- Both list 43 Edge Functions. This does not prove source or secret parity.
- Security advisor warnings require separate root-cause review, not automatic permission changes.

## Local verification

- Rebuild an isolated local database using the actual approved migration chain.
- Check direct role and RPC permissions with the relevant existing pgTAP tests.
- Check generated database types and repo-local migration drift after schema changes.
- Check Edge auth manifest, import maps and package dependency closure when affected.
- Use the existing local Cloudflare Worker preview for Worker runtime changes.
- Fixtures can simulate provider errors but not real hosted OAuth, MFA or cloud-network behaviour.
- Never use production secrets or personal records in tests.
- Refresh the snapshot before changing privileges. The CSV is evidence, not permanent authority.
