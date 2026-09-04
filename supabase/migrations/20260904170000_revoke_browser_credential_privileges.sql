-- Keep encrypted provider credentials service-role only. This is forward-only
-- because the source-permissions migration is already deployed.
revoke all on public.connection_credentials from public, anon, authenticated;
