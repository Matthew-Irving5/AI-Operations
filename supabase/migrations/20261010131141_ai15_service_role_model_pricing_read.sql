-- The canonical executor reads approved pricing under service_role. Remove
-- inherited mutation and object-management privileges before granting read-only
-- access; pricing changes remain behind add_model_pricing RPC.
revoke all privileges on table public.model_pricing from service_role;
grant select on table public.model_pricing to service_role;
