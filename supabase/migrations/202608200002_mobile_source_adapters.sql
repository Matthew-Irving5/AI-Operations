-- Deterministic v1 adapters for the passive mobile snapshot boundary.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.ingest_mobile_snapshot(text,integer,uuid,uuid,text,text,timestamptz,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  if position('jsonb_array_length(p_records) > 500' in v_definition) > 0 then
    execute replace(
      v_definition,
      'jsonb_array_length(p_records) > 500',
      'jsonb_array_length(p_records) > 2500'
    );
  elsif position('jsonb_array_length(p_records) > 2500' in v_definition) = 0 then
    raise exception 'unexpected_ingest_mobile_snapshot_definition';
  end if;
end;
$$;

alter table public.mobile_record_adaptations
  add constraint mobile_record_adaptations_record_adapter_unique
  unique(record_internal_id, adapter_name, adapter_version);

create table public.mobile_reminder_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  raw_record_id uuid not null references public.mobile_ingestion_records(id) on delete restrict,
  adapter_version text not null check(adapter_version = 'v1'),
  title text not null check(length(title) <= 1000),
  notes text not null check(length(notes) <= 16000),
  priority text not null check(length(priority) <= 128),
  is_completed boolean not null,
  is_flagged boolean not null,
  due_at timestamptz,
  completion_at timestamptz,
  url text not null check(length(url) <= 4096),
  has_subtasks boolean not null,
  created_at timestamptz not null default now(),
  unique(raw_record_id, adapter_version)
);

create table public.mobile_calendar_event_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  raw_record_id uuid not null references public.mobile_ingestion_records(id) on delete restrict,
  adapter_version text not null check(adapter_version = 'v1'),
  title text not null check(length(title) <= 1000),
  start_at timestamptz not null,
  end_at timestamptz not null check(end_at >= start_at),
  all_day boolean not null,
  calendar_name text not null check(length(calendar_name) <= 512),
  location_text text not null check(length(location_text) <= 4096),
  notes text not null check(length(notes) <= 16000),
  url text not null check(length(url) <= 4096),
  created_at timestamptz not null default now(),
  unique(raw_record_id, adapter_version)
);

create table public.mobile_health_sample_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  raw_record_id uuid not null references public.mobile_ingestion_records(id) on delete restrict,
  adapter_version text not null check(adapter_version = 'v1'),
  reported_type text not null check(length(reported_type) <= 256),
  reported_value jsonb not null check(jsonb_typeof(reported_value) in ('string', 'number')),
  reported_unit text not null check(length(reported_unit) <= 128),
  start_at timestamptz not null,
  end_at timestamptz not null check(end_at >= start_at),
  reported_duration text not null check(length(reported_duration) <= 256),
  source_name text not null check(length(source_name) <= 512),
  sample_name text not null check(length(sample_name) <= 512),
  created_at timestamptz not null default now(),
  unique(raw_record_id, adapter_version)
);

create table public.mobile_health_sample_normalizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  health_sample_id uuid not null references public.mobile_health_sample_items(id) on delete restrict,
  normalizer_version text not null check(normalizer_version = 'v1'),
  canonical_metric text,
  normalized_value numeric(20,6),
  normalized_unit text,
  status text not null check(status in ('normalized', 'deferred_non_numeric', 'deferred_unknown_type', 'deferred_unknown_unit')),
  created_at timestamptz not null default now(),
  unique(health_sample_id, normalizer_version),
  check((status = 'normalized' and canonical_metric is not null and normalized_value is not null and normalized_unit is not null)
    or status <> 'normalized')
);

create table public.mobile_location_observation_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  raw_record_id uuid not null references public.mobile_ingestion_records(id) on delete restrict,
  adapter_version text not null check(adapter_version = 'v1'),
  latitude numeric(11,8) not null check(latitude between -90 and 90),
  longitude numeric(12,8) not null check(longitude between -180 and 180),
  altitude numeric(16,4) not null,
  name text not null check(length(name) <= 1000),
  street text not null check(length(street) <= 1000),
  city text not null check(length(city) <= 512),
  state text not null check(length(state) <= 512),
  postcode text not null check(length(postcode) <= 128),
  region text not null check(length(region) <= 512),
  created_at timestamptz not null default now(),
  unique(raw_record_id, adapter_version)
);

create table public.mobile_screen_time_activity_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  raw_record_id uuid not null references public.mobile_ingestion_records(id) on delete restrict,
  adapter_version text not null check(adapter_version = 'v1'),
  raw_text text not null check(length(raw_text) <= 16000),
  created_at timestamptz not null default now(),
  unique(raw_record_id, adapter_version)
);

alter table public.mobile_reminder_items enable row level security;
alter table public.mobile_calendar_event_items enable row level security;
alter table public.mobile_health_sample_items enable row level security;
alter table public.mobile_health_sample_normalizations enable row level security;
alter table public.mobile_location_observation_items enable row level security;
alter table public.mobile_screen_time_activity_items enable row level security;

