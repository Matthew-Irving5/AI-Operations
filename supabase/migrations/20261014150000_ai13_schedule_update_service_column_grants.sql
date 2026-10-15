-- The authenticated schedule page is read-only. The schedule-update Edge
-- Function needs only the owner/filter/return columns for its gated mutation.
grant select (id, user_id, enabled)
  on table public.workflow_schedules to service_role;
grant update (enabled)
  on table public.workflow_schedules to service_role;
