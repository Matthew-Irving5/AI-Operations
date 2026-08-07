-- PostgREST's `.insert(...).select(...)` requires SELECT in addition to INSERT.
-- The webhook stores a generated event ID, so permit that narrow read-back.

grant select on public.webhook_events to service_role;
