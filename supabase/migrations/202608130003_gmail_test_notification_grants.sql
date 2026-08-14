-- Allow the authenticated production notification test to persist its normal
-- notification and audit records without exposing either table to the browser.
grant select, insert, update on public.notifications to service_role;
grant insert on public.audit_events to service_role;
grant select on public.connection_credentials to service_role;