create policy own_mobile_reminder_items on public.mobile_reminder_items for select
  using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_mobile_calendar_event_items on public.mobile_calendar_event_items for select
  using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_mobile_health_sample_items on public.mobile_health_sample_items for select
  using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_mobile_health_sample_normalizations on public.mobile_health_sample_normalizations for select
  using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_mobile_location_observation_items on public.mobile_location_observation_items for select
  using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_mobile_screen_time_activity_items on public.mobile_screen_time_activity_items for select
  using(user_id = auth.uid() and public.is_allowed_aal2());

grant select on public.mobile_reminder_items, public.mobile_calendar_event_items,
  public.mobile_health_sample_items, public.mobile_health_sample_normalizations,
  public.mobile_location_observation_items, public.mobile_screen_time_activity_items
  to authenticated;

create or replace function public.mobile_parse_offset_timestamp(p_value text, p_allow_empty boolean default false)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  if p_allow_empty and coalesce(p_value, '') = '' then return null; end if;
  if p_value is null or p_value !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'invalid_offset_timestamp';
  end if;
  return p_value::timestamptz;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'invalid_offset_timestamp';
end;
$$;
revoke all on function public.mobile_parse_offset_timestamp(text, boolean) from public, anon, authenticated;

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

  perform 1 from public.mobile_record_adaptations
  where record_internal_id = v_record.id and adapter_name = v_adapter and adapter_version = 'v1';
  if found then return 'duplicate'; end if;

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
      if jsonb_typeof(v_record.payload->'latitude') <> 'number'
        or jsonb_typeof(v_record.payload->'longitude') <> 'number'
        or jsonb_typeof(v_record.payload->'altitude') <> 'number'
        or jsonb_typeof(v_record.payload->'name') <> 'string'
        or jsonb_typeof(v_record.payload->'street') <> 'string'
        or jsonb_typeof(v_record.payload->'city') <> 'string'
        or jsonb_typeof(v_record.payload->'state') <> 'string'
        or jsonb_typeof(v_record.payload->'postcode') <> 'string'
        or jsonb_typeof(v_record.payload->'region') <> 'string'
      then raise exception 'invalid_location_v1_payload'; end if;
      insert into public.mobile_location_observation_items(user_id, raw_record_id, adapter_version,
        latitude, longitude, altitude, name, street, city, state, postcode, region)
      values(v_record.user_id, v_record.id, 'v1', (v_record.payload->>'latitude')::numeric,
        (v_record.payload->>'longitude')::numeric, (v_record.payload->>'altitude')::numeric,
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

    insert into public.mobile_record_adaptations(record_internal_id, user_id,
      adapter_name, adapter_version, status, derived_table, derived_row_id)
    values(v_record.id, v_record.user_id, v_adapter, 'v1', 'adapted',
      case v_adapter
        when 'reminders' then 'mobile_reminder_items'
        when 'calendar' then 'mobile_calendar_event_items'
        when 'health' then 'mobile_health_sample_items'
        when 'location' then 'mobile_location_observation_items'
        when 'screen_time' then 'mobile_screen_time_activity_items'
      end, v_derived);
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

  for v_record in select id from public.mobile_ingestion_records
    where snapshot_internal_id = v_snapshot_internal_id and ingest_status = 'accepted'
    order by received_at, id
  loop
    v_outcome := public.adapt_mobile_record_v1(v_record.id);
    if v_outcome = 'adapted' then v_adapted := v_adapted + 1;
    elsif v_outcome = 'duplicate' then v_duplicate := v_duplicate + 1;
    elsif v_outcome = 'rejected' then v_rejected := v_rejected + 1;
    else v_deferred := v_deferred + 1;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', r.record_id,
    'adapter', a.adapter_name || ':' || a.adapter_version,
    'reason', a.error
  ) order by r.received_at, r.id), '[]'::jsonb)
  into v_rejections
  from public.mobile_record_adaptations a
  join public.mobile_ingestion_records r on r.id = a.record_internal_id
  where r.snapshot_internal_id = v_snapshot_internal_id and a.status = 'rejected';

  return jsonb_build_object(
    'status', case when v_rejected > 0 then 'partial' else 'complete' end,
    'adapted', v_adapted,
    'duplicate', v_duplicate,
    'rejected', v_rejected,
    'deferred', v_deferred,
    'rejections', v_rejections
  );
end;
$$;
revoke all on function public.adapt_mobile_snapshot(text, uuid) from public;
grant execute on function public.adapt_mobile_snapshot(text, uuid) to anon, authenticated;

comment on function public.adapt_mobile_snapshot(text, uuid) is
  'Passive deterministic adapters only. This function must not invoke AI, workflows, notifications, schedules, or external actions.';
