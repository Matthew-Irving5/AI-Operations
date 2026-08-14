-- Keep the onboarding write narrow and auditable while avoiding a direct
-- table upsert from the Edge Function's client role.
create or replace function public.update_onboarding_checklist_item(
  p_user_id uuid,
  p_code text,
  p_completed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_code is null then
    raise exception 'invalid_onboarding_item';
  end if;
  insert into public.onboarding_checklist_items(user_id, code, completed_at)
  values (p_user_id, p_code, p_completed_at)
  on conflict (user_id, code) do update
    set completed_at = excluded.completed_at, updated_at = now();
end;
$$;
revoke all on function public.update_onboarding_checklist_item(uuid, text, timestamptz) from public;
grant execute on function public.update_onboarding_checklist_item(uuid, text, timestamptz) to service_role;
