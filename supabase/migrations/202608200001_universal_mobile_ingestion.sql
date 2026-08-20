create table public.mobile_snapshots (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.apple_bridge_devices(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete cascade,
  snapshot_id uuid not null,
  request_id uuid not null,
  schema_version integer not null check (schema_version = 1),
  client_type text not null check (client_type ~ '^[a-z][a-z0-9._-]{0,63}$'),
  client_version text not null check (length(client_version) between 1 and 32),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('accepted', 'partial')),
  received_count integer not null check (received_count >= 0),
  accepted_count integer not null check (accepted_count >= 0),
  rejected_count integer not null check (rejected_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  deferred_count integer not null check (deferred_count >= 0),
  response_payload jsonb not null,
  unique(device_id, snapshot_id),
  unique(device_id, request_id),
  check (received_count = accepted_count + rejected_count),
  check (deferred_count <= accepted_count)
);

create table public.mobile_snapshot_sources (
  id uuid primary key default gen_random_uuid(),
  snapshot_internal_id uuid not null references public.mobile_snapshots(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete cascade,
  source text not null check (source ~ '^[a-z][a-z0-9._-]{0,63}$'),
  client_requested boolean not null,
  client_captured boolean not null,
  client_captured_at timestamptz,
  client_record_count integer not null check (client_record_count >= 0),
  client_error text check (client_error is null or length(client_error) <= 256),
  server_received_count integer not null check (server_received_count >= 0),
  server_accepted_count integer not null check (server_accepted_count >= 0),
  server_rejected_count integer not null check (server_rejected_count >= 0),
  unique(snapshot_internal_id, source),
  check (server_received_count = server_accepted_count + server_rejected_count)
);

create table public.mobile_ingestion_records (
  id uuid primary key default gen_random_uuid(),
  snapshot_internal_id uuid not null references public.mobile_snapshots(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete cascade,
  record_id text,
  source text,
  kind text,
  external_id text,
  source_created_at timestamptz,
  source_modified_at timestamptz,
  canonical_hash text not null check (canonical_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb,
  raw_record jsonb not null,
  received_at timestamptz not null default now(),
  ingest_status text not null check (ingest_status in ('accepted', 'rejected')),
  reject_reason text check (reject_reason is null or length(reject_reason) <= 128),
  check ((ingest_status = 'accepted' and reject_reason is null and record_id is not null and source is not null and kind is not null and payload is not null)
      or (ingest_status = 'rejected' and reject_reason is not null)),
  check (record_id is null or length(record_id) <= 64),
  check (source is null or source ~ '^[a-z][a-z0-9._-]{0,63}$'),
  check (kind is null or kind ~ '^[a-z][a-z0-9._-]{0,63}$'),
  check (external_id is null or length(external_id) <= 512)
);
create unique index mobile_ingestion_records_snapshot_record_idx
  on public.mobile_ingestion_records(snapshot_internal_id, record_id)
  where record_id is not null;

create table public.mobile_ingestion_attachments (
  id uuid primary key default gen_random_uuid(),
  snapshot_internal_id uuid not null references public.mobile_snapshots(id) on delete restrict,
  record_internal_id uuid references public.mobile_ingestion_records(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete cascade,
  attachment_id text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  upload_reference text not null,
  received_at timestamptz not null default now()
);

create table public.mobile_record_adaptations (
  id uuid primary key default gen_random_uuid(),
  record_internal_id uuid not null references public.mobile_ingestion_records(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete cascade,
  adapter_name text not null check (adapter_name ~ '^[a-z][a-z0-9._-]{0,63}$'),
  adapter_version text not null check (length(adapter_version) between 1 and 32),
  correlation_id uuid not null default gen_random_uuid(),
  status text not null check (status in ('adapted', 'duplicate', 'rejected', 'failed')),
  error text check (error is null or length(error) <= 256),
  derived_table text,
  derived_row_id uuid,
  processed_at timestamptz not null default now()
);

alter table public.mobile_snapshots enable row level security;
alter table public.mobile_snapshot_sources enable row level security;
alter table public.mobile_ingestion_records enable row level security;
alter table public.mobile_ingestion_attachments enable row level security;
alter table public.mobile_record_adaptations enable row level security;

revoke all on public.mobile_snapshots, public.mobile_snapshot_sources,
  public.mobile_ingestion_records, public.mobile_ingestion_attachments,
  public.mobile_record_adaptations from anon, authenticated;

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
begin
  if p_schema_version <> 1 or jsonb_typeof(p_sources) <> 'array' or jsonb_typeof(p_records) <> 'array'
     or jsonb_array_length(p_sources) > 32 or jsonb_array_length(p_records) > 500
     or p_client_type !~ '^[a-z][a-z0-9._-]{0,63}$' or length(p_client_version) not between 1 and 32
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('code', 'invalid_envelope');
  end if;

  select * into v_device from public.apple_bridge_devices
  where token_hash = p_token_hash and revoked_at is null;
  if not found then return jsonb_build_object('code', 'device_token_unknown'); end if;

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

revoke all on function public.ingest_mobile_snapshot(text, integer, uuid, uuid, text, text, timestamptz, text, jsonb, jsonb) from public;
grant execute on function public.ingest_mobile_snapshot(text, integer, uuid, uuid, text, text, timestamptz, text, jsonb, jsonb) to anon, authenticated;
