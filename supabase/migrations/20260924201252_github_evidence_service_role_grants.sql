-- The Career GitHub sync runs through the server-side service role.  The base
-- Career migration intentionally grants repository evidence SELECT only to the
-- browser role, so the upsert boundary needs explicit server-role privileges.
grant usage on schema public to service_role;
grant select, insert, update on public.career_github_evidence to service_role;
