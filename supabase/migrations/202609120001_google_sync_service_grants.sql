-- Google sync is executed by the service-role Edge Function.  Keep browser
-- access read-only while granting only the rows the server-side adapter needs
-- to claim idempotency, persist cursors, and upsert provider records.
grant usage on schema public to service_role;
grant select, insert, update on public.google_sync_requests to service_role;
grant select, insert, update on public.integration_cursors to service_role;
grant select, insert, update on public.google_messages to service_role;
grant select, insert, update on public.calendar_events to service_role;
grant select, insert, update on public.google_drive_files to service_role;
