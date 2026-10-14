export const AI15_WORKFLOW_RUN_SELECT =
  "id,user_id,workflow_definition_id,status,trigger,correlation_id,idempotency_key,priority,requested_at,started_at,completed_at,cancelled_at,error_code,redacted_error,budget_reservation_id,workflow_definitions!inner(id,code,version,manager_id,managers!inner(code),trigger_type,input_schema,output_schema,active)";
