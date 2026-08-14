-- Consume the one-time authorisation and persist the bridge device as a
-- single authenticated transaction. This must not depend on an Edge Function
-- service key or on a stale browser AAL claim.
create or replace function public.create_apple_bridge_device_from_mfa_gate(
  p_gate_id uuid,
  p_label text,
  p_enabled_lists text[],
  p_token_hash text,
  p_token_prefix text
)
returns table (
  id uuid,
  label text,
  enabled_lists text[],
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  update public.mfa_action_gates
  set consumed_at = now()
  where id = p_gate_id
    and user_id = v_user_id
    and action_key = 'apple_bridge_create'
    and consumed_at is null
    and expires_at > now();
  if not found then
    return;
  end if;

  return query
  insert into public.apple_bridge_devices (
    user_id, label, enabled_lists, token_hash, token_prefix
  )
  values (
    v_user_id, p_label, p_enabled_lists, p_token_hash, p_token_prefix
  )
  returning apple_bridge_devices.id,
    apple_bridge_devices.label,
    apple_bridge_devices.enabled_lists,
    apple_bridge_devices.created_at;
end;
$$;

grant execute on function public.create_apple_bridge_device_from_mfa_gate(
  uuid, text, text[], text, text
) to authenticated;
