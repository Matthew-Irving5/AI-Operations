-- Source permissions hardening: dataset-level freshness, safe verification
-- evidence, Google scope invariants, and idempotent manual operations.

-- Revoke operations use one-time fresh-MFA gates. Existing gate rows remain
-- valid; only the allowlisted action names are extended.
alter table public.mfa_action_gates
  drop constraint if exists mfa_action_gates_action_key_check;
alter table public.mfa_action_gates
  add constraint mfa_action_gates_action_key_check
  check (action_key in (
    'apple_bridge_create', 'apple_bridge_revoke', 'gmail_test_notification',
    'connection_revoke', 'connection_scope_change'
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
    'connection_revoke', 'connection_scope_change'
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

alter table public.data_freshness
  add column if not exists stale_reason text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_verification_evidence jsonb not null default '{}'::jsonb;

alter table public.data_freshness
  drop constraint if exists data_freshness_state_check;
alter table public.data_freshness
  add constraint data_freshness_state_check
  check (state in ('fresh', 'stale', 'error', 'reauthentication_required', 'not_connected'));
alter table public.data_freshness
  add constraint data_freshness_stale_reason_length_check
  check (stale_reason is null or length(stale_reason) between 1 and 160);
alter table public.data_freshness
  add constraint data_freshness_evidence_object_check
  check (jsonb_typeof(last_verification_evidence) = 'object');

-- Existing aggregate rows remain readable for compatibility. New writes use
-- one row per source dataset so a Gmail failure cannot hide healthy Calendar
-- or Drive data.
comment on column public.data_freshness.stale_reason is
  'Bounded non-secret reason code/message safe for the authenticated UI.';
comment on column public.data_freshness.last_verification_evidence is
  'Redacted provider status/counts and persistence evidence; never tokens or payloads.';

drop policy if exists own_freshness on public.data_freshness;
create policy own_freshness on public.data_freshness
  for select using (user_id = auth.uid() and public.is_allowed_aal2());
drop policy if exists own_connections on public.connections;
create policy own_connections on public.connections
  using (user_id = auth.uid() and public.is_allowed_aal2())
  with check (user_id = auth.uid() and public.is_allowed_aal2());

alter table public.connections
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists configuration jsonb not null default '{}'::jsonb;
alter table public.connections
  drop constraint if exists connections_configuration_object_check;
alter table public.connections
  add constraint connections_configuration_object_check
  check (jsonb_typeof(configuration) = 'object');

alter table public.connections
  drop constraint if exists connections_google_scopes_check;
alter table public.connections
  add constraint connections_google_scopes_check
  check (
    provider <> 'google'
    or (
      cardinality(scopes) = 4
      and scopes <@ array[
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
      ]::text[]
      and array[
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
      ]::text[] <@ scopes
    )
  );

alter table public.apple_bridge_devices
  drop constraint if exists apple_bridge_devices_enabled_lists_check;
alter table public.apple_bridge_devices
  add constraint apple_bridge_devices_enabled_lists_check
  check (
    cardinality(enabled_lists) > 0
    and enabled_lists <@ array['Fitness Plan', 'Household & Personal', 'AI Actions']::text[]
  );

alter table public.google_drive_files
  add column if not exists deleted_at timestamptz;
alter table public.google_messages
  add column if not exists deleted_at timestamptz;
revoke all on public.connection_credentials from public, anon, authenticated;

create table public.google_sync_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  idempotency_key text not null check (idempotency_key ~ '^[a-zA-Z0-9:_-]{8,128}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  response jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, connection_id, idempotency_key),
  check (jsonb_typeof(response) = 'object' or response is null),
  check ((status = 'succeeded' and response is not null and completed_at is not null)
    or (status <> 'succeeded'))
);
alter table public.google_sync_requests enable row level security;
create policy own_google_sync_requests on public.google_sync_requests
  for select using (user_id = auth.uid() and public.is_allowed_aal2());
revoke all on public.google_sync_requests from anon, authenticated;
grant select on public.google_sync_requests to authenticated;

create index data_freshness_state_idx
  on public.data_freshness(user_id, state, last_success_at);
create index google_sync_requests_created_idx
  on public.google_sync_requests(user_id, created_at desc);

-- The function is intentionally service-role only. It centralises the safe
-- freshness shape used by server-side adapters and keeps the browser read-only.
create or replace function public.record_source_freshness(
  p_user_id uuid,
  p_source text,
  p_last_source_at timestamptz,
  p_last_success_at timestamptz,
  p_expected_cadence interval,
  p_state text,
  p_stale_reason text,
  p_evidence jsonb
) returns public.data_freshness
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.data_freshness;
begin
  if p_user_id is null or p_source is null or p_source !~ '^[a-z][a-z0-9._-]{0,63}$'
     or p_state not in ('fresh', 'stale', 'error', 'reauthentication_required', 'not_connected')
     or p_stale_reason is not null and length(p_stale_reason) > 160
     or jsonb_typeof(coalesce(p_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_source_freshness';
  end if;
  insert into public.data_freshness(
    user_id, source, last_source_at, last_success_at, expected_cadence,
    state, stale_reason, last_verified_at, last_verification_evidence
  ) values (
    p_user_id, p_source, p_last_source_at, p_last_success_at,
    p_expected_cadence, p_state, p_stale_reason, now(), coalesce(p_evidence, '{}'::jsonb)
  )
  on conflict (user_id, source) do update set
    last_source_at = case
      when excluded.last_source_at is null then public.data_freshness.last_source_at
      when public.data_freshness.last_source_at is null then excluded.last_source_at
      when excluded.last_source_at >= public.data_freshness.last_source_at then excluded.last_source_at
      else public.data_freshness.last_source_at
    end,
    last_success_at = case
      when excluded.last_success_at is null then public.data_freshness.last_success_at
      when public.data_freshness.last_success_at is null then excluded.last_success_at
      when excluded.last_success_at >= public.data_freshness.last_success_at then excluded.last_success_at
      else public.data_freshness.last_success_at
    end,
    expected_cadence = excluded.expected_cadence,
    state = excluded.state,
    stale_reason = excluded.stale_reason,
    last_verified_at = excluded.last_verified_at,
    last_verification_evidence = excluded.last_verification_evidence
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.record_source_freshness(uuid, text, timestamptz, timestamptz, interval, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_source_freshness(uuid, text, timestamptz, timestamptz, interval, text, text, jsonb)
  to service_role;

-- Universal iOS snapshots provide the authoritative Apple permission result.
-- This trigger runs after the source manifest is durably stored, so a failed
-- persistence transaction can never report a successful freshness update.
create or replace function public.record_mobile_source_freshness()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_received_at timestamptz;
  v_source_key text;
  v_state text;
  v_reason text;
begin
  if new.source not in ('health', 'calendar', 'reminders', 'location', 'screen_time') then
    return new;
  end if;
  select received_at into v_received_at from public.mobile_snapshots where id = new.snapshot_internal_id;
  v_source_key := 'apple_' || new.source;
  if new.client_requested and new.client_captured and new.client_error is null
    and new.server_received_count = new.server_accepted_count + new.server_rejected_count
    and new.client_record_count = new.server_received_count
    and new.server_rejected_count = 0 then
    v_state := 'fresh';
    v_reason := null;
  elsif new.client_captured and new.client_error is null then
    v_state := 'error';
    v_reason := 'source_counts_inconsistent';
  elsif not new.client_requested then
    v_state := 'not_connected';
    v_reason := 'source_not_requested';
  elsif new.client_error is not null then
    v_state := 'error';
    v_reason := 'provider_capture_failed';
  else
    v_state := 'stale';
    v_reason := 'source_not_captured';
  end if;
  perform public.record_source_freshness(
    new.user_id,
    v_source_key,
    coalesce(new.client_captured_at, v_received_at),
    case when v_state = 'fresh' then v_received_at else null end,
    case when new.source = 'screen_time' then interval '7 days' else interval '24 hours' end,
    v_state,
    v_reason,
    jsonb_build_object(
      'transport', 'mobile_snapshot',
      'snapshot_internal_id', new.snapshot_internal_id,
      'server_received_at', v_received_at,
      'client_captured', new.client_captured,
      'server_received_count', new.server_received_count,
      'server_accepted_count', new.server_accepted_count,
      'server_rejected_count', new.server_rejected_count,
      'client_record_count', new.client_record_count,
      'counts_consistent', new.server_received_count = new.server_accepted_count + new.server_rejected_count
        and new.client_record_count = new.server_received_count,
      'error_present', new.client_error is not null
    )
  );
  return new;
end;
$$;
drop trigger if exists mobile_snapshot_source_freshness on public.mobile_snapshot_sources;
create trigger mobile_snapshot_source_freshness
  after insert or update of client_requested, client_captured, client_captured_at, client_error,
    server_received_count, server_accepted_count, server_rejected_count
  on public.mobile_snapshot_sources
  for each row execute function public.record_mobile_source_freshness();
revoke all on function public.record_mobile_source_freshness() from public, anon, authenticated;

-- Preserve freshness for the original Apple bridge contract as well. The
-- receipt insert and typed rows are one database transaction; a later failure
-- rolls this update back with the import.
create or replace function public.record_legacy_apple_bridge_freshness()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.apple_bridge_devices where id = new.device_id;
  if v_user_id is null then return new; end if;
  perform public.record_source_freshness(
    v_user_id, 'apple_reminders', new.received_at, new.received_at,
    interval '24 hours', 'fresh', null,
    jsonb_build_object('transport', 'apple_bridge', 'receipt_id', new.id)
  );
  perform public.record_source_freshness(
    v_user_id, 'apple_calendar', new.received_at, new.received_at,
    interval '24 hours', 'fresh', null,
    jsonb_build_object('transport', 'apple_bridge', 'receipt_id', new.id)
  );
  return new;
end;
$$;
drop trigger if exists apple_bridge_receipt_freshness on public.apple_bridge_receipts;
create trigger apple_bridge_receipt_freshness
  after insert on public.apple_bridge_receipts
  for each row execute function public.record_legacy_apple_bridge_freshness();
revoke all on function public.record_legacy_apple_bridge_freshness() from public, anon, authenticated;

-- Backfill only from already persisted, successfully captured manifests. This
-- does not replay historical records or alter the Shortcut contract.
do $$
declare
  source_row record;
begin
  for source_row in
    select distinct on (s.user_id, s.source)
      s.user_id, s.source, s.client_captured_at, m.received_at,
      m.id snapshot_internal_id, s.server_received_count,
      s.server_accepted_count, s.server_rejected_count
    from public.mobile_snapshot_sources s
    join public.mobile_snapshots m on m.id = s.snapshot_internal_id
    where s.source in ('health', 'calendar', 'reminders', 'location', 'screen_time')
      and s.client_requested and s.client_captured and s.client_error is null
      and s.server_received_count = s.server_accepted_count + s.server_rejected_count
      and s.client_record_count = s.server_received_count
      and s.server_rejected_count = 0
      and m.status in ('accepted', 'partial')
    order by s.user_id, s.source, coalesce(s.client_captured_at, m.received_at) desc, m.received_at desc
  loop
    perform public.record_source_freshness(
      source_row.user_id,
      'apple_' || source_row.source,
      coalesce(source_row.client_captured_at, source_row.received_at),
      source_row.received_at,
      case when source_row.source = 'screen_time' then interval '7 days' else interval '24 hours' end,
      'fresh', null,
      jsonb_build_object(
        'transport', 'mobile_snapshot_backfill',
        'snapshot_internal_id', source_row.snapshot_internal_id,
        'server_received_at', source_row.received_at,
        'server_received_count', source_row.server_received_count,
        'server_accepted_count', source_row.server_accepted_count,
        'server_rejected_count', source_row.server_rejected_count
      )
    );
  end loop;
end;
$$;

grant select on public.data_freshness to authenticated;

-- Narrow authenticated Apple revoke boundary. Gate consumption, ownership,
-- device disablement, and audit insertion share one transaction.
create or replace function public.revoke_apple_bridge_device(
  p_device_id uuid,
  p_gate_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_consumed integer;
  v_device_id uuid;
  v_gate_user_id uuid;
  v_gate_action text;
  v_gate_expires_at timestamptz;
  v_gate_consumed_at timestamptz;
begin
  if v_user_id is null or not public.is_allowed_aal2() then
    return jsonb_build_object('code', 'fresh_mfa_required');
  end if;
  select user_id, action_key, expires_at, consumed_at
    into v_gate_user_id, v_gate_action, v_gate_expires_at, v_gate_consumed_at
    from public.mfa_action_gates
    where id = p_gate_id
    for update;
  if not found then return jsonb_build_object('code', 'invalid_mfa_gate'); end if;
  if v_gate_user_id <> v_user_id then
    return jsonb_build_object('code', 'mfa_gate_wrong_user');
  end if;
  if v_gate_action <> 'connection_revoke' then
    return jsonb_build_object('code', 'mfa_gate_invalid_action');
  end if;
  if v_gate_consumed_at is not null then
    return jsonb_build_object('code', 'mfa_gate_replayed');
  end if;
  if v_gate_expires_at <= now() then
    return jsonb_build_object('code', 'mfa_gate_expired');
  end if;
  update public.mfa_action_gates
  set consumed_at = now()
  where id = p_gate_id and user_id = v_user_id
    and action_key = 'connection_revoke'
    and consumed_at is null and expires_at > now();
  get diagnostics v_consumed = row_count;
  if v_consumed <> 1 then return jsonb_build_object('code', 'fresh_mfa_required'); end if;
  update public.apple_bridge_devices
  set revoked_at = now()
  where id = p_device_id and user_id = v_user_id and revoked_at is null
  returning id into v_device_id;
  if v_device_id is null then return jsonb_build_object('code', 'device_not_found'); end if;
  insert into public.audit_events(
    user_id, actor_type, action_type, target_type, target_id, aal, result,
    redacted_after
  ) values (
    v_user_id, 'user', 'apple_bridge_device_revoked', 'apple_bridge_device',
    v_device_id::text, 'aal2_fresh', 'success', jsonb_build_object('revoked', true)
  );
  return jsonb_build_object('status', 'revoked', 'device_id', v_device_id);
exception when others then
  raise exception 'apple_revoke_transaction_failed';
end;
$$;
revoke all on function public.revoke_apple_bridge_device(uuid, uuid) from public, anon;
grant execute on function public.revoke_apple_bridge_device(uuid, uuid) to authenticated;

-- Connection source permissions are a sensitive scope change. Gate
-- consumption, configuration persistence, and the audit record are one
-- transaction so a replay or failed audit cannot partially apply a change.
create or replace function public.update_google_source_selection(
  p_connection_id uuid,
  p_selected_calendar_ids text[],
  p_selected_drive_file_ids text[],
  p_gate_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate_user_id uuid;
  v_gate_action text;
  v_gate_expires_at timestamptz;
  v_gate_consumed_at timestamptz;
  v_connection_id uuid;
  v_calendars text[] := coalesce(p_selected_calendar_ids, '{}'::text[]);
  v_drive_files text[] := coalesce(p_selected_drive_file_ids, '{}'::text[]);
begin
  if v_user_id is null or not public.is_allowed_aal2() then
    return jsonb_build_object('code', 'fresh_mfa_required');
  end if;
  select user_id, action_key, expires_at, consumed_at
    into v_gate_user_id, v_gate_action, v_gate_expires_at, v_gate_consumed_at
    from public.mfa_action_gates
    where id = p_gate_id
    for update;
  if not found then return jsonb_build_object('code', 'invalid_mfa_gate'); end if;
  if v_gate_user_id <> v_user_id then
    return jsonb_build_object('code', 'mfa_gate_wrong_user');
  end if;
  if v_gate_action <> 'connection_scope_change' then
    return jsonb_build_object('code', 'mfa_gate_invalid_action');
  end if;
  if v_gate_consumed_at is not null then
    return jsonb_build_object('code', 'mfa_gate_replayed');
  end if;
  if v_gate_expires_at <= now() then
    return jsonb_build_object('code', 'mfa_gate_expired');
  end if;
  if cardinality(v_calendars) > 100 or cardinality(v_drive_files) > 100
     or cardinality(v_calendars) <> (select count(distinct value) from unnest(v_calendars) as u(value))
     or cardinality(v_drive_files) <> (select count(distinct value) from unnest(v_drive_files) as u(value))
     or exists (select 1 from unnest(v_calendars || v_drive_files) as u(value)
       where length(value) not between 1 and 320 or value ~ '[[:cntrl:]]') then
    return jsonb_build_object('code', 'invalid_source_selection');
  end if;
  select id into v_connection_id
    from public.connections
    where id = p_connection_id and user_id = v_user_id and provider = 'google'
      and status = 'connected' and sync_enabled = true
    for update;
  if not found then return jsonb_build_object('code', 'connection_unavailable'); end if;
  update public.mfa_action_gates set consumed_at = now()
    where id = p_gate_id and consumed_at is null;
  if not found then return jsonb_build_object('code', 'mfa_gate_replayed'); end if;
  update public.connections
    set configuration = jsonb_build_object(
      'selected_calendar_ids', to_jsonb(v_calendars),
      'selected_drive_file_ids', to_jsonb(v_drive_files)
    )
    where id = v_connection_id and user_id = v_user_id;
  if not found then raise exception 'connection_scope_change_failed'; end if;
  insert into public.audit_events(
    user_id, actor_type, action_type, target_type, target_id, aal, result,
    redacted_after
  ) values (
    v_user_id, 'user', 'google_source_selection_changed', 'connection',
    v_connection_id::text, 'aal2_fresh', 'success', jsonb_build_object(
      'selected_calendar_count', cardinality(v_calendars),
      'selected_drive_file_count', cardinality(v_drive_files)
    )
  );
  return jsonb_build_object(
    'status', 'updated',
    'connection_id', v_connection_id,
    'configuration', jsonb_build_object(
      'selected_calendar_ids', to_jsonb(v_calendars),
      'selected_drive_file_ids', to_jsonb(v_drive_files)
    )
  );
exception when others then
  raise exception 'connection_scope_change_failed';
end;
$$;
revoke all on function public.update_google_source_selection(uuid, text[], text[], uuid)
  from public, anon;
grant execute on function public.update_google_source_selection(uuid, text[], text[], uuid)
  to authenticated;
