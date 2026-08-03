-- Pass 03: Google/Apple ingestion and Personal Operations durable contracts.
create table public.oauth_states (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  provider text not null check (provider = 'google'), state_hash text not null unique, pkce_verifier_encrypted text not null,
  requested_scopes text[] not null, redirect_uri text not null, expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now()
);
create table public.connection_credentials (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  encrypted_refresh_token text not null, encryption_key_version integer not null default 1 check (encryption_key_version > 0),
  token_expires_at timestamptz, updated_at timestamptz not null default now()
);
create table public.integration_cursors (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade, resource_type text not null,
  resource_id text not null default '', cursor text, updated_at timestamptz not null default now(), unique(connection_id, resource_type, resource_id)
);
create table public.google_messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, connection_id uuid not null references public.connections(id) on delete cascade,
  gmail_message_id text not null, thread_id text not null, label_ids text[] not null default '{}', internal_at timestamptz not null,
  snippet text, payload_hash text not null, created_at timestamptz not null default now(), unique(connection_id, gmail_message_id)
);
create table public.google_message_attachments (
  id uuid primary key default gen_random_uuid(), message_id uuid not null references public.google_messages(id) on delete cascade,
  attachment_id text not null, filename text not null, source_object_id uuid references public.source_objects(id), unique(message_id, attachment_id)
);
create table public.google_drive_files (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade, drive_file_id text not null,
  name text not null, mime_type text not null, modified_at timestamptz, checksum text, selected boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(connection_id, drive_file_id)
);
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, connection_id uuid references public.connections(id) on delete cascade,
  source text not null check(source in ('google','apple')), calendar_external_id text not null, external_id text not null, title text not null,
  starts_at timestamptz not null, ends_at timestamptz not null check(ends_at >= starts_at), source_timezone text not null, all_day boolean not null default false,
  location_reference text, notes text, recurrence_rule text, status text not null default 'confirmed', last_modified_at timestamptz not null, payload_hash text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, source, calendar_external_id, external_id)
);
create table public.reminders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, source text not null default 'apple' check(source in ('apple','manual')),
  list_name text not null, external_id text, title text not null, notes text, due_at timestamptz, completed_at timestamptz, recurrence_rule text,
  priority smallint not null default 0 check(priority between 0 and 9), last_modified_at timestamptz not null, payload_hash text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, source, external_id)
);
create table public.apple_bridge_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, label text not null,
  token_hash text not null unique, token_prefix text not null, enabled_lists text[] not null default array['Household & Personal'], revoked_at timestamptz,
  last_seen_at timestamptz, created_at timestamptz not null default now()
);
create table public.apple_bridge_receipts (
  id uuid primary key default gen_random_uuid(), device_id uuid not null references public.apple_bridge_devices(id) on delete cascade,
  idempotency_key text not null, payload_hash text not null, received_at timestamptz not null default now(), unique(device_id, idempotency_key)
);
create table public.personal_locations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, label text not null,
  encrypted_address text not null, location_kind text not null check(location_kind in ('home','work','common')), created_at timestamptz not null default now(), unique(user_id, label)
);
create table public.routines (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, title text not null, cadence text not null, preferred_window jsonb not null default '{}'::jsonb, active boolean not null default true, created_at timestamptz not null default now());
create table public.commitments (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, title text not null, due_at timestamptz, importance smallint not null default 3 check(importance between 1 and 5), status text not null default 'open' check(status in ('open','completed','deferred')), created_at timestamptz not null default now());
create table public.waiting_items (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, title text not null, owner text, due_at timestamptz, status text not null default 'open', created_at timestamptz not null default now());
create table public.personal_plans (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, plan_date date not null, plan_kind text not null check(plan_kind in ('morning','midday','evening','weekly')), report_id uuid references public.reports(id), material_change boolean not null default false, created_at timestamptz not null default now(), unique(user_id, plan_date, plan_kind));
create table public.time_blocks (id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.personal_plans(id) on delete cascade, title text not null, starts_at timestamptz not null, ends_at timestamptz not null check(ends_at > starts_at), block_kind text not null, flexible boolean not null default false, source_references jsonb not null default '[]'::jsonb);
create table public.planning_exceptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, exception_type text not null, occurred_at timestamptz not null default now(), details jsonb not null default '{}'::jsonb, material boolean not null default false);

