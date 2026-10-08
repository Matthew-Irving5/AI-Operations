-- SECURITY DEFINER routines must never inherit PostgREST EXECUTE access from
-- PUBLIC. Revoke every API-role grant first, then restore only the callers
-- recorded in docs/security/rpc-execution-matrix.md.
do $$
declare
  routine record;
begin
  for routine in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated, service_role',
      routine.signature
    );
  end loop;
end;
$$;

-- Future public-schema functions must opt in to EXECUTE explicitly. The SQL
-- regression below catches any new SECURITY DEFINER function missing from the
-- caller matrix even if it is created under a role with different defaults.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Internal Edge Function and scheduler entry points. User-facing requests
-- reach these only through the authenticated/secret-checked server routes.
grant execute on function
  public.claim_job_queue(text, integer),
  public.dispatch_due_schedules(timestamptz),
  public.complete_job_queue(uuid, text, boolean, text),
  public.create_on_demand_run(uuid, uuid, text, numeric, text, integer, text),
  public.decide_approval(uuid, uuid, public.approval_decision, text),
  public.execute_systems_workflow(uuid),
  public.cancel_queued_run(uuid, uuid),
  public.claim_notification_delivery(text, integer),
  public.complete_notification_delivery(uuid, text, text, text),
  public.execute_personal_workflow(uuid),
  public.execute_health_finance_workflow(uuid),
  public.execute_career_travel_procurement_workflow(uuid),
  public.production_onboarding_complete(uuid),
  public.create_on_demand_run_request(uuid, uuid, text, numeric, text, integer, text, jsonb),
  public.consume_edge_request_quota(uuid, text, integer),
  public.complete_deterministic_workflow_run(uuid),
  public.reserve_instrumented_ai_call(uuid, uuid, uuid, uuid, numeric, text, jsonb),
  public.settle_instrumented_ai_call(uuid, numeric, bigint, bigint, bigint, bigint, integer, jsonb, jsonb, boolean),
  public.mark_instrumented_ai_call_submitted(uuid, text),
  public.calculate_instrumented_ai_cost(uuid, bigint, bigint, bigint, integer),
  public.execute_digital_estate_workflow(uuid),
  public.record_instrumented_ai_reconciliation_failure(uuid, text, jsonb),
  public.update_onboarding_checklist_item(uuid, text, timestamptz, jsonb),
  public.promote_mobile_health_snapshot_internal(uuid),
  public.promote_mobile_health_snapshot(text, uuid),
  public.record_source_freshness(uuid, text, timestamptz, timestamptz, interval, text, text, jsonb)
to service_role;

-- The caller JWT is required for AAL2 checks, one-time MFA gates, and the
-- user-bound connection/device mutations delegated to their Edge Functions.
grant execute on function
  public.is_allowed_aal2(),
  public.consume_mfa_action_gate(uuid, text),
  public.create_apple_bridge_device_from_mfa_gate(uuid, text, text[], text, text),
  public.revoke_apple_bridge_device(uuid, uuid),
  public.update_google_source_selection(uuid, text[], text[], uuid),
  public.create_worker_device_from_mfa_gate(uuid, text, text, text, timestamptz),
  public.revoke_worker_device_from_mfa_gate(uuid, uuid),
  public.create_mfa_action_gate(text)
to authenticated;

-- These four RPCs authenticate a device using a hashed bearer token inside the
-- function. The anon API key exposes the transport only; the token decides the
-- device and user. Keep the existing authenticated client compatibility too.
grant execute on function
  public.ingest_apple_bridge_snapshot(text, text, text, jsonb, jsonb),
  public.ingest_mobile_snapshot(text, integer, uuid, uuid, text, text, timestamptz, text, jsonb, jsonb),
  public.adapt_mobile_snapshot(text, uuid)
to anon, authenticated;

grant execute on function
  public.promote_mobile_health_snapshot(text, uuid)
to anon;
