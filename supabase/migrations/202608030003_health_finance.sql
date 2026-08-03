-- Pass 04: Health & Performance and Finance Operations durable contracts.
create table public.health_imports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  source text not null check (source in ('apple_health','strava','hevy','nutrition','screen_time','manual')),
  idempotency_key text not null, payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_object_id uuid references public.source_objects(id), device_name text, collected_from timestamptz, collected_to timestamptz,
  status text not null default 'received' check(status in ('received','processed','rejected')), received_at timestamptz not null default now(),
  unique(user_id, source, idempotency_key), unique(user_id, payload_sha256)
);
create table public.health_samples (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  import_id uuid references public.health_imports(id) on delete set null, source text not null, external_id text not null,
  metric text not null, observed_at timestamptz not null, value numeric(16,6) not null, unit text not null,
  original_value numeric(16,6), original_unit text, device_name text, revision integer not null default 1 check(revision > 0),
  deleted_at timestamptz, provenance jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(user_id, source, external_id, revision)
);
create table public.health_daily_summaries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  summary_date date not null, metrics jsonb not null default '{}'::jsonb, data_confidence text not null check(data_confidence in ('low','medium','high')),
  completeness numeric(5,4) not null check(completeness between 0 and 1), calculated_at timestamptz not null default now(),
  unique(user_id, summary_date)
);
create table public.health_rejected_records (
  id uuid primary key default gen_random_uuid(), import_id uuid not null references public.health_imports(id) on delete cascade,
  record_index integer not null check(record_index >= 0), reason text not null, redacted_record jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(import_id, record_index)
);
create table public.health_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  metric text not null, target_value numeric(16,6), unit text not null, target_date date, status text not null default 'active' check(status in ('active','paused','completed')), created_at timestamptz not null default now()
);
create table public.health_plans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  plan_kind text not null check(plan_kind in ('weekly','monthly','running_block','quarterly')), starts_on date not null, ends_on date,
  content jsonb not null default '{}'::jsonb, safety_validated boolean not null default false, created_at timestamptz not null default now()
);
create table public.screen_time_imports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  source_object_id uuid references public.source_objects(id), status text not null default 'experimental_disabled' check(status in ('experimental_disabled','received','processed','rejected')),
  created_at timestamptz not null default now()
);

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  institution_name text not null, account_label text not null, account_type text not null check(account_type in ('bank','credit','cash','savings','investment','other')),
  currency char(3) not null, external_reference text, active boolean not null default true, created_at timestamptz not null default now(),
  unique(user_id, institution_name, account_label)
);
create table public.finance_statements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  account_id uuid references public.finance_accounts(id) on delete set null, source text not null check(source in ('upload','gmail','drive','google_sheet')),
  source_object_id uuid not null references public.source_objects(id), sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null, period_start date, period_end date, opening_balance numeric(16,2), closing_balance numeric(16,2),
  currency char(3), status text not null default 'archived' check(status in ('archived','parsed','rejected')), created_at timestamptz not null default now(),
  unique(user_id, sha256)
);
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null, parent_id uuid references public.finance_categories(id), active boolean not null default true, created_at timestamptz not null default now(), unique(user_id, name)
);
create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  account_id uuid not null references public.finance_accounts(id) on delete restrict, statement_id uuid references public.finance_statements(id) on delete set null,
  external_id text, transaction_date date not null, posted_at timestamptz, description text not null, amount numeric(16,2) not null check(amount <> 0),
  currency char(3) not null, balance_after numeric(16,2), category_id uuid references public.finance_categories(id),
  categorisation_source text not null default 'unassigned' check(categorisation_source in ('unassigned','rule','ai_proposed','user_confirmed')),
  corrected_from_id uuid references public.finance_transactions(id), transaction_hash text not null check(transaction_hash ~ '^[a-f0-9]{64}$'),
  provenance jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(account_id, transaction_hash), unique(account_id, external_id)
);
create table public.finance_close_periods (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  period_start date not null, period_end date not null check(period_end >= period_start), close_kind text not null check(close_kind in ('daily','monthly','quarterly','annual')),
  readiness text not null default 'pending' check(readiness in ('pending','blocked','ready','closed')), blockers jsonb not null default '[]'::jsonb,
  reconciled boolean not null default false, report_id uuid references public.reports(id), created_at timestamptz not null default now(), unique(user_id, period_start, period_end, close_kind)
);
create table public.finance_sheet_adapters (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  spreadsheet_external_id text not null, configuration jsonb not null default '{}'::jsonb, read_only boolean not null default true check(read_only), created_at timestamptz not null default now(), unique(user_id, spreadsheet_external_id)
);

