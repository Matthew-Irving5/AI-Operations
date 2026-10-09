-- PostgREST upserts using ON CONFLICT need SELECT on the conflict key even
-- with ignoreDuplicates/return=minimal. Keep service-role reads column-scoped.
revoke select on table public.actions from service_role;

grant select (
  id,
  user_id,
  conversation_id,
  status,
  approval_state,
  title,
  description,
  created_at
) on table public.actions to service_role;
