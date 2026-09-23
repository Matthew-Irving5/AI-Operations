-- Route-aware travel and location preparation rules.
-- Legacy per-location minute columns remain for backwards compatibility, but are no longer
-- used by the Personal Operating Profile UI.
alter table public.time_preferences
  add column if not exists travel_buffer_percent numeric(5,2) not null default 20,
  add column if not exists minimum_travel_buffer_minutes integer not null default 5;

alter table public.time_preferences
  drop constraint if exists time_preferences_travel_buffer_percent_check,
  drop constraint if exists time_preferences_minimum_travel_buffer_minutes_check;
alter table public.time_preferences
  add constraint time_preferences_travel_buffer_percent_check
    check (travel_buffer_percent between 0 and 200),
  add constraint time_preferences_minimum_travel_buffer_minutes_check
    check (minimum_travel_buffer_minutes between 0 and 120);

create table if not exists public.location_travel_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  origin_location_id uuid not null references public.personal_locations(id) on delete cascade,
  destination_location_id uuid not null references public.personal_locations(id) on delete cascade,
  transport_mode text not null check (transport_mode in ('walking','cycling','public_transport','driving','other')),
  normal_minutes integer not null check (normal_minutes between 1 and 1440),
  peak_minutes integer not null check (peak_minutes between 1 and 1440),
  peak_start time,
  peak_end time,
  buffer_percent numeric(5,2) not null default 20 check (buffer_percent between 0 and 200),
  minimum_buffer_minutes integer not null default 5 check (minimum_buffer_minutes between 0 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, origin_location_id, destination_location_id, transport_mode),
  check (origin_location_id <> destination_location_id),
  check ((peak_start is null and peak_end is null) or (peak_start is not null and peak_end is not null))
);

create table if not exists public.location_preparation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  location_id uuid not null references public.personal_locations(id) on delete cascade,
  prepare_before_departure_minutes integer not null default 0 check (prepare_before_departure_minutes between 0 and 240),
  settle_after_arrival_minutes integer not null default 0 check (settle_after_arrival_minutes between 0 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, location_id)
);

alter table public.location_travel_rules enable row level security;
alter table public.location_preparation_rules enable row level security;
drop policy if exists own_location_travel_rules on public.location_travel_rules;
drop policy if exists own_location_preparation_rules on public.location_preparation_rules;
create policy own_location_travel_rules on public.location_travel_rules
  using (user_id = auth.uid() and public.is_allowed_aal2())
  with check (user_id = auth.uid() and public.is_allowed_aal2());
create policy own_location_preparation_rules on public.location_preparation_rules
  using (user_id = auth.uid() and public.is_allowed_aal2())
  with check (user_id = auth.uid() and public.is_allowed_aal2());

grant select on public.location_travel_rules, public.location_preparation_rules to authenticated;
revoke insert, update, delete on public.location_travel_rules, public.location_preparation_rules from authenticated;
