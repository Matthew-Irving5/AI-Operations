begin;
select plan(4);

select ok(
  exists (
    select 1 from public.actions a
    join public.workflow_runs r on r.id = a.run_id
    join public.workflow_definitions d on d.id = r.workflow_definition_id
    where a.id = '00000000-0000-4000-8000-000000000606'
      and a.manager_id = d.manager_id
  ),
  'legacy actions inherit their manager from the existing workflow definition'
);
select is(
  (select approval_state from public.actions where id = '00000000-0000-4000-8000-000000000606'),
  'approved',
  'legacy action approval state reflects the existing approval decision'
);
select ok(
  exists (
    select 1 from public.evidence_references e
    where e.user_id = '00000000-0000-0000-0000-000000000101'
      and e.contract_version = 1
      and e.source_type = 'legacy_reference'
      and e.source_key = 'report-section:00000000-0000-4000-8000-000000001401:1:ai14-legacy-1'
      and e.title = 'Synthetic backfill source'
      and e.provenance->>'reportSectionId' = '00000000-0000-4000-8000-000000001401'
  ),
  'legacy report evidence becomes a versioned provenance reference'
);
select ok(
  exists (
    select 1 from public.evidence_references e
    join public.evidence_links l on l.evidence_reference_id = e.id
    where e.source_key = 'report-section:00000000-0000-4000-8000-000000001401:1:ai14-legacy-1'
      and l.entity_type = 'report_section'
      and l.entity_id = '00000000-0000-4000-8000-000000001401'
      and l.relation = 'context'
  ),
  'legacy report evidence is linked to its original report section'
);

select * from finish();
rollback;
