-- Pass 05: Career, Travel Planning and Consumer & Procurement durable contracts.
create table public.career_github_evidence (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  repository_external_id bigint not null, repository_name text not null, owner_login text not null check (owner_login = 'Matthew-Irving5'),
  evidence_kind text not null check (evidence_kind in ('repository','activity','release','pull_request','ci')), payload jsonb not null default '{}'::jsonb,
  source_url text not null check (source_url like 'https://github.com/Matthew-Irving5/%'), retrieved_at timestamptz not null, created_at timestamptz not null default now(),
  unique(user_id, repository_external_id, evidence_kind, source_url)
);
create table public.career_skill_evidence (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  skill_code text not null, confidence numeric(4,3) not null check(confidence between 0 and 1), evidence_refs jsonb not null check(jsonb_typeof(evidence_refs) = 'array'), assessed_at timestamptz not null default now(), unique(user_id, skill_code)
);
create table public.career_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null, target_role text, target_date date, status text not null default 'active' check(status in ('active','paused','completed')), evidence_plan jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create table public.career_opportunities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null, organisation text, source_url text not null check(source_url like 'https://%'), retrieved_at timestamptz not null, fit_confidence numeric(4,3) check(fit_confidence between 0 and 1), status text not null default 'new' check(status in ('new','saved','dismissed','applied')), created_at timestamptz not null default now()
);
create table public.research_sources (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  domain_area text not null check(domain_area in ('career','travel','procurement')), title text not null, source_url text not null check(source_url like 'https://%'), published_at timestamptz, retrieved_at timestamptz not null, expires_at timestamptz, source_quality text not null default 'unreviewed' check(source_quality in ('unreviewed','primary','secondary','rejected')), citation_text text not null, created_at timestamptz not null default now(), unique(user_id, domain_area, source_url, retrieved_at)
);
create table public.on_demand_research_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  manager_code text not null check(manager_code in ('travel','procurement')), hard_cap_minor integer not null check(hard_cap_minor > 0), reserved_minor integer not null default 0 check(reserved_minor >= 0 and reserved_minor <= hard_cap_minor),
  search_limit integer not null check(search_limit between 1 and 50), searches_used integer not null default 0 check(searches_used between 0 and search_limit), model_ceiling text not null check(model_ceiling in ('gpt-5.6-luna','gpt-5.6-terra')),
  request jsonb not null, status text not null default 'queued' check(status in ('queued','running','complete','failed','cancelled')), report_id uuid references public.reports(id), created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.travel_watches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, research_run_id uuid not null references public.on_demand_research_runs(id) on delete cascade,
  watch_kind text not null check(watch_kind in ('price','disruption','readiness','weather')), cadence text not null, expiry_at timestamptz not null, trigger_threshold jsonb not null default '{}'::jsonb,
  last_trigger_fingerprint text, active boolean not null default true, created_at timestamptz not null default now(), check(expiry_at > created_at)
);
create table public.procurement_recommendations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, research_run_id uuid not null references public.on_demand_research_runs(id) on delete cascade,
  recommendation_kind text not null check(recommendation_kind in ('best_overall','best_value','premium','excluded')), title text not null, total_cost_minor integer, currency char(3),
  compliance_passed boolean not null, warranty_summary text, returns_summary text, uncertainty text not null, citations jsonb not null check(jsonb_typeof(citations) = 'array'), created_at timestamptz not null default now()
);
create table public.procurement_lifecycle_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade, recommendation_id uuid references public.procurement_recommendations(id) on delete set null,
  receipt_source_object_id uuid references public.source_objects(id), vendor text not null, item_name text not null, purchased_at timestamptz, return_deadline timestamptz, warranty_expires_at timestamptz, created_at timestamptz not null default now(),
  check(return_deadline is null or purchased_at is null or return_deadline >= purchased_at), check(warranty_expires_at is null or purchased_at is null or warranty_expires_at >= purchased_at)
);

