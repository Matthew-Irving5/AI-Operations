-- Local Supabase bootstrap ACLs differ from hosted staging. Apply after all
-- migrations to make local application-role grants match the staged catalog.
-- This seed-only normalization does not change deployable permissions.
DO $baseline$
BEGIN
  EXECUTE $sql$
REVOKE INSERT, SELECT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM service_role
  $sql$;
  EXECUTE $sql$
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, SELECT, UPDATE, DELETE ON TABLES FROM service_role
  $sql$;
  EXECUTE $sql$
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM service_role
  $sql$;
  EXECUTE $sql$
GRANT DELETE ON TABLE
    public.attention_items, public.connection_credentials, public.conversation_attachments, public.conversation_entity_links, public.conversation_handoff_events, public.conversation_handoffs,
    public.conversation_messages, public.conversation_participants, public.conversations, public.evidence_links, public.evidence_references, public.execution_receipts,
    public.execution_requests, public.inter_agent_replies, public.inter_agent_requests, public.location_preparation_rules, public.location_travel_rules, public.manager_capabilities,
    public.personal_locations
  TO service_role
  $sql$;
  EXECUTE $sql$
GRANT INSERT ON TABLE
    public.actions, public.attention_items, public.audit_events, public.calendar_events, public.career_github_evidence, public.commitments,
    public.connection_credentials, public.connections, public.conversation_attachments, public.conversation_entity_links, public.conversation_handoff_events, public.conversation_handoffs,
    public.conversation_messages, public.conversation_participants, public.conversations, public.digital_inventory_items, public.digital_scans, public.evidence_links,
    public.evidence_references, public.execution_receipts, public.execution_requests, public.finance_accounts, public.finance_categories, public.finance_close_periods,
    public.finance_sheet_adapters, public.finance_statements, public.finance_transactions, public.google_drive_files, public.google_messages, public.google_sync_requests,
    public.integration_cursors, public.inter_agent_replies, public.inter_agent_requests, public.location_preparation_rules, public.location_travel_rules, public.manager_capabilities,
    public.notifications, public.oauth_states, public.onboarding_checklist_items, public.personal_locations, public.personal_profiles, public.report_sections,
    public.reports, public.routines, public.source_objects, public.time_preferences, public.trace_events, public.webhook_events,
    public.worker_devices, public.worker_heartbeats
  TO service_role
  $sql$;
  EXECUTE $sql$
GRANT SELECT ON TABLE
    public.ai_calls, public.ai_model_catalog, public.app_users, public.attention_items, public.audit_events, public.calendar_events,
    public.career_github_evidence, public.commitments, public.connection_credentials, public.connections, public.conversation_attachments, public.conversation_entity_links,
    public.conversation_handoff_events, public.conversation_handoffs, public.conversation_messages, public.conversation_participants, public.conversations, public.digital_inventory_items,
    public.digital_plans, public.digital_scans, public.evidence_links, public.evidence_references, public.execution_receipts, public.execution_requests,
    public.finance_accounts, public.finance_categories, public.finance_close_periods, public.finance_sheet_adapters, public.finance_statements, public.finance_transactions,
    public.google_drive_files, public.google_messages, public.google_sync_requests, public.integration_cursors, public.inter_agent_replies, public.inter_agent_requests,
    public.job_queue, public.location_preparation_rules, public.location_travel_rules, public.manager_capabilities, public.model_pricing, public.notifications, public.oauth_states,
    public.onboarding_checklist_items, public.personal_locations, public.personal_profiles, public.prompt_templates, public.prompt_versions, public.routines,
    public.source_objects, public.time_preferences, public.webhook_events, public.worker_action_manifests, public.worker_devices, public.worker_heartbeats,
    public.workflow_definitions, public.workflow_runs
  TO service_role
  $sql$;
  EXECUTE $sql$
GRANT UPDATE ON TABLE
    public.ai_calls, public.attention_items, public.audit_events, public.calendar_events, public.career_github_evidence, public.commitments,
    public.connection_credentials, public.connections, public.conversation_attachments, public.conversation_entity_links, public.conversation_handoff_events, public.conversation_handoffs,
    public.conversation_messages, public.conversation_participants, public.conversations, public.digital_inventory_items, public.digital_plans, public.digital_scans,
    public.evidence_links, public.evidence_references, public.execution_receipts, public.execution_requests, public.finance_accounts, public.finance_categories,
    public.finance_close_periods, public.finance_sheet_adapters, public.finance_statements, public.finance_transactions, public.google_drive_files, public.google_messages,
    public.google_sync_requests, public.integration_cursors, public.inter_agent_replies, public.inter_agent_requests, public.job_queue, public.location_preparation_rules,
    public.location_travel_rules, public.manager_capabilities, public.notifications, public.oauth_states, public.onboarding_checklist_items, public.personal_locations,
    public.personal_profiles, public.routines, public.time_preferences, public.webhook_events, public.worker_action_manifests, public.worker_devices,
    public.worker_heartbeats, public.workflow_runs
  TO service_role
  $sql$;
  EXECUTE $sql$
GRANT SELECT (approval_state, conversation_id, created_at, description, id, status, title, user_id)
  ON TABLE public.actions TO service_role
  $sql$;
  EXECUTE $sql$
GRANT SELECT (code, id)
  ON TABLE public.managers TO service_role
  $sql$;
  EXECUTE $sql$
GRANT SELECT (categories, created_at, id, positive, user_id)
  ON TABLE public.feedback TO service_role
  $sql$;
  EXECUTE $sql$
GRANT SELECT (expires_at, hard_cap, id, model_ceiling, reserved_amount, run_id, search_ceiling, status)
  ON TABLE public.on_demand_budgets TO service_role
  $sql$;
  EXECUTE $sql$
GRANT SELECT (id, run_id, structured_metrics)
  ON TABLE public.reports TO service_role
  $sql$;
  EXECUTE $sql$
REVOKE EXECUTE ON FUNCTION public.mobile_adapter_validation_issues(text, text, jsonb) FROM service_role
  $sql$;
  EXECUTE $sql$
REVOKE EXECUTE ON FUNCTION public.mobile_is_valid_optional_offset_timestamp(text) FROM service_role
  $sql$;
  EXECUTE $sql$
REVOKE EXECUTE ON FUNCTION public.mobile_parse_offset_timestamp(text, boolean) FROM service_role
  $sql$;
  EXECUTE $sql$
REVOKE EXECUTE ON FUNCTION public.mobile_shortcut_numeric(jsonb, text) FROM service_role
  $sql$;
  EXECUTE $sql$
REVOKE EXECUTE ON FUNCTION public.mobile_typed_deduplication_key(text, timestamp with time zone, text) FROM service_role
  $sql$;
  EXECUTE $sql$
REVOKE EXECUTE ON FUNCTION public.normalize_mobile_active_calories_alias() FROM anon, authenticated
  $sql$;
END
$baseline$;
