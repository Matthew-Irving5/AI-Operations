-- A successful TOTP check authorises one named sensitive action exactly once.
-- The browser receives only an opaque gate ID; consumption is enforced server-side.
create table public.mfa_action_gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  action_key text not null check (action_key in ('apple_bridge_create', 'gmail_test_notification')),
  expires_at timestamptz not null default now() + interval '2 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index mfa_action_gates_active_idx
  on public.mfa_action_gates(user_id, action_key, expires_at)
  where consumed_at is null;

alter table public.mfa_action_gates enable row level security;
revoke all on public.mfa_action_gates from anon, authenticated;

create or replace function public.create_mfa_action_gate(p_action_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate_id uuid;
begin
  if v_user_id is null or not public.is_allowed_aal2() then
    raise exception 'fresh_mfa_required';
  end if;
  if p_action_key not in ('apple_bridge_create', 'gmail_test_notification') then
    raise exception 'invalid_mfa_action';
  end if;
  if not exists (
    select 1 from public.mfa_reauthentication_events
    where user_id = v_user_id and verified_at >= now() - interval '1 minute'
  ) then
    raise exception 'fresh_mfa_required';
  end if;

  insert into public.mfa_action_gates(user_id, action_key)
  values (v_user_id, p_action_key)
  returning id into v_gate_id;
  return v_gate_id;
end;
$$;

grant execute on function public.create_mfa_action_gate(text) to authenticated;
