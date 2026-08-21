-- Field-level diagnostics for deterministic mobile adapter rejections.
create or replace function public.mobile_is_valid_optional_offset_timestamp(
  p_value text
) returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if p_value = '' then return true; end if;
  if p_value is null or p_value !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return false;
  end if;
  perform p_value::timestamptz;
  return true;
exception when datetime_field_overflow or invalid_datetime_format then
  return false;
end;
$$;

revoke all on function public.mobile_is_valid_optional_offset_timestamp(text)
  from public, anon, authenticated;

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
    when p_adapter <> 'reminders:v1'
      or p_reason not in ('invalid_reminders_v1_payload', 'invalid_offset_timestamp')
      or jsonb_typeof(p_payload) <> 'object'
    then '[]'::jsonb
    else coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'path', field_name,
          'expected', expected_type,
          'received_type', coalesce(jsonb_typeof(p_payload -> field_name), 'missing'),
          'received', case
            when expose_received
              and jsonb_typeof(p_payload -> field_name) = 'string'
              then to_jsonb(left(p_payload ->> field_name, 64))
            when expose_received
              and jsonb_typeof(p_payload -> field_name) in ('number', 'boolean')
              then p_payload -> field_name
            else null
          end
        )) order by ordinal
      )
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
          (9, 'has_subtasks', 'boolean', true)
        ) as typed(ordinal, field_name, expected_type, expose_received)
        where coalesce(jsonb_typeof(p_payload -> field_name), 'missing') <> expected_type

        union all

        select ordinal, field_name,
          'empty string or offset-aware ISO-8601 timestamp', false
        from (values (6, 'due_at'), (7, 'completion_at')) as dated(ordinal, field_name)
        where jsonb_typeof(p_payload -> field_name) = 'string'
          and not public.mobile_is_valid_optional_offset_timestamp(p_payload ->> field_name)
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
    'reason', a.error,
    'issues', public.mobile_adapter_validation_issues(
      a.adapter_name || ':' || a.adapter_version,
      a.error,
      r.payload
    )
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

comment on function public.mobile_adapter_validation_issues(text, text, jsonb) is
  'Deterministic, privacy-bounded field diagnostics for mobile adapter validation failures.';
