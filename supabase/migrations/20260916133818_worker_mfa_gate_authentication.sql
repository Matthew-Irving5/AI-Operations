-- The browser can resume a registration flow with the pre-MFA AAL1 access
-- token after the MFA callback has redirected back to Devices. The one-time
-- gate is the durable elevation proof: it was created only after a successful
-- fresh MFA challenge, is user-bound, expires quickly, and is consumed under
-- row lock in the same transaction as the sensitive operation. Do not require
-- the resumed request's JWT to retain an aal2 claim.

create or replace function public.create_worker_device_from_mfa_gate(
  p_gate_id uuid,
  p_label text,
  p_public_key_b64 text,
  p_pairing_hash text,
  p_pairing_expires_at timestamptz
) returns table(device_id uuid, pairing_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate record;
  v_device_id uuid;
begin
  if v_user_id is null then
    raise exception 'fresh_mfa_required';
  end if;
  select user_id, action_key, expires_at, consumed_at
    into v_gate
    from public.mfa_action_gates
    where id = p_gate_id
    for update;
  if not found then raise exception 'invalid_mfa_gate'; end if;
  if v_gate.user_id <> v_user_id then raise exception 'mfa_gate_wrong_user'; end if;
  if v_gate.action_key <> 'worker_device_register' then
    raise exception 'mfa_gate_invalid_action';
  end if;
  if v_gate.consumed_at is not null then raise exception 'mfa_gate_replayed'; end if;
  if v_gate.expires_at <= now() then raise exception 'mfa_gate_expired'; end if;
  if p_label is null or length(trim(p_label)) not between 1 and 100 then
    raise exception 'invalid_device';
  end if;
  if p_public_key_b64 is null or length(p_public_key_b64) not between 40 and 100 then
    raise exception 'invalid_device';
  end if;
  if p_pairing_hash is null or length(p_pairing_hash) <> 64 or
     p_pairing_expires_at <= now() then
    raise exception 'invalid_pairing';
  end if;
  update public.mfa_action_gates set consumed_at = now()
    where id = p_gate_id and consumed_at is null and expires_at > now();
  if not found then raise exception 'mfa_gate_replayed'; end if;
  insert into public.worker_devices(
    user_id, label, public_key_b64, pairing_hash, pairing_expires_at
  ) values (
    v_user_id, trim(p_label), p_public_key_b64, p_pairing_hash, p_pairing_expires_at
  ) returning id into v_device_id;
  insert into public.audit_events(
    user_id, actor_type, action_type, target_type, target_id, aal, result,
    redacted_after
  ) values (
    v_user_id, 'user', 'worker_device_registered', 'worker_device',
    v_device_id::text, 'aal2_fresh', 'success',
    jsonb_build_object('label', trim(p_label), 'pairing_expires_at', p_pairing_expires_at)
  );
  return query select v_device_id, p_pairing_expires_at;
exception when unique_violation then
  raise exception 'device_registration_conflict';
end;
$$;
revoke all on function public.create_worker_device_from_mfa_gate(uuid,text,text,text,timestamptz)
  from public, anon;
grant execute on function public.create_worker_device_from_mfa_gate(uuid,text,text,text,timestamptz)
  to authenticated;

create or replace function public.revoke_worker_device_from_mfa_gate(
  p_device_id uuid,
  p_gate_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate record;
  v_revoked_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('code', 'fresh_mfa_required');
  end if;
  select user_id, action_key, expires_at, consumed_at into v_gate
    from public.mfa_action_gates where id = p_gate_id for update;
  if not found then return jsonb_build_object('code', 'invalid_mfa_gate'); end if;
  if v_gate.user_id <> v_user_id then return jsonb_build_object('code', 'mfa_gate_wrong_user'); end if;
  if v_gate.action_key <> 'worker_device_revoke' then
    return jsonb_build_object('code', 'mfa_gate_invalid_action');
  end if;
  if v_gate.consumed_at is not null then return jsonb_build_object('code', 'mfa_gate_replayed'); end if;
  if v_gate.expires_at <= now() then return jsonb_build_object('code', 'mfa_gate_expired'); end if;
  update public.mfa_action_gates set consumed_at = now()
    where id = p_gate_id and consumed_at is null and expires_at > now();
  if not found then return jsonb_build_object('code', 'mfa_gate_replayed'); end if;
  update public.worker_devices
    set state = 'revoked', revoked_at = now(), worker_secret_hash = null,
        pairing_hash = null, pairing_expires_at = null
    where id = p_device_id and user_id = v_user_id and revoked_at is null
    returning id into v_revoked_id;
  if v_revoked_id is null then return jsonb_build_object('code', 'device_not_found'); end if;
  insert into public.audit_events(
    user_id, actor_type, action_type, target_type, target_id, aal, result,
    redacted_after
  ) values (
    v_user_id, 'user', 'worker_device_revoked', 'worker_device',
    v_revoked_id::text, 'aal2_fresh', 'success', jsonb_build_object('revoked', true)
  );
  return jsonb_build_object('status', 'revoked', 'device_id', v_revoked_id);
exception when others then
  return jsonb_build_object('code', 'worker_device_revoke_failed');
end;
$$;
revoke all on function public.revoke_worker_device_from_mfa_gate(uuid,uuid) from public, anon;
grant execute on function public.revoke_worker_device_from_mfa_gate(uuid,uuid) to authenticated;
