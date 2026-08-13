-- Forward grant for production databases that already applied the original
-- Google OAuth grants migration before the Gmail test endpoint was added.
grant select on public.connection_credentials to service_role;
