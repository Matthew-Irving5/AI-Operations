-- Match hosted application-role behavior for future objects without changing
-- grants on existing tables. Edge code must opt into service-role access for
-- each new table or sequence in its owning migration.
alter default privileges for role postgres in schema public
  revoke insert, select, update, delete on tables from service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from service_role;

-- Match the hosted service-role contract for existing workflow tables too.
-- Keep the direct notification-test path and canonical workflow reads/writes;
-- SECURITY DEFINER RPCs own stage and queue lifecycle mutations.
revoke insert, select, update, delete on table public.run_steps from service_role;
revoke insert, update, delete on table public.workflow_definitions from service_role;
revoke insert, delete on table public.workflow_runs from service_role;
revoke delete on table public.notifications from service_role;

-- These parsers and diagnostics are implementation details reached from the
-- SECURITY DEFINER ingestion/adaptation entry points, not direct RPCs.
revoke execute on function public.mobile_adapter_validation_issues(text, text, jsonb),
  public.mobile_is_valid_optional_offset_timestamp(text),
  public.mobile_parse_offset_timestamp(text, boolean),
  public.mobile_shortcut_numeric(jsonb, text),
  public.mobile_typed_deduplication_key(text, timestamptz, text)
from service_role;

-- This trigger runs as part of row writes; browser roles must not call it.
revoke execute on function public.normalize_mobile_active_calories_alias()
from anon, authenticated;