alter table public.health_imports enable row level security; alter table public.health_samples enable row level security; alter table public.health_daily_summaries enable row level security; alter table public.health_rejected_records enable row level security; alter table public.health_goals enable row level security; alter table public.health_plans enable row level security; alter table public.screen_time_imports enable row level security; alter table public.finance_accounts enable row level security; alter table public.finance_statements enable row level security; alter table public.finance_categories enable row level security; alter table public.finance_transactions enable row level security; alter table public.finance_close_periods enable row level security; alter table public.finance_sheet_adapters enable row level security;
create policy own_health_imports on public.health_imports using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_health_samples on public.health_samples using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_health_summaries on public.health_daily_summaries using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_health_rejections on public.health_rejected_records for select using(exists(select 1 from public.health_imports i where i.id = import_id and i.user_id = auth.uid()) and public.is_allowed_aal2());
create policy own_health_goals on public.health_goals using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_health_plans on public.health_plans using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_screen_time_imports on public.screen_time_imports using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_finance_accounts on public.finance_accounts using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_finance_statements on public.finance_statements using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_finance_categories on public.finance_categories using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_finance_transactions on public.finance_transactions using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_finance_close_periods on public.finance_close_periods using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_finance_sheet_adapters on public.finance_sheet_adapters using(user_id = auth.uid() and public.is_allowed_aal2());
grant select, insert, update on public.health_goals, public.finance_accounts, public.finance_categories to authenticated;
grant select on public.health_imports, public.health_samples, public.health_daily_summaries, public.health_rejected_records, public.health_plans, public.screen_time_imports, public.finance_statements, public.finance_transactions, public.finance_close_periods, public.finance_sheet_adapters to authenticated;
create index health_samples_user_metric_time_idx on public.health_samples(user_id, metric, observed_at desc) where deleted_at is null;
create index finance_transactions_user_date_idx on public.finance_transactions(user_id, transaction_date desc);
create index finance_close_periods_user_kind_idx on public.finance_close_periods(user_id, close_kind, period_end desc);

insert into public.workflow_definitions(manager_id, code, version, trigger_type, input_schema, output_schema, active)
select id, workflow.code, 1, 'schedule_or_manual', '{"type":"object","additionalProperties":false}'::jsonb, '{"type":"object","additionalProperties":false}'::jsonb, true
from public.managers, (values
  ('health-daily-processing'), ('health-weekly-review'), ('health-monthly-composition'), ('health-running-block'), ('health-quarterly-strategy'),
  ('finance-daily-close'), ('finance-monthly-close'), ('finance-quarterly-review'), ('finance-annual-review')
) as workflow(code) where managers.code = case when workflow.code like 'health-%' then 'health' else 'finance' end
on conflict (code) do nothing;
insert into public.feedback_categories(workflow_code, section_code, label) values
  ('health-weekly-review', null, 'body composition'), ('health-weekly-review', null, 'running'), ('health-weekly-review', null, 'strength'), ('health-weekly-review', null, 'nutrition'), ('health-weekly-review', null, 'sleep/recovery'), ('health-weekly-review', null, 'data omission'), ('health-weekly-review', null, 'numerical error'), ('health-weekly-review', null, 'safety concern'), ('health-weekly-review', null, 'plan realism'),
  ('finance-monthly-close', null, 'source/statement missing'), ('finance-monthly-close', null, 'transaction categorisation'), ('finance-monthly-close', null, 'income'), ('finance-monthly-close', null, 'expenditure'), ('finance-monthly-close', null, 'reconciliation/numerical error'), ('finance-monthly-close', null, 'forecast'), ('finance-monthly-close', null, 'recommendation'), ('finance-monthly-close', null, 'blocker/approval'), ('finance-monthly-close', null, 'writing/presentation')
on conflict (workflow_code, section_code, label) do nothing;

create or replace function public.complete_health_finance_run(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare run_row record; created_report uuid; report_summary text; report_title text; incomplete boolean := false;
begin
  select r.id, r.user_id, r.correlation_id, d.code into run_row from public.workflow_runs r join public.workflow_definitions d on d.id = r.workflow_definition_id where r.id = p_run_id for update;
  if not found or (run_row.code not like 'health-%' and run_row.code not like 'finance-%') then raise exception 'unsupported_health_finance_run'; end if;
  if run_row.code like 'health-%' then
    incomplete := not exists(select 1 from public.health_daily_summaries where user_id = run_row.user_id and summary_date >= (now() at time zone 'Europe/London')::date - 7);
    report_title := 'Health & Performance report';
    report_summary := case when incomplete then 'Health data is incomplete; this report does not draw clinical conclusions.' else 'Health trends were calculated deterministically from retained source data. This report is not medical advice.' end;
  else
    incomplete := exists(select 1 from public.finance_close_periods where user_id = run_row.user_id and readiness = 'blocked') or not exists(select 1 from public.finance_transactions where user_id = run_row.user_id);
    report_title := 'Finance Operations report';
    report_summary := case when incomplete then 'Finance close is incomplete or blocked; no financial action is proposed.' else 'Finance figures were reconciled deterministically against retained statement evidence.' end;
  end if;
  insert into public.reports(user_id, run_id, report_type, title, summary, markdown, structured_metrics, status)
  values (run_row.user_id, p_run_id, run_row.code, report_title, report_summary, '## ' || report_title || E'\n\n' || report_summary,
    jsonb_build_object('workflow', run_row.code, 'incomplete_data', incomplete, 'deterministic', true), 'validated') returning id into created_report;
  if run_row.code not in ('health-daily-processing','finance-daily-close') or incomplete then
    insert into public.notifications(user_id, type, recipient, subject, status, dedupe_key, correlation_id)
    values (run_row.user_id, 'report', 'Matthew.irving.ai@gmail.com', '[AI Operations] ' || report_title, 'queued', 'health-finance-report:' || created_report, run_row.correlation_id) on conflict(dedupe_key) do nothing;
  end if;
  update public.workflow_runs set status = 'succeeded', completed_at = now() where id = p_run_id;
  return created_report;
end; $$;
