-- Promote the authenticated universal iOS snapshot into the canonical Health
-- domain used by the Health page and scheduled Health workflows. The immutable
-- mobile snapshot remains the raw evidence; only explicitly normalized numeric
-- samples are promoted.

create or replace function public.promote_mobile_health_snapshot_internal(
  p_snapshot_internal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot public.mobile_snapshots%rowtype;
  v_import_id uuid;
  v_promoted integer := 0;
  v_summary_days integer := 0;
  v_from timestamptz;
  v_to timestamptz;
begin
  select * into v_snapshot
  from public.mobile_snapshots
  where id = p_snapshot_internal_id;
  if not found then return jsonb_build_object('code', 'snapshot_unknown'); end if;

  select min(h.start_at), max(h.end_at)
  into v_from, v_to
  from public.mobile_ingestion_records r
  join public.mobile_record_adaptations a on a.record_internal_id = r.id
    and a.adapter_name = 'health' and a.status in ('adapted', 'duplicate')
  join public.mobile_health_sample_items h on h.id = a.derived_row_id
  where r.snapshot_internal_id = v_snapshot.id and r.source = 'health';

  if v_from is null then
    return jsonb_build_object('status', 'no_health_records', 'promoted', 0, 'summary_days', 0);
  end if;

  insert into public.health_imports(
    user_id, source, idempotency_key, payload_sha256, device_name,
    collected_from, collected_to, status
  ) values (
    v_snapshot.user_id, 'apple_health', 'mobile-snapshot:' || v_snapshot.snapshot_id::text,
    v_snapshot.request_hash, 'ios-shortcut', v_from, v_to, 'processed'
  )
  on conflict (user_id, source, idempotency_key) do update
    set collected_from = excluded.collected_from,
        collected_to = excluded.collected_to,
        status = 'processed'
  returning id into v_import_id;

  insert into public.health_samples(
    user_id, import_id, source, external_id, metric, observed_at, value, unit,
    original_value, original_unit, device_name, revision, provenance
  )
  select distinct on (h.id)
    v_snapshot.user_id,
    v_import_id,
    'apple_health',
    h.id::text,
    case n.canonical_metric
      when 'weight' then 'weight_kg'
      when 'walking_running_distance' then 'running_distance_km'
      else n.canonical_metric
    end,
    h.start_at,
    n.normalized_value,
    n.normalized_unit,
    case when jsonb_typeof(h.reported_value) = 'number'
      then (h.reported_value #>> '{}')::numeric
      when (h.reported_value #>> '{}') ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
      then (h.reported_value #>> '{}')::numeric
      else null end,
    h.reported_unit,
    nullif(h.source_name, ''),
    1,
    jsonb_build_object(
      'mobile_snapshot_id', v_snapshot.snapshot_id,
      'mobile_health_sample_id', h.id,
      'adapter_version', h.adapter_version,
      'normalizer_version', n.normalizer_version
    )
  from public.mobile_ingestion_records r
  join public.mobile_record_adaptations a on a.record_internal_id = r.id
    and a.adapter_name = 'health' and a.status in ('adapted', 'duplicate')
  join public.mobile_health_sample_items h on h.id = a.derived_row_id
  join public.mobile_health_sample_normalizations n on n.health_sample_id = h.id
    and n.status = 'normalized'
  where r.snapshot_internal_id = v_snapshot.id and r.source = 'health'
  order by h.id
  on conflict (user_id, source, external_id, revision) do nothing;
  get diagnostics v_promoted = row_count;

  with affected_days as (
    select distinct (h.start_at at time zone 'Europe/London')::date as summary_date
    from public.mobile_ingestion_records r
    join public.mobile_record_adaptations a on a.record_internal_id = r.id
      and a.adapter_name = 'health' and a.status in ('adapted', 'duplicate')
    join public.mobile_health_sample_items h on h.id = a.derived_row_id
    where r.snapshot_internal_id = v_snapshot.id and r.source = 'health'
  ), numeric_daily as (
    select
      (s.observed_at at time zone 'Europe/London')::date as summary_date,
      coalesce(sum(s.value) filter (where s.metric = 'steps'), 0) as steps,
      round(avg(s.value) filter (where s.metric = 'heart_rate'), 2) as heart_rate_bpm,
      round(avg(s.value) filter (where s.metric = 'resting_heart_rate'), 2) as resting_heart_rate_bpm,
      round(coalesce(sum(s.value) filter (where s.metric = 'active_energy'), 0), 2) as active_energy_kcal,
      round(coalesce(sum(s.value) filter (where s.metric = 'running_distance_km'), 0), 3) as walking_running_distance_km,
      (array_agg(s.value order by s.observed_at desc) filter (where s.metric = 'weight_kg'))[1] as weight_kg,
      count(distinct s.metric) filter (where s.metric in ('steps','heart_rate','active_energy','running_distance_km','weight_kg')) as numeric_categories
    from public.health_samples s
    join affected_days d on d.summary_date = (s.observed_at at time zone 'Europe/London')::date
    where s.user_id = v_snapshot.user_id and s.deleted_at is null
    group by 1
  ), sleep_daily as (
    select (h.start_at at time zone 'Europe/London')::date summary_date, count(*)::integer sleep_samples
    from public.mobile_health_sample_items h
    where h.user_id = v_snapshot.user_id and lower(trim(h.reported_type)) = 'sleep'
    group by 1
  ), calculated as (
    select d.summary_date,
      jsonb_strip_nulls(jsonb_build_object(
        'steps', coalesce(n.steps, 0),
        'heart_rate_bpm', n.heart_rate_bpm,
        'resting_heart_rate_bpm', n.resting_heart_rate_bpm,
        'active_energy_kcal', coalesce(n.active_energy_kcal, 0),
        'walking_running_distance_km', coalesce(n.walking_running_distance_km, 0),
        'weight_kg', n.weight_kg,
        'sleep_samples', coalesce(sl.sleep_samples, 0)
      )) metrics,
      least(1::numeric, (coalesce(n.numeric_categories, 0) + case when coalesce(sl.sleep_samples, 0) > 0 then 1 else 0 end)::numeric / 6) completeness
    from affected_days d
    left join numeric_daily n using (summary_date)
    left join sleep_daily sl using (summary_date)
  )
  insert into public.health_daily_summaries(user_id, summary_date, metrics, data_confidence, completeness, calculated_at)
  select v_snapshot.user_id, summary_date, metrics,
    case when completeness >= .8 then 'high' when completeness >= .5 then 'medium' else 'low' end,
    completeness, now()
  from calculated
  on conflict (user_id, summary_date) do update
    set metrics = excluded.metrics,
        data_confidence = excluded.data_confidence,
        completeness = excluded.completeness,
        calculated_at = excluded.calculated_at;
  get diagnostics v_summary_days = row_count;

  insert into public.data_freshness(user_id, source, last_source_at, last_success_at, expected_cadence, state)
  values (v_snapshot.user_id, 'apple_health', v_to, v_snapshot.received_at, interval '24 hours',
    case when v_snapshot.received_at >= now() - interval '36 hours' then 'fresh' else 'stale' end)
  on conflict (user_id, source) do update
    set last_source_at = greatest(public.data_freshness.last_source_at, excluded.last_source_at),
        last_success_at = greatest(public.data_freshness.last_success_at, excluded.last_success_at),
        expected_cadence = excluded.expected_cadence,
        state = case when greatest(public.data_freshness.last_success_at, excluded.last_success_at) >= now() - interval '36 hours' then 'fresh' else 'stale' end;

  return jsonb_build_object('status', 'processed', 'import_id', v_import_id,
    'promoted', v_promoted, 'summary_days', v_summary_days);
end;
$$;

revoke all on function public.promote_mobile_health_snapshot_internal(uuid) from public, anon, authenticated;
grant execute on function public.promote_mobile_health_snapshot_internal(uuid) to service_role;

create or replace function public.promote_mobile_health_snapshot(
  p_token_hash text,
  p_snapshot_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_snapshot_internal_id uuid;
begin
  select s.id into v_snapshot_internal_id
  from public.mobile_snapshots s
  join public.apple_bridge_devices d on d.id = s.device_id and d.user_id = s.user_id
  where s.snapshot_id = p_snapshot_id and d.token_hash = p_token_hash and d.revoked_at is null;
  if v_snapshot_internal_id is null then return jsonb_build_object('code', 'snapshot_unknown'); end if;
  return public.promote_mobile_health_snapshot_internal(v_snapshot_internal_id);
end;
$$;

revoke all on function public.promote_mobile_health_snapshot(text, uuid) from public, authenticated;
grant execute on function public.promote_mobile_health_snapshot(text, uuid) to anon, service_role;

-- Accept the operator-approved existing mobile history as the initial backfill.
do $$
declare snapshot_row record;
begin
  for snapshot_row in
    select distinct s.id
    from public.mobile_snapshots s
    join public.mobile_ingestion_records r on r.snapshot_internal_id = s.id and r.source = 'health'
    order by s.id
  loop
    perform public.promote_mobile_health_snapshot_internal(snapshot_row.id);
  end loop;
end;
$$;