alter table public.oauth_states enable row level security; alter table public.connection_credentials enable row level security; alter table public.integration_cursors enable row level security; alter table public.google_messages enable row level security; alter table public.google_message_attachments enable row level security; alter table public.google_drive_files enable row level security; alter table public.calendar_events enable row level security; alter table public.reminders enable row level security; alter table public.apple_bridge_devices enable row level security; alter table public.apple_bridge_receipts enable row level security; alter table public.personal_locations enable row level security; alter table public.routines enable row level security; alter table public.commitments enable row level security; alter table public.waiting_items enable row level security; alter table public.personal_plans enable row level security; alter table public.time_blocks enable row level security; alter table public.planning_exceptions enable row level security;
create policy own_oauth_states on public.oauth_states for select using(user_id = auth.uid() and public.is_allowed_aal2());
create policy deny_connection_credentials on public.connection_credentials for select using(false);
create policy own_cursors on public.integration_cursors for select using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_google_messages on public.google_messages for select using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_google_attachments on public.google_message_attachments for select using(exists(select 1 from public.google_messages m where m.id = message_id and m.user_id = auth.uid()) and public.is_allowed_aal2());
create policy own_google_drive_files on public.google_drive_files using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_calendar_events on public.calendar_events using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_reminders on public.reminders using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_bridge_devices on public.apple_bridge_devices using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy deny_bridge_receipts on public.apple_bridge_receipts for select using(false);
create policy own_personal_locations on public.personal_locations using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_routines on public.routines using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_commitments on public.commitments using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_waiting_items on public.waiting_items using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_personal_plans on public.personal_plans for select using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_time_blocks on public.time_blocks for select using(exists(select 1 from public.personal_plans p where p.id = plan_id and p.user_id = auth.uid()) and public.is_allowed_aal2());
create policy own_planning_exceptions on public.planning_exceptions for select using(user_id = auth.uid() and public.is_allowed_aal2());
grant select, insert, update on public.calendar_events, public.reminders, public.personal_locations, public.routines, public.commitments, public.waiting_items to authenticated;
grant select on public.oauth_states, public.integration_cursors, public.google_messages, public.google_message_attachments, public.google_drive_files, public.apple_bridge_devices, public.personal_plans, public.time_blocks, public.planning_exceptions to authenticated;
create index calendar_events_planning_idx on public.calendar_events(user_id, starts_at, ends_at); create index reminders_due_idx on public.reminders(user_id, due_at) where completed_at is null; create index bridge_receipts_device_idx on public.apple_bridge_receipts(device_id, received_at);
alter table public.connections add constraint connections_user_provider_unique unique(user_id, provider);

insert into public.workflow_definitions(manager_id, code, version, trigger_type, input_schema, output_schema, active)
select id, workflow.code, 1, 'schedule_or_manual', '{"type":"object","additionalProperties":false}'::jsonb,
  '{"type":"object","additionalProperties":false}'::jsonb, true
from public.managers, (values
  ('personal-morning-plan'), ('personal-midday-exception'), ('personal-evening-close'), ('personal-weekly-plan')
) as workflow(code)
where managers.code = 'personal'
on conflict (code) do nothing;

insert into public.feedback_categories(workflow_code, section_code, label) values
  ('personal-morning-plan', null, 'calendar accuracy'),
  ('personal-morning-plan', null, 'priority ranking'),
  ('personal-morning-plan', null, 'usefulness'),
  ('personal-midday-exception', null, 'exception accuracy'),
  ('personal-evening-close', null, 'completion summary'),
  ('personal-weekly-plan', null, 'weekly priorities')
on conflict (workflow_code, section_code, label) do nothing;

create or replace function public.complete_personal_run(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare run_row record; created_report uuid; has_exception boolean; v_plan_kind text; report_summary text;
begin
  select r.id, r.user_id, r.correlation_id, d.code into run_row
  from public.workflow_runs r join public.workflow_definitions d on d.id = r.workflow_definition_id
  where r.id = p_run_id for update;
  if not found or run_row.code not like 'personal-%' then raise exception 'unsupported_personal_run'; end if;
  v_plan_kind := replace(replace(run_row.code, 'personal-', ''), '-plan', '');
  has_exception := exists(
    select 1 from public.calendar_events first_event join public.calendar_events second_event
      on first_event.user_id = second_event.user_id and first_event.id < second_event.id
      and second_event.starts_at < first_event.ends_at + interval '15 minutes'
      and first_event.starts_at < second_event.ends_at
    where first_event.user_id = run_row.user_id and first_event.ends_at >= now() - interval '1 day'
  ) or exists(select 1 from public.reminders where user_id = run_row.user_id and completed_at is null and due_at <= now());
  report_summary := case when run_row.code = 'personal-midday-exception' and not has_exception
    then 'No material planning exception was detected.'
    when has_exception then 'Personal Operations identified a calendar or due-item exception requiring attention.'
    else 'Personal Operations generated a deterministic planning report from the connected calendar, reminders, routines, and approved actions.' end;
  insert into public.reports(user_id, run_id, report_type, title, summary, markdown, structured_metrics, status)
  values (run_row.user_id, p_run_id, run_row.code, 'Personal Operations report', report_summary,
    '## Personal Operations\n\n' || report_summary,
    jsonb_build_object('workflow', run_row.code, 'material_change', has_exception, 'deterministic', true), 'validated')
  returning id into created_report;
  insert into public.personal_plans(user_id, plan_date, plan_kind, report_id, material_change)
  values (run_row.user_id, (now() at time zone 'Europe/London')::date,
    case when v_plan_kind = 'midday-exception' then 'midday' when v_plan_kind = 'evening-close' then 'evening' when v_plan_kind = 'weekly' then 'weekly' else 'morning' end,
    created_report, has_exception)
  on conflict (user_id, plan_date, plan_kind) do update set report_id = excluded.report_id, material_change = excluded.material_change;
  if run_row.code <> 'personal-midday-exception' or has_exception then
    insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key, correlation_id)
    values (run_row.user_id, 'report', 'Matthew.irving.ai@gmail.com', '[AI Operations] Personal Operations report', 'queued', 'personal-report:' || created_report, run_row.correlation_id)
    on conflict (dedupe_key) do nothing;
  end if;
  update public.workflow_runs set status = 'succeeded', completed_at = now() where id = p_run_id;
  return created_report;
end; $$;
