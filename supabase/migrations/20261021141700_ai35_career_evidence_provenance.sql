alter table public.career_github_evidence
  add column if not exists source_date timestamptz;

alter table public.career_github_evidence
  drop constraint if exists career_github_evidence_evidence_kind_check;

alter table public.career_github_evidence
  add constraint career_github_evidence_evidence_kind_check
  check (evidence_kind in ('repository', 'activity', 'release', 'pull_request', 'ci', 'documentation'));

create index if not exists career_github_evidence_user_source_date_idx
  on public.career_github_evidence(user_id, source_date desc)
  where source_date is not null;
