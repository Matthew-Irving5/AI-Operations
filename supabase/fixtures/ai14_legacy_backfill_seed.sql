-- Seed legacy-shaped rows before the AI-14 migration in a disposable local DB.
insert into public.report_sections(
  id,report_id,code,title,display_order,content,evidence_references
)
values (
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000000505',
  'ai14-legacy-backfill',
  'Synthetic legacy evidence',
  99,
  'Fixture for canonical evidence backfill.',
  '[{"id":"ai14-legacy-1","source":"Synthetic backfill source","claim":"Safe migration fixture"}]'::jsonb
);

update public.approvals
set decision = 'approved', decided_at = now()
where id = '00000000-0000-4000-8000-000000000707';
