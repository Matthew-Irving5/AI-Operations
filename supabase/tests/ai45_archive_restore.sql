begin;
select plan(18);

select has_column('public', 'source_objects', 'encryption_metadata', 'source objects record encryption metadata');
select has_column('public', 'source_objects', 'provenance', 'source objects retain redacted provenance');
select has_column('public', 'source_objects', 'retention_class', 'source objects declare a retention class');
select has_column('public', 'archive_manifests', 'size_bytes', 'archive manifests record object size');
select has_column('public', 'archive_manifests', 'content_type', 'archive manifests record MIME type');
select has_column('public', 'archive_manifests', 'encryption_metadata', 'archive manifests record encryption metadata');
select has_column('public', 'archive_manifests', 'provenance', 'archive manifests record provenance');
select has_column('public', 'archive_manifests', 'retention_class', 'archive manifests declare retention');
select has_column('public', 'backup_restore_drills', 'database_sha256', 'restore drill records database checksum');
select has_column('public', 'backup_restore_drills', 'migration_version', 'restore drill records migration checkpoint');
select has_column('public', 'backup_restore_drills', 'key_version', 'restore drill records only the backup key version label');
select has_column('public', 'backup_restore_drills', 'source_commit_sha', 'restore drill records source code provenance');
select ok((select relrowsecurity from pg_class where oid = 'public.source_objects'::regclass), 'source object metadata remains protected by RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.archive_manifests'::regclass), 'archive manifests remain protected by RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.backup_restore_drills'::regclass), 'restore drill metadata remains protected by RLS');
select ok(not has_table_privilege('authenticated', 'public.backup_restore_drills', 'INSERT'), 'browser role cannot write restore drill evidence');
select ok(position('archive_read' in pg_get_constraintdef((select oid from pg_constraint where conname = 'mfa_action_gates_action_key_check'))) > 0, 'archive reads use the named one-time MFA action gate');
select ok(position('archive_read' in pg_get_functiondef('public.create_mfa_action_gate(text)'::regprocedure)) > 0, 'fresh MFA gate creation accepts only its declared archive-read action');

select * from finish();
rollback;
