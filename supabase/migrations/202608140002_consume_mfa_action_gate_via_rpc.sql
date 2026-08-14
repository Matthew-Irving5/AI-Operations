-- A valid user JWT may consume only its own, matching one-time action gate.
-- Keeping this mutation in the database avoids any dependency on an Edge
-- Function service-role secret and preserves RLS for direct table access.
create or replace function public.consume_mfa_action_gate(
  p_gate_id uuid,
  p_action_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  update public.mfa_action_gates
  set consumed_at = now()
  where id = p_gate_id
    and user_id = v_user_id
    and action_key = p_action_key
    and consumed_at is null
    and expires_at > now();

  return found;
end;
$$;

grant execute on function public.consume_mfa_action_gate(uuid, text) to authenticated;
