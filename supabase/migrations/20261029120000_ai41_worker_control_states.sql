-- AI-41: explicit worker control state and monotonic browser commands.
-- Pairing remains a transient state; paired devices become offline until the
-- existing worker process sends its first authenticated heartbeat.
update public.worker_devices
set state = 'offline'
where state = 'paired';

alter table public.worker_devices
  drop constraint if exists worker_devices_state_check;

alter table public.worker_devices
  add constraint worker_devices_state_check
  check (state in ('pending', 'active', 'online', 'offline', 'revoked'));

alter table public.worker_devices
  add column if not exists desired_state text not null default 'active'
    check (desired_state in ('active', 'online', 'offline')),
  add column if not exists control_generation bigint not null default 0
    check (control_generation >= 0),
  add column if not exists acknowledged_generation bigint not null default 0
    check (acknowledged_generation >= 0),
  add column if not exists last_poll_at timestamptz,
  add column if not exists observed_mode text
    check (observed_mode is null or observed_mode in ('active', 'online', 'offline'));

create index if not exists worker_devices_control_generation_idx
  on public.worker_devices(user_id, control_generation);

create or replace function public.set_worker_desired_state(
  p_device_id uuid,
  p_desired_state text
) returns table(device_id uuid, desired_state text, control_generation bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_allowed_aal2() then
    raise exception 'fresh_mfa_required';
  end if;
  if p_desired_state not in ('active', 'online', 'offline') then
    raise exception 'invalid_worker_state';
  end if;
  return query
  update public.worker_devices d
  set desired_state = p_desired_state,
      control_generation = d.control_generation + 1
  where d.id = p_device_id
    and d.user_id = auth.uid()
    and d.revoked_at is null
    and d.state <> 'pending'
  returning d.id, d.desired_state, d.control_generation;
  if not found then
    raise exception 'worker_device_not_found';
  end if;
end;
$$;

revoke all on function public.set_worker_desired_state(uuid, text) from public, anon;
grant execute on function public.set_worker_desired_state(uuid, text) to authenticated;

-- Browser sessions may observe control state but never mutate it directly.
revoke update on public.worker_devices from authenticated;
grant select (
  id, user_id, label, public_key_b64, pairing_expires_at, paired_at,
  revoked_at, last_heartbeat_at, state, created_at, desired_state,
  control_generation, acknowledged_generation, last_poll_at, observed_mode
) on public.worker_devices to authenticated;
