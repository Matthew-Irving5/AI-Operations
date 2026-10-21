begin;
select plan(7);

select has_column('public', 'career_github_evidence', 'source_date', 'Career evidence retains its source timestamp');
select col_type_is('public', 'career_github_evidence', 'source_date', 'timestamp with time zone', 'Career source timestamp uses timestamptz');
select lives_ok($$
  insert into public.career_github_evidence(
    user_id, repository_external_id, repository_name, owner_login, evidence_kind,
    source_url, source_date, retrieved_at, payload
  ) values (
    '00000000-0000-0000-0000-000000000101', 90035, 'career-fixture', 'Matthew-Irving5',
    'documentation', 'https://github.com/Matthew-Irving5/career-fixture/blob/main/README.md',
    '2026-10-21T10:00:00Z', '2026-10-21T10:01:00Z', '{"path":"README.md","sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
  )
$$, 'A dated personal README provenance row satisfies the expanded evidence contract');
select is(
  (select source_date from public.career_github_evidence where repository_external_id = 90035 and evidence_kind = 'documentation'),
  '2026-10-21T10:00:00Z'::timestamptz,
  'Documentation evidence keeps its source date'
);
select lives_ok($$
  insert into public.career_github_evidence(
    user_id, repository_external_id, repository_name, owner_login, evidence_kind,
    source_url, source_date, retrieved_at, payload
  ) values (
    '00000000-0000-0000-0000-000000000101', 90035, 'career-fixture', 'Matthew-Irving5',
    'documentation', 'https://github.com/Matthew-Irving5/career-fixture/blob/main/README.md',
    '2026-10-21T10:00:00Z', '2026-10-21T10:02:00Z', '{"path":"README.md","sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
  ) on conflict (user_id, repository_external_id, evidence_kind, source_url)
    do update set retrieved_at = excluded.retrieved_at
$$, 'A repeated identical source upserts idempotently');
select is(
  (select count(*) from public.career_github_evidence where repository_external_id = 90035 and evidence_kind = 'documentation'),
  1::bigint,
  'A repeated documentation sync does not duplicate evidence'
);
select throws_ok($$
  insert into public.career_github_evidence(
    user_id, repository_external_id, repository_name, owner_login, evidence_kind,
    source_url, source_date, retrieved_at
  ) values (
    '00000000-0000-0000-0000-000000000101', 90036, 'career-fixture', 'Matthew-Irving5',
    'skill_inference', 'https://github.com/Matthew-Irving5/career-fixture', now(), now()
  )
$$, '23514', 'new row for relation "career_github_evidence" violates check constraint "career_github_evidence_evidence_kind_check"', 'Evidence kinds remain closed to canonical provenance classes');

select * from finish();
rollback;
