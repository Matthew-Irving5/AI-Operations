-- Read-only smoke scans are still an authenticated device operation. The
-- resumed browser request may carry the pre-MFA AAL1 JWT, so the short-lived
-- gate created by the MFA flow is the elevation proof for scan creation.
alter table public.mfa_action_gates
  drop constraint if exists mfa_action_gates_action_key_check;
alter table public.mfa_action_gates
  add constraint mfa_action_gates_action_key_check
  check (action_key in (
    'apple_bridge_create', 'apple_bridge_revoke', 'gmail_test_notification',
    'connection_revoke', 'connection_scope_change', 'worker_device_register',
    'worker_device_revoke', 'digital_scan_create'
  ));

create or replace function public.create_mfa_action_gate(p_action_key text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate_id uuid;
begin
  if v_user_id is null or not public.is_allowed_aal2() then
    raise exception 'fresh_mfa_required';
  end if;
  if p_action_key not in (
    'apple_bridge_create', 'apple_bridge_revoke', 'gmail_test_notification',
    'connection_revoke', 'connection_scope_change', 'worker_device_register',
    'worker_device_revoke', 'digital_scan_create'
  ) then
    raise exception 'invalid_mfa_action';
  end if;
  if not exists (
    select 1 from public.mfa_reauthentication_events
    where user_id = v_user_id and verified_at >= now() - interval '1 minute'
  ) then
    raise exception 'fresh_mfa_required';
  end if;
  insert into public.mfa_action_gates(user_id, action_key)
  values (v_user_id, p_action_key)
  returning id into v_gate_id;
  return v_gate_id;
end;
$$;
grant execute on function public.create_mfa_action_gate(text) to authenticated;
