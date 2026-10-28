-- AI-41: revoke credentials and outstanding read-only scans in one transaction.
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
  v_run_id uuid;
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
  -- Revoked credentials can never finish queued or running device work. Make
  -- that terminal state visible atomically rather than stranding a live scan.
  -- Device-owned runs remain queued while the generic queue is cancelled, so
  -- reuse the existing cancellation contract for their run/trace ledger.
  for v_run_id in
    update public.digital_scans
      set status = 'cancelled', completed_at = now()
      where device_id = v_revoked_id and user_id = v_user_id
        and status in ('queued', 'waiting_for_device', 'running')
      returning run_id
  loop
    if v_run_id is not null then
      perform public.cancel_queued_run(v_user_id, v_run_id);
    end if;
  end loop;
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
