-- Restore the authenticated read projection required by the Devices health UI.
-- The explicit service-only ACL migration revokes table privileges globally;
-- this table is intentionally readable only through its owner-scoped RLS policy.
grant select on table public.worker_heartbeats to authenticated;
