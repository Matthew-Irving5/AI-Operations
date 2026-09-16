-- The digital-scan-create Edge Function resolves the bounded workflow through
-- the service-role client before creating the run. Keep this grant explicit so
-- service-role PostgREST calls cannot fail with a misleading missing-definition
-- response while browser roles remain governed by the existing RLS policy.
grant select on public.workflow_definitions to service_role;
