-- Service-only tables still need an explicit RLS policy so the Data API
-- advisor and future migrations can distinguish intentional denial from an
-- unfinished access contract. Keep access through the existing RPC/Edge
-- Function boundaries; never grant browser roles direct table access here.

-- Supabase's bootstrap default ACL grants every public table to anon. The
-- application has no anonymous table/view path; anonymous callers use only
-- explicitly granted, token-validated RPC/Edge Function boundaries.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

-- Application migrations create future public objects as postgres. Supabase's
-- supabase_admin defaults are provider-managed; current objects created under
-- that owner are still covered by the table and sequence revokes above.
-- Authenticated requests use the signed-in user's SSR JWT only for the explicit
-- read projection below. Writes go through the existing authenticated RPCs or
-- service-role Edge Functions; the sole direct insert records a fresh MFA event.
revoke all privileges on all tables in schema public from authenticated;
revoke all privileges on all sequences in schema public from authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated;

grant select on table
  public.reports,
  public.feedback_categories,
  public.approvals,
  public.actions,
  public.trace_events,
  public.feedback,
  public.workflow_schedules,
  public.workflow_definitions,
  public.spend_forecasts,
  public.ai_calls,
  public.workflow_runs,
  public.job_queue,
  public.data_freshness,
  public.calendar_events,
  public.reminders,
  public.routines,
  public.connections,
  public.apple_bridge_devices,
  public.health_daily_summaries,
  public.health_imports,
  public.health_samples,
  public.health_rejected_records,
  public.finance_close_periods,
  public.finance_transactions,
  public.finance_accounts,
  public.finance_categories,
  public.finance_sheet_adapters,
  public.finance_statements,
  public.career_github_evidence,
  public.research_sources,
  public.on_demand_research_runs,
  public.travel_watches,
  public.digital_scans,
  public.onboarding_checklist_items,
  public.production_acceptances,
  public.personal_profiles,
  public.personal_locations,
  public.time_preferences,
  public.managers
to authenticated;
grant insert on table public.mfa_reauthentication_events to authenticated;
grant select (
  id, user_id, label, public_key_b64, pairing_expires_at, paired_at,
  revoked_at, last_heartbeat_at, state, created_at
) on table public.worker_devices to authenticated;

revoke all privileges on table
  public.mfa_action_gates,
  public.prompt_templates,
  public.prompt_versions,
  public.mobile_snapshots,
  public.mobile_snapshot_sources,
  public.mobile_ingestion_records,
  public.mobile_ingestion_attachments,
  public.mobile_record_adaptations,
  public.mobile_typed_deduplication_keys
from anon, authenticated;

create policy deny_data_api_clients
  on public.mfa_action_gates
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_data_api_clients
  on public.prompt_templates
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_data_api_clients
  on public.prompt_versions
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_data_api_clients
  on public.mobile_snapshots
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_data_api_clients
  on public.mobile_snapshot_sources
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_data_api_clients
  on public.mobile_ingestion_records
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_data_api_clients
  on public.mobile_ingestion_attachments
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_data_api_clients
  on public.mobile_record_adaptations
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_data_api_clients
  on public.mobile_typed_deduplication_keys
  as restrictive for all to anon, authenticated
  using (false) with check (false);

comment on table public.mfa_action_gates is
  'Confidential authentication-control state. Direct anon/authenticated Data API access is revoked; issue-scoped SECURITY DEFINER RPCs own gate creation and consumption.';
comment on table public.prompt_templates is
  'Confidential prompt configuration. Direct anon/authenticated Data API access is revoked; the trusted AI execution Edge Function reads through service_role.';
comment on table public.prompt_versions is
  'Confidential prompt content and schemas. Direct anon/authenticated Data API access is revoked; the trusted AI execution Edge Function reads through service_role.';
comment on table public.mobile_snapshots is
  'Highly sensitive mobile-ingestion metadata. Direct anon/authenticated Data API access is revoked; machine ingestion and adaptation use the existing RPC/Edge Function boundaries.';
comment on table public.mobile_snapshot_sources is
  'Highly sensitive mobile-source provenance. Direct anon/authenticated Data API access is revoked; machine ingestion and adaptation use the existing RPC/Edge Function boundaries.';
comment on table public.mobile_ingestion_records is
  'Highly sensitive raw and normalized mobile input. Direct anon/authenticated Data API access is revoked; machine ingestion and adaptation use the existing RPC/Edge Function boundaries.';
comment on table public.mobile_ingestion_attachments is
  'Highly sensitive mobile attachment metadata. Direct anon/authenticated Data API access is revoked; machine ingestion uses the existing RPC/Edge Function boundaries.';
comment on table public.mobile_record_adaptations is
  'Internal mobile adapter provenance. Direct anon/authenticated Data API access is revoked; trusted adapter functions own writes.';
comment on table public.mobile_typed_deduplication_keys is
  'Highly sensitive mobile-ingestion linkage keys. Direct anon/authenticated Data API access is revoked; trusted adapter functions own reads and writes.';
