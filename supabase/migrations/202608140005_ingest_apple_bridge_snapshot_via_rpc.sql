create or replace function public.ingest_apple_bridge_snapshot(
  p_token_hash text, p_idempotency_key text, p_payload_hash text,
  p_reminders jsonb, p_events jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_device public.apple_bridge_devices%rowtype;
  v_receipt uuid;
  v_previous_hash text;
  v_reminders integer := 0;
  v_events integer := 0;
begin
  select * into v_device from public.apple_bridge_devices where token_hash = p_token_hash and revoked_at is null;
  if not found then return jsonb_build_object('code', 'device_token_unknown'); end if;
  insert into public.apple_bridge_receipts(device_id, idempotency_key, payload_hash)
  values (v_device.id, p_idempotency_key, p_payload_hash)
  on conflict (device_id, idempotency_key) do nothing returning id into v_receipt;
  if v_receipt is null then
    select payload_hash into v_previous_hash from public.apple_bridge_receipts where device_id = v_device.id and idempotency_key = p_idempotency_key;
    if v_previous_hash = p_payload_hash then return jsonb_build_object('imported', false, 'replay', true); end if;
    return jsonb_build_object('code', 'idempotency_payload_mismatch');
  end if;
  insert into public.reminders(user_id, source, list_name, external_id, title, notes, due_at, completed_at, recurrence_rule, priority, last_modified_at, payload_hash)
  select v_device.user_id, 'apple', r.value->>'list', r.value->>'externalId', r.value->>'title', nullif(r.value->>'notes',''), nullif(r.value->>'dueAt','')::timestamptz, nullif(r.value->>'completedAt','')::timestamptz, nullif(r.value->>'recurrence',''), coalesce(nullif(r.value->>'priority','')::smallint, 0), (r.value->>'lastModifiedAt')::timestamptz, p_payload_hash
  from jsonb_array_elements(p_reminders) r where r.value->>'list' = any(v_device.enabled_lists)
  on conflict (user_id, source, external_id) do update set list_name = excluded.list_name, title = excluded.title, notes = excluded.notes, due_at = excluded.due_at, completed_at = excluded.completed_at, recurrence_rule = excluded.recurrence_rule, priority = excluded.priority, last_modified_at = excluded.last_modified_at, payload_hash = excluded.payload_hash, updated_at = now();
  get diagnostics v_reminders = row_count;
  insert into public.calendar_events(user_id, source, calendar_external_id, external_id, title, starts_at, ends_at, source_timezone, all_day, location_reference, notes, recurrence_rule, status, last_modified_at, payload_hash)
  select v_device.user_id, 'apple', e.value->>'calendar', e.value->>'externalId', e.value->>'title', (e.value->>'startsAt')::timestamptz, (e.value->>'endsAt')::timestamptz, 'Europe/London', coalesce((e.value->>'allDay')::boolean, false), nullif(e.value->>'location',''), nullif(e.value->>'notes',''), nullif(e.value->>'recurrence',''), coalesce(nullif(e.value->>'status',''), 'confirmed'), (e.value->>'lastModifiedAt')::timestamptz, p_payload_hash
  from jsonb_array_elements(p_events) e
  on conflict (user_id, source, calendar_external_id, external_id) do update set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at, all_day = excluded.all_day, location_reference = excluded.location_reference, notes = excluded.notes, recurrence_rule = excluded.recurrence_rule, status = excluded.status, last_modified_at = excluded.last_modified_at, payload_hash = excluded.payload_hash, updated_at = now();
  get diagnostics v_events = row_count;
  update public.apple_bridge_devices set last_seen_at = now() where id = v_device.id;
  return jsonb_build_object('imported', true, 'reminders', v_reminders, 'events', v_events);
end; $$;
grant execute on function public.ingest_apple_bridge_snapshot(text, text, text, jsonb, jsonb) to anon, authenticated;
