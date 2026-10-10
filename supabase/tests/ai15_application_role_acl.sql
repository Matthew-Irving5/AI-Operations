BEGIN;
SELECT plan(6);

SELECT ok(
  NOT has_table_privilege('service_role','public.run_steps','SELECT')
  AND NOT has_table_privilege('service_role','public.run_steps','INSERT')
  AND NOT has_table_privilege('service_role','public.run_steps','UPDATE')
  AND NOT has_table_privilege('service_role','public.run_steps','DELETE')
  AND has_table_privilege('service_role','public.run_steps','REFERENCES')
  AND has_table_privilege('service_role','public.run_steps','TRIGGER')
  AND has_table_privilege('service_role','public.run_steps','TRUNCATE'),
  'run-step DML stays behind the stage RPC while staged non-DML ACLs remain'
);
SELECT ok(
  has_table_privilege('service_role','public.workflow_definitions','SELECT')
  AND NOT has_table_privilege('service_role','public.workflow_definitions','INSERT')
  AND NOT has_table_privilege('service_role','public.workflow_definitions','UPDATE')
  AND NOT has_table_privilege('service_role','public.workflow_definitions','DELETE')
  AND has_table_privilege('service_role','public.workflow_definitions','REFERENCES')
  AND has_table_privilege('service_role','public.workflow_definitions','TRIGGER')
  AND has_table_privilege('service_role','public.workflow_definitions','TRUNCATE'),
  'workflow definitions expose read access only to service_role'
);
SELECT ok(
  has_table_privilege('service_role','public.workflow_runs','SELECT')
  AND has_table_privilege('service_role','public.workflow_runs','UPDATE')
  AND NOT has_table_privilege('service_role','public.workflow_runs','INSERT')
  AND NOT has_table_privilege('service_role','public.workflow_runs','DELETE')
  AND has_table_privilege('service_role','public.workflow_runs','REFERENCES')
  AND has_table_privilege('service_role','public.workflow_runs','TRIGGER')
  AND has_table_privilege('service_role','public.workflow_runs','TRUNCATE'),
  'workflow run reads and queue-owned updates retain the staged ACL contract'
);
SELECT ok(
  has_table_privilege('service_role','public.notifications','SELECT')
  AND has_table_privilege('service_role','public.notifications','INSERT')
  AND has_table_privilege('service_role','public.notifications','UPDATE')
  AND NOT has_table_privilege('service_role','public.notifications','DELETE')
  AND has_table_privilege('service_role','public.notifications','REFERENCES')
  AND has_table_privilege('service_role','public.notifications','TRIGGER')
  AND has_table_privilege('service_role','public.notifications','TRUNCATE'),
  'notification test retains select/insert/update without delete access'
);
SELECT ok(
  has_table_privilege('service_role','public.model_pricing','SELECT')
  AND NOT has_table_privilege('service_role','public.model_pricing','INSERT')
  AND NOT has_table_privilege('service_role','public.model_pricing','UPDATE')
  AND NOT has_table_privilege('service_role','public.model_pricing','DELETE')
  AND NOT has_table_privilege('service_role','public.model_pricing','TRUNCATE')
  AND NOT has_table_privilege('service_role','public.model_pricing','REFERENCES')
  AND NOT has_table_privilege('service_role','public.model_pricing','TRIGGER'),
  'executor has SELECT-only access to model pricing'
);
SELECT ok(
  (SELECT count(*) = 6 AND bool_and(
    p.prosecdef AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  )
   FROM (VALUES
     (to_regprocedure('public.create_on_demand_run_request(uuid,uuid,text,numeric,text,integer,text,jsonb)')::oid),
     (to_regprocedure('public.record_workflow_stage(uuid,text,integer,text,text,text,text)')::oid),
     (to_regprocedure('public.complete_deterministic_workflow_run(uuid)')::oid),
     (to_regprocedure('public.complete_job_queue(uuid,text,text,text)')::oid),
     (to_regprocedure('public.complete_provider_queue_job(uuid,text,text,text)')::oid),
     (to_regprocedure('public.commit_instrumented_ai_report_with_queue(uuid,text,uuid,text,text,text,text,text,jsonb,jsonb,jsonb,numeric,bigint,bigint,bigint,bigint,jsonb,jsonb)')::oid)
   ) expected(oid)
   JOIN pg_proc p ON p.oid = expected.oid),
  'stage, queue, and report writes remain on service-role SECURITY DEFINER RPCs'
);

SELECT * FROM finish();
ROLLBACK;
