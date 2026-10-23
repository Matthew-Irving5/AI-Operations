-- Make the universal Reminder contract identify its source list and enforce
-- each paired device's scope before any raw snapshot is retained.
alter table public.mobile_reminder_items
  add column if not exists list_name text;
alter table public.mobile_reminder_items
  drop constraint if exists mobile_reminder_items_adapter_version_check;
alter table public.mobile_reminder_items
  add constraint mobile_reminder_items_adapter_version_check
  check (adapter_version in ('v1', 'v2'));
alter table public.mobile_reminder_items
  add constraint mobile_reminder_items_list_name_check
  check (list_name is null or length(list_name) between 1 and 80);

create or replace function public.mobile_reminder_scope_code(
  p_records jsonb,
  p_enabled_lists text[]
) returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_record jsonb;
  v_list text;
begin
  if jsonb_typeof(p_records) <> 'array' then return null; end if;
  for v_record in select value from jsonb_array_elements(p_records) loop
    if coalesce(lower(btrim(v_record->>'source')) = 'reminders', false)
      or coalesce(lower(btrim(v_record->'raw_record'->>'source')) = 'reminders', false)
      or coalesce(lower(btrim(v_record->>'kind')) = 'reminder', false)
      or coalesce(lower(btrim(v_record->'raw_record'->>'kind')) = 'reminder', false)
    then
      if lower(btrim(v_record->>'source')) is distinct from 'reminders'
        or lower(btrim(v_record->'raw_record'->>'source')) is distinct from 'reminders'
        or lower(btrim(v_record->>'kind')) is distinct from 'reminder'
        or lower(btrim(v_record->'raw_record'->>'kind')) is distinct from 'reminder'
        or jsonb_typeof(v_record->'payload'->'contract_version') is distinct from 'number'
        or v_record->'payload'->>'contract_version' is distinct from '2'
        or jsonb_typeof(v_record->'raw_record'->'payload'->'contract_version') is distinct from 'number'
        or v_record->'raw_record'->'payload'->>'contract_version' is distinct from '2'
        or jsonb_typeof(v_record->'payload'->'list') is distinct from 'string'
        or jsonb_typeof(v_record->'raw_record'->'payload'->'list') is distinct from 'string'
        or v_record->'payload'->>'list' is distinct from v_record->'raw_record'->'payload'->>'list'
      then
        return 'reminder_v2_required';
      end if;
      v_list := v_record->'payload'->>'list';
      if not coalesce(v_list = any(p_enabled_lists), false) then
        return 'reminder_list_not_enabled';
      end if;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.mobile_reminder_scope_code(jsonb, text[])
  from public, anon, authenticated, service_role;

