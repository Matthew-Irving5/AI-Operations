# AI-9 live drift reconciliation

## Observations

- The main staging release [run 36357140223](https://github.com/Matthew-Irving5/AI-Operations/actions/runs/36357140223) succeeded on merge `f9dafec827beb0d5303838a406270a2cc0f8d45c`, including the repo-to-staging drift gate and staging Worker smoke.
- The associated production promotion [run 36357316901](https://github.com/Matthew-Irving5/AI-Operations/actions/runs/36357316901) deployed the Worker, finance gateway binding, migrations, and Edge Functions, then failed the staging-to-production drift gate. The production smoke step was skipped. No production secrets were copied or altered.
- Both projects report the same 60 migration versions, latest `20260927170000`, and migration digest `d1865134826a6b845b1506c9caa361f8`.
- All 39 Edge Function slugs and auth modes match. Deployed source bytes remain unavailable from Supabase's ESZIP2.3 body endpoint; release source attestation is the comparison contract.
- The schema digest differed (`30b7f79b3522b9e62b0617ef78ac5460` staging; `14ee9d5291545a22e5c3d4fac608e528` production). Read-only object comparison isolated five unversioned staging-only CHECK constraints on mobile Calendar, Health, Reminders, and Screen Time rows, plus `mobile_parse_offset_timestamp(text,boolean)` marked IMMUTABLE in staging and STABLE in production. The versioned source migration `202608200002_mobile_source_adapters.sql` declares only the bounded string checks and STABLE parser.
- Read-only counts for empty values across the five constrained columns were zero in both environments. The migration reconciles staging to the checked-in contract with `DROP CONSTRAINT IF EXISTS` and reasserts STABLE volatility, without deleting rows or tightening accepted input.
- Edge secret-name inventories differed by exactly one name: `WORKER_SECRET` exists in staging only. AI-65's completion record assigns the future production caller and paired credential to AI-15 and explicitly forbids inventing or reusing a standalone value. The parity manifest allows only this documented name difference and expires the exception at AI-15 secure handoff; secret values remain unread.

## Status

The follow-up reconciliation migration and allowlist have not yet been deployed. The post-deploy parity gate and production smoke are not green. This evidence does not claim live parity or AI-9 sign-off.
