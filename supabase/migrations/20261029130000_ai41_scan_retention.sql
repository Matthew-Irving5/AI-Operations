-- AI-41: keep scan history auditable while terminalising stale work.
-- The function is invoker-owned: callers can only mutate their own rows through
-- the existing authenticated RLS contract. No scan or audit row is deleted.
create or replace function public.expire_stale_digital_scans(
  p_now timestamptz default now()
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_scan record;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authenticated_user_required';
  end if;

  for v_scan in
    select id, run_id
      from public.digital_scans
     where user_id = v_user_id
       and created_at < p_now - interval '30 days'
       and status in ('queued', 'waiting_for_device', 'running')
     for update
  loop
    update public.digital_scans
       set status = 'cancelled', completed_at = coalesce(completed_at, p_now)
     where id = v_scan.id;

    if v_scan.run_id is not null then
      perform public.cancel_queued_run(v_user_id, v_scan.run_id);
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_stale_digital_scans(timestamptz) from public, anon;
grant execute on function public.expire_stale_digital_scans(timestamptz) to authenticated;

comment on function public.expire_stale_digital_scans(timestamptz) is
  'Terminalise authenticated user scans older than 30 days without deleting audit history.';

create index if not exists digital_scans_retention_idx
  on public.digital_scans(user_id, created_at)
  where status in ('queued', 'waiting_for_device', 'running');
