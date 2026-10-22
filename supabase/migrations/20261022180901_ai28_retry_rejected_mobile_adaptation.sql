-- Retry only a previously rejected adapter attempt for the same raw record.
-- Serialize attempts per raw record so a concurrent replay cannot race a
-- successful canonical write and replace its provenance with a rejection.
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
  v_adapter text;
  v_adapter_version text;
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
    perform pg_advisory_xact_lock(hashtextextended(v_record.id::text || ':mobile-adaptation', 0));
    v_adapter := case
      when v_record.source = 'reminders' and v_record.kind = 'reminder' then 'reminders'
      when v_record.source = 'calendar' and v_record.kind = 'calendar_event' then 'calendar'
      when v_record.source = 'health' and v_record.kind = 'health_sample' then 'health'
      when v_record.source = 'location' and v_record.kind = 'location_observation' then 'location'
      when v_record.source = 'screen_time' and v_record.kind = 'app_website_activity' then 'screen_time'
      else null
    end;
    v_adapter_version := case
      when v_adapter = 'reminders' and v_record.payload->'contract_version' = '2'::jsonb then 'v2'
      else 'v1'
    end;
    if v_adapter is not null then
      delete from public.mobile_record_adaptations
      where record_internal_id = v_record.id
        and adapter_name = v_adapter
        and adapter_version = v_adapter_version
        and status = 'rejected';
    end if;

    if v_adapter = 'reminders' and v_adapter_version = 'v2' then
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
