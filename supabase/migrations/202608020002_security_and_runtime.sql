create or replace function public.is_allowed_aal2()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where id = auth.uid() and is_allowed)
    and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$$;

create table public.ai_model_catalog (id uuid primary key default gen_random_uuid(), provider text not null, model_id text not null unique, tier text not null, enabled boolean not null default false, created_at timestamptz not null default now());
create table public.model_pricing (id uuid primary key default gen_random_uuid(), model_id uuid not null references public.ai_model_catalog(id), effective_from timestamptz not null, input_per_million numeric(14,6) not null check(input_per_million >= 0), cached_input_per_million numeric(14,6) not null check(cached_input_per_million >= 0), output_per_million numeric(14,6) not null check(output_per_million >= 0), source_url text not null, verified_at timestamptz not null, unique(model_id,effective_from));
create table public.prompt_templates (id uuid primary key default gen_random_uuid(), manager_id uuid references public.managers(id), code text not null unique, active_version integer, created_at timestamptz not null default now());
create table public.prompt_versions (id uuid primary key default gen_random_uuid(), template_id uuid not null references public.prompt_templates(id), version integer not null check(version > 0), system_text text not null, developer_text text not null, json_schema jsonb not null, evaluation_status text not null default 'draft', unique(template_id,version));
create table public.ai_calls (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), run_id uuid references public.workflow_runs(id), model_id uuid references public.ai_model_catalog(id), status text not null, actual_input_tokens bigint check(actual_input_tokens >= 0), actual_output_tokens bigint check(actual_output_tokens >= 0), actual_cost numeric(12,6) check(actual_cost >= 0), trace_object_reference text, created_at timestamptz not null default now());
create table public.cost_reservations (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), run_id uuid references public.workflow_runs(id), category text not null check(category in ('recurring','on_demand')), reserved_amount numeric(12,2) not null check(reserved_amount >= 0), consumed_amount numeric(12,2) not null default 0 check(consumed_amount >= 0), status text not null, created_at timestamptz not null default now());
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), type text not null, recipient text not null check(lower(recipient) = 'matthew.irving.ai@gmail.com'), subject text not null, status text not null, dedupe_key text not null unique, sent_at timestamptz, created_at timestamptz not null default now());
create table public.feedback (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), report_id uuid references public.reports(id), positive boolean not null, categories text[] not null default '{}', comment text, created_at timestamptz not null default now());
create table public.ingestion_batches (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), source text not null, status text not null, raw_object_id uuid references public.source_objects(id), checksum text not null, created_at timestamptz not null default now(), unique(user_id,source,checksum));

alter table public.ai_model_catalog enable row level security; alter table public.model_pricing enable row level security; alter table public.prompt_templates enable row level security; alter table public.prompt_versions enable row level security; alter table public.ai_calls enable row level security; alter table public.cost_reservations enable row level security; alter table public.notifications enable row level security; alter table public.feedback enable row level security; alter table public.ingestion_batches enable row level security;
create policy allowed_manager_read on public.managers for select using(public.is_allowed_aal2());
create policy allowed_definition_read on public.workflow_definitions for select using(public.is_allowed_aal2());
create policy allowed_model_read on public.ai_model_catalog for select using(public.is_allowed_aal2());
create policy allowed_pricing_read on public.model_pricing for select using(public.is_allowed_aal2());
create policy own_ai_calls on public.ai_calls for select using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_reservations on public.cost_reservations for select using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_notifications on public.notifications for select using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_feedback on public.feedback using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_ingestion_batches on public.ingestion_batches for select using(user_id = auth.uid() and public.is_allowed_aal2());

insert into public.ai_model_catalog(provider,model_id,tier,enabled) values ('openai','gpt-5.6-luna','luna',false),('openai','gpt-5.6-terra','terra',false),('openai','gpt-5.6-sol','sol',false);