create or replace function public.ingest_mobile_snapshot(
  p_token_hash text,
  p_schema_version integer,
  p_snapshot_id uuid,
  p_request_id uuid,
  p_client_type text,
  p_client_version text,
  p_captured_at timestamptz,
  p_request_hash text,
  p_sources jsonb,
  p_records jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.apple_bridge_devices%rowtype;
  v_existing public.mobile_snapshots%rowtype;
  v_snapshot_internal_id uuid;
  v_received integer := jsonb_array_length(p_records);
  v_accepted integer := 0;
  v_rejected integer := 0;
  v_status text;
  v_response jsonb;
  v_scope_code text;
begin
  if p_schema_version <> 1 or jsonb_typeof(p_sources) <> 'array' or jsonb_typeof(p_records) <> 'array'
     or jsonb_array_length(p_sources) > 32 or jsonb_array_length(p_records) > 2500
     or p_client_type !~ '^[a-z][a-z0-9._-]{0,63}$' or length(p_client_version) not between 1 and 32
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('code', 'invalid_envelope');
  end if;

  select * into v_device from public.apple_bridge_devices
  where token_hash = p_token_hash and revoked_at is null;
  if not found then return jsonb_build_object('code', 'device_token_unknown'); end if;

  if not public.consume_edge_request_quota(v_device.user_id, 'mobile_snapshot_ingest', 20) then
    return jsonb_build_object('code', 'rate_limit_exceeded');
  end if;

  v_scope_code := public.mobile_reminder_scope_code(p_records, v_device.enabled_lists);
  if v_scope_code is not null then
    return jsonb_build_object('code', v_scope_code);
  end if;

  select * into v_existing from public.mobile_snapshots
  where device_id = v_device.id and request_id = p_request_id;
  if found then
    if v_existing.request_hash <> p_request_hash then
      return jsonb_build_object('code', 'request_id_payload_mismatch');
    end if;
    update public.apple_bridge_devices set last_seen_at = now() where id = v_device.id;
    return v_existing.response_payload || jsonb_build_object('replay', true);
  end if;

  if exists(select 1 from public.mobile_snapshots where device_id = v_device.id and snapshot_id = p_snapshot_id) then
    return jsonb_build_object('code', 'snapshot_id_conflict');
  end if;

  select count(*) filter (where value->>'ingest_status' = 'accepted'),
         count(*) filter (where value->>'ingest_status' = 'rejected')
  into v_accepted, v_rejected from jsonb_array_elements(p_records);
  if v_received <> v_accepted + v_rejected then
    return jsonb_build_object('code', 'invalid_record_outcomes');
  end if;
  v_status := case when v_rejected = 0 then 'accepted' else 'partial' end;

  select jsonb_build_object(
    'snapshot_id', p_snapshot_id, 'status', v_status,
    'summary', jsonb_build_object('received', v_received, 'accepted', v_accepted,
      'rejected', v_rejected, 'duplicate', 0, 'deferred', v_accepted),
    'sources', coalesce(jsonb_agg(jsonb_build_object(
      'source', s.value->>'source',
      'status', case when coalesce(x.rejected_count, 0) = 0 then 'accepted' else 'partial' end,
      'received', coalesce(x.received_count, 0),
      'rejected', coalesce(x.rejected_count, 0)
    ) order by s.ordinality), '[]'::jsonb)
  ) into v_response
  from jsonb_array_elements(p_sources) with ordinality s(value, ordinality)
  left join lateral (
    select count(*)::integer received_count,
      count(*) filter (where r.value->>'ingest_status' = 'rejected')::integer rejected_count
    from jsonb_array_elements(p_records) r
    where r.value->>'source' = s.value->>'source'
  ) x on true;

  insert into public.mobile_snapshots(device_id, user_id, snapshot_id, request_id,
    schema_version, client_type, client_version, captured_at, request_hash, status,
    received_count, accepted_count, rejected_count, deferred_count, response_payload)
  values (v_device.id, v_device.user_id, p_snapshot_id, p_request_id,
    p_schema_version, p_client_type, p_client_version, p_captured_at, p_request_hash,
    v_status, v_received, v_accepted, v_rejected, v_accepted, v_response)
  returning id into v_snapshot_internal_id;

  insert into public.mobile_snapshot_sources(snapshot_internal_id, user_id, source,
    client_requested, client_captured, client_captured_at, client_record_count,
    client_error, server_received_count, server_accepted_count, server_rejected_count)
  select v_snapshot_internal_id, v_device.user_id, s.value->>'source',
    (s.value->>'requested')::boolean, (s.value->>'captured')::boolean,
    nullif(s.value->>'captured_at', '')::timestamptz,
    (s.value->>'record_count')::integer, nullif(s.value->>'error', ''),
    count(r.value)::integer,
    count(r.value) filter (where r.value->>'ingest_status' = 'accepted')::integer,
    count(r.value) filter (where r.value->>'ingest_status' = 'rejected')::integer
  from jsonb_array_elements(p_sources) s(value)
  left join jsonb_array_elements(p_records) r(value) on r.value->>'source' = s.value->>'source'
  group by s.value;

  insert into public.mobile_ingestion_records(snapshot_internal_id, user_id, record_id,
    source, kind, external_id, source_created_at, source_modified_at, canonical_hash,
    payload, raw_record, ingest_status, reject_reason)
  select v_snapshot_internal_id, v_device.user_id, nullif(r.value->>'record_id', ''),
    nullif(r.value->>'source', ''), nullif(r.value->>'kind', ''), nullif(r.value->>'external_id', ''),
    nullif(r.value->>'source_created_at', '')::timestamptz,
    nullif(r.value->>'source_modified_at', '')::timestamptz,
    r.value->>'canonical_hash', r.value->'payload', r.value->'raw_record',
    r.value->>'ingest_status', nullif(r.value->>'reject_reason', '')
  from jsonb_array_elements(p_records) r(value);

  update public.apple_bridge_devices set last_seen_at = now() where id = v_device.id;
  return v_response;
exception when unique_violation then
  return jsonb_build_object('code', 'duplicate_record_id');
end;
$$;

revoke all on function public.ingest_mobile_snapshot(
  text, integer, uuid, uuid, text, text, timestamptz, text, jsonb, jsonb
) from public;
grant execute on function public.ingest_mobile_snapshot(
  text, integer, uuid, uuid, text, text, timestamptz, text, jsonb, jsonb
) to anon, authenticated;

-- Reminder v2 keeps its own adapter and deduplication version while the
-- historical v1 adapter remains available for records already in storage.
create or replace function public.adapt_mobile_reminder_v2(p_record_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_record public.mobile_ingestion_records%rowtype;
  v_derived uuid;
  v_deduplication_key text;
  v_existing record;
  v_list text;
begin
  select * into v_record from public.mobile_ingestion_records where id = p_record_id;
  if not found or v_record.ingest_status <> 'accepted'
    or v_record.source <> 'reminders' or v_record.kind <> 'reminder' then
    return 'deferred';
  end if;

  perform 1 from public.mobile_record_adaptations
  where record_internal_id = v_record.id and adapter_name = 'reminders'
    and adapter_version = 'v2';
  if found then return 'duplicate'; end if;

  begin
    if jsonb_typeof(v_record.payload) is distinct from 'object'
      or jsonb_typeof(v_record.payload->'contract_version') is distinct from 'number'
      or v_record.payload->>'contract_version' is distinct from '2'
      or jsonb_typeof(v_record.payload->'list') is distinct from 'string'
      or v_record.payload->>'list' not in ('Fitness Plan', 'Household & Personal', 'AI Actions')
      or jsonb_typeof(v_record.payload->'title') is distinct from 'string'
      or jsonb_typeof(v_record.payload->'notes') is distinct from 'string'
      or jsonb_typeof(v_record.payload->'priority') is distinct from 'string'
      or jsonb_typeof(v_record.payload->'is_completed') is distinct from 'boolean'
      or jsonb_typeof(v_record.payload->'is_flagged') is distinct from 'boolean'
      or jsonb_typeof(v_record.payload->'due_at') is distinct from 'string'
      or jsonb_typeof(v_record.payload->'completion_at') is distinct from 'string'
      or jsonb_typeof(v_record.payload->'url') is distinct from 'string'
      or jsonb_typeof(v_record.payload->'has_subtasks') is distinct from 'boolean'
    then raise exception 'invalid_reminders_v2_payload'; end if;

    v_list := v_record.payload->>'list';
    v_deduplication_key := public.mobile_typed_deduplication_key(
      v_record.external_id, v_record.source_modified_at, v_record.canonical_hash);
    perform pg_advisory_xact_lock(hashtextextended(
      v_record.user_id::text || ':reminders:v2:' || v_deduplication_key, 0));
    select derived_table, derived_row_id into v_existing
    from public.mobile_typed_deduplication_keys
    where user_id = v_record.user_id and adapter_name = 'reminders'
      and adapter_version = 'v2' and deduplication_key = v_deduplication_key;
    if found then
      insert into public.mobile_record_adaptations(record_internal_id, user_id,
        adapter_name, adapter_version, status, derived_table, derived_row_id)
      values(v_record.id, v_record.user_id, 'reminders', 'v2', 'duplicate',
        v_existing.derived_table, v_existing.derived_row_id);
      return 'duplicate';
    end if;

    insert into public.mobile_reminder_items(user_id, raw_record_id, adapter_version,
      list_name, title, notes, priority, is_completed, is_flagged, due_at,
      completion_at, url, has_subtasks)
    values(v_record.user_id, v_record.id, 'v2', v_list,
      v_record.payload->>'title', v_record.payload->>'notes', v_record.payload->>'priority',
      (v_record.payload->>'is_completed')::boolean, (v_record.payload->>'is_flagged')::boolean,
      public.mobile_parse_offset_timestamp(v_record.payload->>'due_at', true),
      public.mobile_parse_offset_timestamp(v_record.payload->>'completion_at', true),
      v_record.payload->>'url', (v_record.payload->>'has_subtasks')::boolean)
    returning id into v_derived;

    insert into public.mobile_typed_deduplication_keys(user_id, adapter_name,
      adapter_version, deduplication_key, derived_table, derived_row_id,
      canonical_raw_record_id)
    values(v_record.user_id, 'reminders', 'v2', v_deduplication_key,
      'mobile_reminder_items', v_derived, v_record.id);
    insert into public.mobile_record_adaptations(record_internal_id, user_id,
      adapter_name, adapter_version, status, derived_table, derived_row_id)
    values(v_record.id, v_record.user_id, 'reminders', 'v2', 'adapted',
      'mobile_reminder_items', v_derived);
    return 'adapted';
  exception when others then
    insert into public.mobile_record_adaptations(record_internal_id, user_id,
      adapter_name, adapter_version, status, error)
    values(v_record.id, v_record.user_id, 'reminders', 'v2', 'rejected', left(sqlerrm, 256));
    return 'rejected';
  end;
end;
$$;
revoke all on function public.adapt_mobile_reminder_v2(uuid) from public, anon, authenticated;

create or replace function public.mobile_adapter_validation_issues(
  p_adapter text,
  p_reason text,
  p_payload jsonb
) returns jsonb
language sql
stable
set search_path = public
as $$
  select case
    when p_adapter not in ('reminders:v1', 'reminders:v2')
      or p_reason not in ('invalid_reminders_v1_payload', 'invalid_reminders_v2_payload', 'invalid_offset_timestamp')
      or jsonb_typeof(p_payload) <> 'object'
    then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'path', field_name,
        'expected', expected_type,
        'received_type', coalesce(jsonb_typeof(p_payload -> field_name), 'missing'),
        'received', case
          when expose_received and jsonb_typeof(p_payload -> field_name) = 'string'
            then to_jsonb(left(p_payload ->> field_name, 64))
          when expose_received and jsonb_typeof(p_payload -> field_name) in ('number', 'boolean')
            then p_payload -> field_name
          else null
        end
      )) order by ordinal)
      from (
        select ordinal, field_name, expected_type, expose_received
        from (values
          (1, 'title', 'string', false),
          (2, 'notes', 'string', false),
          (3, 'priority', 'string', true),
          (4, 'is_completed', 'boolean', true),
          (5, 'is_flagged', 'boolean', true),
          (6, 'due_at', 'string', false),
          (7, 'completion_at', 'string', false),
          (8, 'url', 'string', false),
          (9, 'has_subtasks', 'boolean', true),
          (10, 'contract_version', 'number', true),
          (11, 'list', 'string', false)
        ) as typed(ordinal, field_name, expected_type, expose_received)
        where (field_name not in ('contract_version', 'list') or p_adapter = 'reminders:v2')
          and coalesce(jsonb_typeof(p_payload -> field_name), 'missing') <> expected_type
        union all
        select ordinal, field_name, 'empty string or offset-aware ISO-8601 timestamp', false
        from (values (6, 'due_at'), (7, 'completion_at')) as dated(ordinal, field_name)
        where jsonb_typeof(p_payload -> field_name) = 'string'
          and not public.mobile_is_valid_optional_offset_timestamp(p_payload ->> field_name)
        union all
        select 10, 'contract_version', 'number equal to 2', false
        where p_adapter = 'reminders:v2'
          and jsonb_typeof(p_payload->'contract_version') = 'number'
          and p_payload->>'contract_version' <> '2'
        union all
        select 11, 'list', 'approved Reminder list', false
        where p_adapter = 'reminders:v2'
          and jsonb_typeof(p_payload->'list') = 'string'
          and p_payload->>'list' not in ('Fitness Plan', 'Household & Personal', 'AI Actions')
      ) as invalid
    ), '[]'::jsonb)
  end;
