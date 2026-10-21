begin;

alter table public.source_objects
  add column encryption_metadata jsonb not null default '{"provider":"cloudflare-r2","mode":"server-side-managed","algorithm":"AES-256-GCM"}'::jsonb,
  add column provenance jsonb not null default '{}'::jsonb,
  add column retention_class text not null default 'permanent'
    check (retention_class in ('permanent','high_frequency_12_months','ai_trace_6_months','weekly_12_months','temporary_7_days','quarantine_30_days')),
  add constraint source_objects_encryption_metadata_object check (jsonb_typeof(encryption_metadata) = 'object'),
  add constraint source_objects_provenance_object check (jsonb_typeof(provenance) = 'object');

comment on column public.source_objects.encryption_metadata is 'Redacted storage encryption provider/mode/algorithm/key version metadata; never store key material.';
comment on column public.source_objects.provenance is 'Redacted producer and correlation provenance for the immutable object.';
comment on column public.source_objects.retention_class is 'Policy category used by the archive retention scheduler.';

alter table public.archive_manifests
  add column size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  add column content_type text check (content_type is null or length(content_type) between 1 and 120),
  add column encryption_metadata jsonb not null default '{"provider":"cloudflare-r2","mode":"server-side-managed","algorithm":"AES-256-GCM"}'::jsonb
    check (jsonb_typeof(encryption_metadata) = 'object'),
  add column provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  add column retention_class text not null default 'permanent'
    check (retention_class in ('permanent','high_frequency_12_months','ai_trace_6_months','weekly_12_months','temporary_7_days','quarantine_30_days'));

alter table public.backup_restore_drills
  add column backup_size_bytes bigint check (backup_size_bytes is null or backup_size_bytes > 0),
  add column database_sha256 text check (database_sha256 is null or database_sha256 ~ '^[a-f0-9]{64}$'),
  add column object_count integer check (object_count is null or object_count >= 0),
  add column manifest_version integer not null default 1 check (manifest_version > 0),
  add column migration_version text check (migration_version is null or migration_version ~ '^(0|[0-9]{14})$'),
  add column source_commit_sha text check (source_commit_sha is null or source_commit_sha ~ '^[a-f0-9]{40}$'),
  add column source_environment text check (source_environment is null or source_environment in ('staging','production')),
  add column encryption_algorithm text not null default 'AES-256-GCM' check (encryption_algorithm in ('AES-256-GCM','R2-MANAGED-AES-256-GCM')),
  add column key_version text check (key_version is null or key_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  add constraint backup_restore_drill_v2_integrity check (
    key_version is null or drill_status <> 'passed' or
    (encrypted and backup_size_bytes > 0 and database_sha256 is not null and object_count is not null
      and migration_version is not null and source_commit_sha is not null and source_environment is not null
      and restored_at is not null)
  );

comment on table public.backup_restore_drills is 'Redacted manifest/provenance for encrypted application-level backup and isolated restore verification; never store database URLs, credentials, or key material.';
comment on column public.backup_restore_drills.key_version is 'Opaque environment-secret version label; key bytes remain in the secret manager.';

alter table public.mfa_action_gates
  drop constraint if exists mfa_action_gates_action_key_check;
alter table public.mfa_action_gates
  add constraint mfa_action_gates_action_key_check
  check (action_key in (
    'apple_bridge_create', 'apple_bridge_revoke', 'gmail_test_notification',
    'connection_revoke', 'connection_scope_change', 'worker_device_register',
    'worker_device_revoke', 'digital_scan_create', 'finance_configure',
    'finance_import', 'github_sync', 'schedule_update', 'archive_read'
  ));

create or replace function public.create_mfa_action_gate(p_action_key text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate_id uuid;
begin
  if v_user_id is null or not public.is_allowed_aal2() then
    raise exception 'fresh_mfa_required';
  end if;
  if p_action_key not in (
    'apple_bridge_create', 'apple_bridge_revoke', 'gmail_test_notification',
    'connection_revoke', 'connection_scope_change', 'worker_device_register',
    'worker_device_revoke', 'digital_scan_create', 'finance_configure',
    'finance_import', 'github_sync', 'schedule_update', 'archive_read'
  ) then
    raise exception 'invalid_mfa_action';
  end if;
  if not exists (
    select 1 from public.mfa_reauthentication_events
    where user_id = v_user_id and verified_at >= now() - interval '1 minute'
  ) then
    raise exception 'fresh_mfa_required';
  end if;
  insert into public.mfa_action_gates(user_id, action_key)
  values (v_user_id, p_action_key)
  returning id into v_gate_id;
  return v_gate_id;
end;
$$;

commit;
