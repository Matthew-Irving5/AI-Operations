-- Edge Functions authenticate workers and persist control-plane evidence with
-- the service role. Browser roles retain the restricted projection defined by
-- the pairing migration.
grant select, insert, update on public.worker_devices, public.digital_scans,
  public.worker_heartbeats, public.digital_inventory_items, public.audit_events
  to service_role;