alter table public.career_github_evidence enable row level security; alter table public.career_skill_evidence enable row level security; alter table public.career_goals enable row level security; alter table public.career_opportunities enable row level security; alter table public.research_sources enable row level security; alter table public.on_demand_research_runs enable row level security; alter table public.travel_watches enable row level security; alter table public.procurement_recommendations enable row level security; alter table public.procurement_lifecycle_items enable row level security;
create policy own_career_github_evidence on public.career_github_evidence using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_career_skill_evidence on public.career_skill_evidence using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_career_goals on public.career_goals using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_career_opportunities on public.career_opportunities using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_research_sources on public.research_sources using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_on_demand_research_runs on public.on_demand_research_runs using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_travel_watches on public.travel_watches using(user_id = auth.uid() and public.is_allowed_aal2()) with check(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_procurement_recommendations on public.procurement_recommendations using(user_id = auth.uid() and public.is_allowed_aal2());
create policy own_procurement_lifecycle_items on public.procurement_lifecycle_items using(user_id = auth.uid() and public.is_allowed_aal2());
grant select on public.career_github_evidence, public.career_skill_evidence, public.research_sources, public.procurement_recommendations, public.procurement_lifecycle_items to authenticated;
grant select, insert, update on public.career_goals, public.career_opportunities, public.on_demand_research_runs, public.travel_watches to authenticated;
create index career_github_evidence_user_retrieved_idx on public.career_github_evidence(user_id, retrieved_at desc);
create index research_sources_user_domain_retrieved_idx on public.research_sources(user_id, domain_area, retrieved_at desc);
create index travel_watches_due_idx on public.travel_watches(expiry_at) where active;

insert into public.workflow_definitions(manager_id, code, version, trigger_type, input_schema, output_schema, active)
select id, workflow.code, 1, 'schedule_or_manual', '{"type":"object","additionalProperties":false}'::jsonb, '{"type":"object","additionalProperties":false}'::jsonb, true
from public.managers, (values ('career-daily-evidence-sync'), ('career-weekly-opportunity-pulse'), ('career-monthly-market-value'), ('career-quarterly-strategy'), ('travel-on-demand-plan'), ('procurement-on-demand-research')) as workflow(code)
where managers.code = case when workflow.code like 'career-%' then 'career' when workflow.code like 'travel-%' then 'travel' else 'procurement' end on conflict (code) do nothing;
insert into public.feedback_categories(workflow_code, section_code, label) values
 ('career-weekly-opportunity-pulse', null, 'skills/evidence'), ('career-weekly-opportunity-pulse', null, 'market data'), ('career-weekly-opportunity-pulse', null, 'salary estimate'), ('career-weekly-opportunity-pulse', null, 'role fit'), ('career-weekly-opportunity-pulse', null, 'opportunity selection'), ('career-weekly-opportunity-pulse', null, 'source quality'),
 ('travel-on-demand-plan', null, 'destination fit'), ('travel-on-demand-plan', null, 'itinerary'), ('travel-on-demand-plan', null, 'cost'), ('travel-on-demand-plan', null, 'source quality'), ('travel-on-demand-plan', null, 'omitted constraint'),
 ('procurement-on-demand-research', null, 'requirements misunderstood'), ('procurement-on-demand-research', null, 'candidate omitted'), ('procurement-on-demand-research', null, 'price'), ('procurement-on-demand-research', null, 'ranking'), ('procurement-on-demand-research', null, 'warranty/returns') on conflict (workflow_code, section_code, label) do nothing;

create or replace function public.complete_career_travel_procurement_run(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare run_row record; created_report uuid; title_text text; summary_text text;
begin
 select r.id, r.user_id, r.correlation_id, d.code into run_row from public.workflow_runs r join public.workflow_definitions d on d.id=r.workflow_definition_id where r.id=p_run_id for update;
 if not found or (run_row.code not like 'career-%' and run_row.code not like 'travel-%' and run_row.code not like 'procurement-%') then raise exception 'unsupported_career_travel_procurement_run'; end if;
 title_text := case when run_row.code like 'career-%' then 'Career Operations report' when run_row.code like 'travel-%' then 'Travel Planning report' else 'Consumer & Procurement report' end;
 summary_text := case when run_row.code like 'career-%' then 'Career evidence is limited to the allowlisted personal GitHub account and selected user sources.' when run_row.code like 'travel-%' then 'Travel research is bounded by this on-demand run cap, search limit, citations, and expiry controls.' else 'Procurement recommendations retain compliance exclusions, ownership cost, warranty, returns, timing, and citations.' end;
 insert into public.reports(user_id, run_id, report_type, title, summary, markdown, structured_metrics, status) values(run_row.user_id,p_run_id,run_row.code,title_text,summary_text,'## '||title_text||E'\n\n'||summary_text,jsonb_build_object('workflow',run_row.code,'citations_required',true,'outreach_automatic',false),'validated') returning id into created_report;
 insert into public.notifications(user_id,type,recipient,subject,status,dedupe_key,correlation_id) values(run_row.user_id,'report','Matthew.irving.ai@gmail.com','[AI Operations] '||title_text,'queued','career-travel-procurement-report:'||created_report,run_row.correlation_id) on conflict(dedupe_key) do nothing;
 update public.workflow_runs set status='succeeded', completed_at=now() where id=p_run_id;
 return created_report;
end; $$;
