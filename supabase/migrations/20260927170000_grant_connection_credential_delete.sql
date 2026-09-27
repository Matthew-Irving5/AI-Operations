-- Google connection revocation removes encrypted refresh tokens after the
-- provider revoke attempt. Keep that operation restricted to server-side code.
grant delete on public.connection_credentials to service_role;
