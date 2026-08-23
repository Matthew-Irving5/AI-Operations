-- Cross-snapshot typed-state deduplication and narrow iOS location number compatibility.
create table public.mobile_typed_deduplication_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  adapter_name text not null check(adapter_name ~ '^[a-z][a-z0-9._-]{0,63}$'),
  adapter_version text not null check(length(adapter_version) between 1 and 32),
  deduplication_key text not null check(length(deduplication_key) between 1 and 1200),
  derived_table text not null,
  derived_row_id uuid not null,
  canonical_raw_record_id uuid not null references public.mobile_ingestion_records(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(user_id, adapter_name, adapter_version, deduplication_key)
);

alter table public.mobile_typed_deduplication_keys enable row level security;
revoke all on public.mobile_typed_deduplication_keys from anon, authenticated;

create or replace function public.mobile_typed_deduplication_key(
  p_external_id text,
  p_source_modified_at timestamptz,
  p_canonical_hash text
) returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(p_external_id, '') is not null and p_source_modified_at is not null then
      'external:' || p_external_id || ':modified:' ||
        to_char(p_source_modified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    when nullif(p_external_id, '') is not null then
      'external:' || p_external_id || ':hash:' || p_canonical_hash
    else 'content:' || p_canonical_hash
  end;
$$;
revoke all on function public.mobile_typed_deduplication_key(text, timestamptz, text)
  from public, anon, authenticated;

create or replace function public.mobile_shortcut_numeric(
  p_payload jsonb,
  p_field text
) returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_type text := jsonb_typeof(p_payload -> p_field);
  v_text text;
begin
  if v_type = 'number' then return (p_payload ->> p_field)::numeric; end if;
  if v_type <> 'string' then raise exception 'invalid_location_v1_payload'; end if;
  v_text := trim(p_payload ->> p_field);
  if v_text !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' then
    raise exception 'invalid_location_v1_payload';
  end if;
  return v_text::numeric;
exception when numeric_value_out_of_range then
  raise exception 'invalid_location_v1_payload';
end;
$$;
revoke all on function public.mobile_shortcut_numeric(jsonb, text)
  from public, anon, authenticated;

-- Seed one canonical key for each already-derived logical version. Historical
-- duplicate typed rows remain intact as immutable provenance.
insert into public.mobile_typed_deduplication_keys(
  user_id, adapter_name, adapter_version, deduplication_key,
  derived_table, derived_row_id, canonical_raw_record_id, created_at
)
select distinct on (a.user_id, a.adapter_name, a.adapter_version,
    public.mobile_typed_deduplication_key(r.external_id, r.source_modified_at, r.canonical_hash))
  a.user_id, a.adapter_name, a.adapter_version,
  public.mobile_typed_deduplication_key(r.external_id, r.source_modified_at, r.canonical_hash),
  a.derived_table, a.derived_row_id, r.id, a.processed_at
from public.mobile_record_adaptations a
join public.mobile_ingestion_records r on r.id = a.record_internal_id
where a.status = 'adapted' and a.derived_table is not null and a.derived_row_id is not null
order by a.user_id, a.adapter_name, a.adapter_version,
  public.mobile_typed_deduplication_key(r.external_id, r.source_modified_at, r.canonical_hash),
  a.processed_at, a.id;

create or replace function public.adapt_mobile_record_v1(p_record_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.mobile_ingestion_records%rowtype;
  v_adapter text;
  v_derived uuid;
  v_derived_table text;
  v_deduplication_key text;
  v_existing record;
  v_latitude numeric;
  v_longitude numeric;
  v_altitude numeric;
  v_health_type text;
  v_health_unit text;
  v_health_value_text text;
  v_health_value numeric;
  v_metric text;
  v_normalized_value numeric;
  v_normalized_unit text;
  v_normalization_status text;
begin
  select * into v_record from public.mobile_ingestion_records where id = p_record_id;
  if not found or v_record.ingest_status <> 'accepted' then return 'deferred'; end if;

  v_adapter := case
    when v_record.source = 'reminders' and v_record.kind = 'reminder' then 'reminders'
    when v_record.source = 'calendar' and v_record.kind = 'calendar_event' then 'calendar'
    when v_record.source = 'health' and v_record.kind = 'health_sample' then 'health'
    when v_record.source = 'location' and v_record.kind = 'location_observation' then 'location'
    when v_record.source = 'screen_time' and v_record.kind = 'app_website_activity' then 'screen_time'
    else null
  end;
  if v_adapter is null then return 'deferred'; end if;

  v_derived_table := case v_adapter
    when 'reminders' then 'mobile_reminder_items'
    when 'calendar' then 'mobile_calendar_event_items'
    when 'health' then 'mobile_health_sample_items'
    when 'location' then 'mobile_location_observation_items'
    when 'screen_time' then 'mobile_screen_time_activity_items'
  end;

  perform 1 from public.mobile_record_adaptations
  where record_internal_id = v_record.id and adapter_name = v_adapter and adapter_version = 'v1';
  if found then return 'duplicate'; end if;

  v_deduplication_key := public.mobile_typed_deduplication_key(
    v_record.external_id, v_record.source_modified_at, v_record.canonical_hash);
  perform pg_advisory_xact_lock(hashtextextended(
    v_record.user_id::text || ':' || v_adapter || ':v1:' || v_deduplication_key, 0));
  select derived_table, derived_row_id into v_existing
  from public.mobile_typed_deduplication_keys
  where user_id = v_record.user_id and adapter_name = v_adapter
    and adapter_version = 'v1' and deduplication_key = v_deduplication_key;
  if found then
    insert into public.mobile_record_adaptations(record_internal_id, user_id,
      adapter_name, adapter_version, status, derived_table, derived_row_id)
    values(v_record.id, v_record.user_id, v_adapter, 'v1', 'duplicate',
      v_existing.derived_table, v_existing.derived_row_id);
    return 'duplicate';
  end if;

  begin
    if jsonb_typeof(v_record.payload) <> 'object' then raise exception 'payload_must_be_object'; end if;

    if v_adapter = 'reminders' then
      if jsonb_typeof(v_record.payload->'title') <> 'string'
        or jsonb_typeof(v_record.payload->'notes') <> 'string'
        or jsonb_typeof(v_record.payload->'priority') <> 'string'
        or jsonb_typeof(v_record.payload->'is_completed') <> 'boolean'
        or jsonb_typeof(v_record.payload->'is_flagged') <> 'boolean'
        or jsonb_typeof(v_record.payload->'due_at') <> 'string'
        or jsonb_typeof(v_record.payload->'completion_at') <> 'string'
        or jsonb_typeof(v_record.payload->'url') <> 'string'
        or jsonb_typeof(v_record.payload->'has_subtasks') <> 'boolean'
      then raise exception 'invalid_reminders_v1_payload'; end if;
      insert into public.mobile_reminder_items(user_id, raw_record_id, adapter_version,
        title, notes, priority, is_completed, is_flagged, due_at, completion_at, url, has_subtasks)
      values(v_record.user_id, v_record.id, 'v1', v_record.payload->>'title',
        v_record.payload->>'notes', v_record.payload->>'priority',
        (v_record.payload->>'is_completed')::boolean, (v_record.payload->>'is_flagged')::boolean,
        public.mobile_parse_offset_timestamp(v_record.payload->>'due_at', true),
        public.mobile_parse_offset_timestamp(v_record.payload->>'completion_at', true),
        v_record.payload->>'url', (v_record.payload->>'has_subtasks')::boolean)
      returning id into v_derived;

    elsif v_adapter = 'calendar' then
      if jsonb_typeof(v_record.payload->'title') <> 'string'
        or jsonb_typeof(v_record.payload->'start_at') <> 'string'
        or jsonb_typeof(v_record.payload->'end_at') <> 'string'
        or jsonb_typeof(v_record.payload->'all_day') <> 'boolean'
        or jsonb_typeof(v_record.payload->'calendar') <> 'string'
        or jsonb_typeof(v_record.payload->'location') <> 'string'
        or jsonb_typeof(v_record.payload->'notes') <> 'string'
        or jsonb_typeof(v_record.payload->'url') <> 'string'
      then raise exception 'invalid_calendar_v1_payload'; end if;
      insert into public.mobile_calendar_event_items(user_id, raw_record_id, adapter_version,
        title, start_at, end_at, all_day, calendar_name, location_text, notes, url)
      values(v_record.user_id, v_record.id, 'v1', v_record.payload->>'title',
        public.mobile_parse_offset_timestamp(v_record.payload->>'start_at'),
        public.mobile_parse_offset_timestamp(v_record.payload->>'end_at'),
        (v_record.payload->>'all_day')::boolean, v_record.payload->>'calendar',
        v_record.payload->>'location', v_record.payload->>'notes', v_record.payload->>'url')
      returning id into v_derived;

    elsif v_adapter = 'health' then
      if jsonb_typeof(v_record.payload->'type') <> 'string'
        or jsonb_typeof(v_record.payload->'value') not in ('string', 'number')
        or jsonb_typeof(v_record.payload->'unit') <> 'string'
        or jsonb_typeof(v_record.payload->'start_at') <> 'string'
        or jsonb_typeof(v_record.payload->'end_at') <> 'string'
        or jsonb_typeof(v_record.payload->'duration') <> 'string'
        or jsonb_typeof(v_record.payload->'source_name') <> 'string'
        or jsonb_typeof(v_record.payload->'name') <> 'string'
      then raise exception 'invalid_health_v1_payload'; end if;
      insert into public.mobile_health_sample_items(user_id, raw_record_id, adapter_version,
        reported_type, reported_value, reported_unit, start_at, end_at,
        reported_duration, source_name, sample_name)
      values(v_record.user_id, v_record.id, 'v1', v_record.payload->>'type',
        v_record.payload->'value', v_record.payload->>'unit',
        public.mobile_parse_offset_timestamp(v_record.payload->>'start_at'),
        public.mobile_parse_offset_timestamp(v_record.payload->>'end_at'),
        v_record.payload->>'duration', v_record.payload->>'source_name', v_record.payload->>'name')
      returning id into v_derived;

      v_health_type := lower(trim(v_record.payload->>'type'));
      v_health_unit := lower(trim(v_record.payload->>'unit'));
      v_health_value_text := trim(v_record.payload->>'value');
      v_metric := case v_health_type
        when 'steps' then 'steps'
        when 'heart rate' then 'heart_rate'
        when 'resting heart rate' then 'resting_heart_rate'
        when 'heart rate variability (sdnn)' then 'heart_rate_variability_sdnn'
        when 'active energy' then 'active_energy'
        when 'walking + running distance' then 'walking_running_distance'
        when 'exercise minutes' then 'exercise_minutes'
        when 'weight' then 'weight'
        else null
      end;
      if v_metric is null then
        v_normalization_status := case when v_health_type = 'sleep' then 'deferred_non_numeric' else 'deferred_unknown_type' end;
      elsif v_health_value_text !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' then
        v_normalization_status := 'deferred_non_numeric';
      else
        v_health_value := v_health_value_text::numeric;
        if v_metric = 'steps' and v_health_unit in ('count', 'step', 'steps') then
          v_normalized_value := v_health_value; v_normalized_unit := 'count';
        elsif v_metric in ('heart_rate', 'resting_heart_rate') and v_health_unit in ('bpm', 'count/min') then
          v_normalized_value := v_health_value; v_normalized_unit := 'bpm';
        elsif v_metric = 'heart_rate_variability_sdnn' and v_health_unit in ('ms', 'millisecond', 'milliseconds') then
          v_normalized_value := v_health_value; v_normalized_unit := 'ms';
        elsif v_metric = 'active_energy' and v_health_unit in ('kcal', 'cal') then
          v_normalized_value := v_health_value; v_normalized_unit := 'kcal';
        elsif v_metric = 'active_energy' and v_health_unit = 'kj' then
          v_normalized_value := v_health_value / 4.184; v_normalized_unit := 'kcal';
        elsif v_metric = 'walking_running_distance' and v_health_unit in ('km', 'kilometre', 'kilometres') then
          v_normalized_value := v_health_value; v_normalized_unit := 'km';
        elsif v_metric = 'walking_running_distance' and v_health_unit in ('m', 'metre', 'metres') then
          v_normalized_value := v_health_value / 1000; v_normalized_unit := 'km';
        elsif v_metric = 'walking_running_distance' and v_health_unit in ('mi', 'mile', 'miles') then
          v_normalized_value := v_health_value * 1.609344; v_normalized_unit := 'km';
        elsif v_metric = 'exercise_minutes' and v_health_unit in ('min', 'minute', 'minutes') then
          v_normalized_value := v_health_value; v_normalized_unit := 'min';
        elsif v_metric = 'weight' and v_health_unit in ('kg', 'kilogram', 'kilograms') then
          v_normalized_value := v_health_value; v_normalized_unit := 'kg';
        elsif v_metric = 'weight' and v_health_unit in ('lb', 'lbs', 'pound', 'pounds') then
          v_normalized_value := v_health_value * 0.45359237; v_normalized_unit := 'kg';
        end if;
        v_normalization_status := case when v_normalized_unit is null then 'deferred_unknown_unit' else 'normalized' end;
      end if;
      insert into public.mobile_health_sample_normalizations(user_id, health_sample_id,
        normalizer_version, canonical_metric, normalized_value, normalized_unit, status)
      values(v_record.user_id, v_derived, 'v1', v_metric, v_normalized_value,
        v_normalized_unit, v_normalization_status);

    elsif v_adapter = 'location' then
      if jsonb_typeof(v_record.payload->'latitude') not in ('number', 'string')
        or jsonb_typeof(v_record.payload->'longitude') not in ('number', 'string')
        or jsonb_typeof(v_record.payload->'altitude') not in ('number', 'string')
        or jsonb_typeof(v_record.payload->'name') <> 'string'
        or jsonb_typeof(v_record.payload->'street') <> 'string'
        or jsonb_typeof(v_record.payload->'city') <> 'string'
        or jsonb_typeof(v_record.payload->'state') <> 'string'
        or jsonb_typeof(v_record.payload->'postcode') <> 'string'
        or jsonb_typeof(v_record.payload->'region') <> 'string'
      then raise exception 'invalid_location_v1_payload'; end if;
      v_latitude := public.mobile_shortcut_numeric(v_record.payload, 'latitude');
      v_longitude := public.mobile_shortcut_numeric(v_record.payload, 'longitude');
      v_altitude := public.mobile_shortcut_numeric(v_record.payload, 'altitude');
      if v_latitude not between -90 and 90 or v_longitude not between -180 and 180 then
        raise exception 'invalid_location_v1_payload';
      end if;
      insert into public.mobile_location_observation_items(user_id, raw_record_id, adapter_version,
        latitude, longitude, altitude, name, street, city, state, postcode, region)
      values(v_record.user_id, v_record.id, 'v1', v_latitude, v_longitude, v_altitude,
        v_record.payload->>'name', v_record.payload->>'street', v_record.payload->>'city',
        v_record.payload->>'state', v_record.payload->>'postcode', v_record.payload->>'region')
      returning id into v_derived;

    elsif v_adapter = 'screen_time' then
      if jsonb_typeof(v_record.payload->'raw_text') <> 'string' then
        raise exception 'invalid_screen_time_v1_payload';
      end if;
      insert into public.mobile_screen_time_activity_items(user_id, raw_record_id,
        adapter_version, raw_text)
      values(v_record.user_id, v_record.id, 'v1', v_record.payload->>'raw_text')
      returning id into v_derived;
    end if;

    insert into public.mobile_typed_deduplication_keys(user_id, adapter_name,
      adapter_version, deduplication_key, derived_table, derived_row_id,
      canonical_raw_record_id)
    values(v_record.user_id, v_adapter, 'v1', v_deduplication_key,
      v_derived_table, v_derived, v_record.id);
    insert into public.mobile_record_adaptations(record_internal_id, user_id,
      adapter_name, adapter_version, status, derived_table, derived_row_id)
    values(v_record.id, v_record.user_id, v_adapter, 'v1', 'adapted',
      v_derived_table, v_derived);
    return 'adapted';
  exception when others then
    insert into public.mobile_record_adaptations(record_internal_id, user_id,
      adapter_name, adapter_version, status, error)
    values(v_record.id, v_record.user_id, v_adapter, 'v1', 'rejected', left(sqlerrm, 256));
    return 'rejected';
  end;
end;
$$;
revoke all on function public.adapt_mobile_record_v1(uuid) from public, anon, authenticated;

comment on table public.mobile_typed_deduplication_keys is
  'Concurrency-safe typed-state identity registry; raw mobile receipts remain immutable.';
comment on function public.mobile_shortcut_numeric(jsonb, text) is
  'Narrow iOS compatibility parser for documented numeric location fields only.';
