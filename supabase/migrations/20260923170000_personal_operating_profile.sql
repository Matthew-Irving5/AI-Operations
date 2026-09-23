-- Personal Operating Profile: encrypted approved locations and weekly planning preferences.
alter table public.personal_profiles
  add column if not exists date_of_birth date,
  add column if not exists home_location_id uuid,
  add column if not exists work_location_id uuid,
  add column if not exists career_summary text;

alter table public.personal_profiles
  drop constraint if exists personal_profiles_home_location_fk,
  drop constraint if exists personal_profiles_work_location_fk;
alter table public.personal_profiles
  add constraint personal_profiles_home_location_fk
    foreign key (home_location_id) references public.personal_locations(id) on delete set null,
  add constraint personal_profiles_work_location_fk
    foreign key (work_location_id) references public.personal_locations(id) on delete set null;

alter table public.personal_locations
  add column if not exists default_travel_minutes integer not null default 0,
  add column if not exists default_preparation_minutes integer not null default 0;
alter table public.personal_locations
  drop constraint if exists personal_locations_travel_minutes_check,
  drop constraint if exists personal_locations_preparation_minutes_check;
alter table public.personal_locations
  add constraint personal_locations_travel_minutes_check check (default_travel_minutes between 0 and 1440),
  add constraint personal_locations_preparation_minutes_check check (default_preparation_minutes between 0 and 1440);

create table if not exists public.time_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  preferred_focus_windows jsonb not null default '[]'::jsonb,
  guaranteed_busy_windows jsonb not null default '[]'::jsonb,
  preferred_training_windows jsonb not null default '[]'::jsonb,
  quiet_hours jsonb not null default '{}'::jsonb,
  maximum_focus_duration_minutes integer not null default 90 check (maximum_focus_duration_minutes between 15 and 480),
  minimum_unscheduled_buffer_minutes integer not null default 30 check (minimum_unscheduled_buffer_minutes between 0 and 1440),
  minimum_evening_buffer_minutes integer not null default 60 check (minimum_evening_buffer_minutes between 0 and 1440),
  transport_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, weekday)
);

alter table public.personal_profiles enable row level security;
drop policy if exists own_profiles on public.personal_profiles;
create policy own_profiles on public.personal_profiles
  using (user_id = auth.uid() and public.is_allowed_aal2())
  with check (user_id = auth.uid() and public.is_allowed_aal2());

alter table public.time_preferences enable row level security;
create policy own_time_preferences on public.time_preferences
  using (user_id = auth.uid() and public.is_allowed_aal2())
  with check (user_id = auth.uid() and public.is_allowed_aal2());

grant select on public.personal_profiles, public.time_preferences to authenticated;
