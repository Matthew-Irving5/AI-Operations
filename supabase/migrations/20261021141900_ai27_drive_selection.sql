-- Drive selection is a permission boundary. Keep the selected IDs in the
-- connection and the row-level selected state in sync in the same transaction,
-- while retaining the existing rows and their provenance.
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
  update public.google_drive_files
    set selected = drive_file_id = any(v_drive_files)
    where connection_id = v_connection_id and user_id = v_user_id
      and selected is distinct from (drive_file_id = any(v_drive_files));
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
