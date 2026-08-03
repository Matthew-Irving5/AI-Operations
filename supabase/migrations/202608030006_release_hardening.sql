-- Pass 07: production-onboarding and release-safety gates.
create table public.onboarding_checklist_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
 code text not null check(code in ('supabase','cloudflare_r2','openai','google_oauth','initial_login','totp','gmail_test','apple_bridge','health_export','source_permissions','windows_worker','personal_profile','finance_mapping','github_connection','schedule_review','restore_test','production_acceptance')),
 completed_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,code)
);
create table public.production_acceptances (
 user_id uuid primary key references public.app_users(id) on delete cascade, accepted_at timestamptz not null, accepted_version text not null, audit_event_id uuid references public.audit_events(id), created_at timestamptz not null default now()
);
alter table public.onboarding_checklist_items enable row level security;
alter table public.production_acceptances enable row level security;
create policy own_onboarding_items on public.onboarding_checklist_items using(user_id=auth.uid() and public.is_allowed_aal2()) with check(user_id=auth.uid() and public.is_allowed_aal2());
create policy own_production_acceptance on public.production_acceptances for select using(user_id=auth.uid() and public.is_allowed_aal2());
grant select,insert,update on public.onboarding_checklist_items to authenticated;
grant select on public.production_acceptances to authenticated;
revoke insert,update,delete on public.workflow_schedules from authenticated;

create or replace function public.production_onboarding_complete(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- The acceptance endpoint records the seventeenth acknowledgement after this
  -- precondition succeeds; an acknowledgement must never unlock itself.
  select count(*) = 16 from public.onboarding_checklist_items
  where user_id = p_user_id
    and code <> 'production_acceptance'
    and completed_at is not null;
$$;