$$;
revoke all on function public.mobile_adapter_validation_issues(text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.adapt_mobile_snapshot(
  p_token_hash text,
  p_snapshot_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
  v_snapshot_internal_id uuid;
  v_record record;
  v_outcome text;
  v_adapted integer := 0;
  v_duplicate integer := 0;
  v_rejected integer := 0;
  v_deferred integer := 0;
  v_rejections jsonb;
begin
  select id into v_device_id from public.apple_bridge_devices
  where token_hash = p_token_hash and revoked_at is null;
  if not found then return jsonb_build_object('code', 'device_token_unknown'); end if;
  select id into v_snapshot_internal_id from public.mobile_snapshots
  where device_id = v_device_id and snapshot_id = p_snapshot_id;
  if not found then return jsonb_build_object('code', 'snapshot_unknown'); end if;

  for v_record in select id, source, kind, payload from public.mobile_ingestion_records
    where snapshot_internal_id = v_snapshot_internal_id and ingest_status = 'accepted'
    order by received_at, id
  loop
    if v_record.source = 'reminders' and v_record.kind = 'reminder'
      and v_record.payload->'contract_version' = '2'::jsonb then
      v_outcome := public.adapt_mobile_reminder_v2(v_record.id);
    else
      v_outcome := public.adapt_mobile_record_v1(v_record.id);
    end if;
    if v_outcome = 'adapted' then v_adapted := v_adapted + 1;
    elsif v_outcome = 'duplicate' then v_duplicate := v_duplicate + 1;
    elsif v_outcome = 'rejected' then v_rejected := v_rejected + 1;
    else v_deferred := v_deferred + 1;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', r.record_id,
    'adapter', a.adapter_name || ':' || a.adapter_version,
    'reason', a.error,
    'issues', public.mobile_adapter_validation_issues(
      a.adapter_name || ':' || a.adapter_version, a.error, r.payload
    )
  ) order by r.received_at, r.id), '[]'::jsonb)
  into v_rejections
  from public.mobile_record_adaptations a
  join public.mobile_ingestion_records r on r.id = a.record_internal_id
  where r.snapshot_internal_id = v_snapshot_internal_id and a.status = 'rejected';

  return jsonb_build_object(
    'status', case when v_rejected > 0 then 'partial' else 'complete' end,
    'adapted', v_adapted, 'duplicate', v_duplicate, 'rejected', v_rejected,
    'deferred', v_deferred, 'rejections', v_rejections
  );
end;
$$;
revoke all on function public.adapt_mobile_snapshot(text, uuid) from public;
grant execute on function public.adapt_mobile_snapshot(text, uuid) to anon, authenticated;
