-- The Google OAuth Edge Functions use the service role for the short-lived
-- state transaction and encrypted credential persistence. Keep browser access
-- denied while granting only the exact operations required by those functions.
grant select, insert, update on public.oauth_states to service_role;
grant select, insert, update on public.connections to service_role;
grant insert, update on public.connection_credentials to service_role;
grant insert on public.audit_events to service_role;
