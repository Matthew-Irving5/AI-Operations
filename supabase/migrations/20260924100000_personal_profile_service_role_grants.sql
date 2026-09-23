-- The personal-profile Edge Function uses the service-role client after it has
-- authenticated the operator and enforced AAL2. Keep browser roles locked down;
-- grant only the control-plane tables and operations required by that function.
grant usage on schema public to service_role;
grant select, insert, update on public.personal_profiles to service_role;
grant select, insert, update, delete on public.personal_locations to service_role;
grant select, insert, update on public.time_preferences to service_role;
grant select, insert, update, delete on public.location_travel_rules to service_role;
grant select, insert, update, delete on public.location_preparation_rules to service_role;
grant select, insert, update on public.commitments, public.routines to service_role;
grant insert on public.audit_events to service_role;
