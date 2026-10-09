begin;
select plan(5);

create temporary table rpc_security_expected (
  signature text primary key,
  anon_allowed boolean not null,
  authenticated_allowed boolean not null,
  service_allowed boolean not null
) on commit drop;

insert into rpc_security_expected values
  ('public.is_allowed_aal2()', false, true, false),
  ('public.claim_job_queue(text,integer)', false, false, true),
  ('public.reserve_recurring_budget(uuid,uuid,numeric)', false, false, false),
  ('public.dispatch_due_schedules(timestamptz)', false, false, true),
  ('public.complete_job_queue(uuid,text,boolean,text)', false, false, true),
  -- AI-18 queue-owned submission and completion RPCs.
  ('public.complete_job_queue(uuid,text,text,text)', false, false, true),
  ('public.submit_workflow_job_response(uuid,text)', false, false, true),
  ('public.complete_provider_queue_job(uuid,text,text,text)', false, false, true),
  ('public.create_on_demand_run(uuid,uuid,text,numeric,text,integer,text)', false, false, true),
  ('public.decide_approval(uuid,uuid,public.approval_decision,text)', false, false, true),
  ('public.execute_systems_workflow(uuid)', false, false, true),
  ('public.calculate_spend_forecast(uuid,date)', false, false, false),
  ('public.cancel_queued_run(uuid,uuid)', false, false, true),
  ('public.claim_notification_delivery(text,integer)', false, false, true),
  ('public.complete_notification_delivery(uuid,text,text,text)', false, false, true),
  ('public.record_provider_usage_reconciliation(uuid,timestamptz,timestamptz,numeric,text)', false, false, false),
  ('public.add_model_pricing(uuid,uuid,timestamptz,numeric,numeric,numeric,text)', false, false, false),
  ('public.execute_personal_workflow(uuid)', false, false, true),
  ('public.execute_health_finance_workflow(uuid)', false, false, true),
  ('public.execute_career_travel_procurement_workflow(uuid)', false, false, true),
  ('public.production_onboarding_complete(uuid)', false, false, true),
  ('public.create_on_demand_run_request(uuid,uuid,text,numeric,text,integer,text,jsonb)', false, false, true),
  ('public.consume_edge_request_quota(uuid,text,integer)', false, false, true),
  ('public.complete_deterministic_workflow_run(uuid)', false, false, true),
  ('public.reserve_instrumented_ai_call(uuid,uuid,uuid,uuid,numeric,text,jsonb)', false, false, true),
  ('public.settle_instrumented_ai_call(uuid,numeric,bigint,bigint,bigint,bigint,integer,jsonb,jsonb,boolean)', false, false, true),
  ('public.mark_instrumented_ai_call_submitted(uuid,text)', false, false, true),
  ('public.calculate_instrumented_ai_cost(uuid,bigint,bigint,bigint,integer)', false, false, true),
  ('public.execute_digital_estate_workflow(uuid)', false, false, true),
  ('public.record_instrumented_ai_reconciliation_failure(uuid,text,jsonb)', false, false, true),
  ('public.commit_instrumented_ai_report(uuid,text,text,text,text,text,jsonb,jsonb,jsonb,numeric,bigint,bigint,bigint,bigint,jsonb,jsonb)', false, false, true),
  ('public.commit_instrumented_ai_report_with_queue(uuid,text,uuid,text,text,text,text,text,jsonb,jsonb,jsonb,numeric,bigint,bigint,bigint,bigint,jsonb,jsonb)', false, false, true),
  ('public.fail_instrumented_ai_provider_response(uuid,text,uuid,text,numeric,bigint,bigint,bigint,bigint,jsonb,jsonb)', false, false, true),
  ('public.record_workflow_stage(uuid,text,integer,text,text,text,text)', false, false, true),
  ('public.enforce_notification_user_recipient()', false, false, false),
  ('public.update_onboarding_checklist_item(uuid,text,timestamptz,jsonb)', false, false, true),
  ('public.create_mfa_action_gate(text)', false, true, false),
  ('public.consume_mfa_action_gate(uuid,text)', false, true, false),
  ('public.create_apple_bridge_device_from_mfa_gate(uuid,text,text[],text,text)', false, true, false),
  ('public.ingest_apple_bridge_snapshot(text,text,text,jsonb,jsonb)', true, true, false),
  ('public.ingest_mobile_snapshot(text,integer,uuid,uuid,text,text,timestamptz,text,jsonb,jsonb)', true, true, false),
  ('public.adapt_mobile_record_v1(uuid)', false, false, false),
  ('public.adapt_mobile_snapshot(text,uuid)', true, true, false),
  ('public.promote_mobile_health_snapshot_internal(uuid)', false, false, true),
  ('public.promote_mobile_health_snapshot(text,uuid)', true, false, true),
  ('public.record_source_freshness(uuid,text,timestamptz,timestamptz,interval,text,text,jsonb)', false, false, true),
  ('public.record_mobile_source_freshness()', false, false, false),
  ('public.record_legacy_apple_bridge_freshness()', false, false, false),
  ('public.revoke_apple_bridge_device(uuid,uuid)', false, true, false),
  ('public.update_google_source_selection(uuid,text[],text[],uuid)', false, true, false),
  ('public.create_worker_device_from_mfa_gate(uuid,text,text,text,timestamptz)', false, true, false),
  ('public.revoke_worker_device_from_mfa_gate(uuid,uuid)', false, true, false);

select ok(
  not exists (
    select 1 from rpc_security_expected e
    where to_regprocedure(e.signature) is null
       or not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(e.signature))
  )
  and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join rpc_security_expected e on to_regprocedure(e.signature) = p.oid
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
      and e.signature is null
  ),
  'every public SECURITY DEFINER function is present in the explicit principal matrix'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'no public SECURITY DEFINER function is executable through PUBLIC'
);

select ok(
  not exists (
    select 1
    from rpc_security_expected e
    left join pg_proc p on p.oid = to_regprocedure(e.signature)
    where coalesce(has_function_privilege('anon', p.oid, 'EXECUTE'), false) is distinct from e.anon_allowed
       or coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) is distinct from e.authenticated_allowed
       or coalesce(has_function_privilege('service_role', p.oid, 'EXECUTE'), false) is distinct from e.service_allowed
  ),
  'anon, authenticated, and service_role EXECUTE grants match the explicit matrix exactly'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'
  ),
  'every public SECURITY DEFINER function pins its search_path'
);

select ok(
  has_function_privilege('anon', 'public.ingest_mobile_snapshot(text,integer,uuid,uuid,text,text,timestamptz,text,jsonb,jsonb)', 'EXECUTE')
  and has_function_privilege('anon', 'public.adapt_mobile_snapshot(text,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.consume_mfa_action_gate(uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.complete_deterministic_workflow_run(uuid)', 'EXECUTE'),
  'token ingestion, user MFA gating, and server workflow completion retain their intended roles'
);

select * from finish();
rollback;
