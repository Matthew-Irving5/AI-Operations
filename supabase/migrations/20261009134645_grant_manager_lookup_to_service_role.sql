-- The trusted runtime fixture needs only the manager ID and lookup key.
-- Keep manager descriptions and configuration outside the service-role ACL.
revoke all privileges on table public.managers from service_role;
grant select (id, code) on table public.managers to service_role;
