-- Pass 07: retain the user-approved bounded research brief with its queued run.
create or replace function public.create_on_demand_run_request(
  p_user_id uuid, p_workflow_id uuid, p_manager_code text, p_hard_cap numeric,
  p_model_ceiling text, p_search_ceiling integer, p_idempotency_key text, p_request jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare created_run uuid;
begin
  if p_hard_cap <= 0 or p_hard_cap > 1000 then raise exception 'invalid_on_demand_cap'; end if;
  if p_search_ceiling < 0 or p_search_ceiling > 20 then raise exception 'invalid_search_ceiling'; end if;
  if jsonb_typeof(p_request) <> 'object' or length(p_request::text) > 10000 then raise exception 'invalid_request_brief'; end if;
  if not exists(select 1 from public.workflow_definitions d join public.managers m on m.id=d.manager_id where d.id=p_workflow_id and d.code like p_manager_code || '-%') then raise exception 'manager_workflow_mismatch'; end if;
  insert into public.workflow_runs(user_id, workflow_definition_id, status, trigger, priority, idempotency_key)
    values (p_user_id, p_workflow_id, 'queued', 'on_demand', 1, p_idempotency_key)
    on conflict (idempotency_key) do nothing returning id into created_run;
  if created_run is null then
    select id into created_run from public.workflow_runs where user_id=p_user_id and idempotency_key=p_idempotency_key;
    return created_run;
  end if;
  insert into public.on_demand_budgets(user_id,run_id,manager_code,hard_cap,model_ceiling,search_ceiling,expires_at)
    values (p_user_id,created_run,p_manager_code,p_hard_cap,p_model_ceiling,p_search_ceiling,now()+interval '24 hours');
  insert into public.job_queue(user_id,run_id,job_type,payload,priority,deduplication_key)
    values (p_user_id,created_run,'workflow_execute',p_request,1,'run:' || created_run);
  insert into public.trace_events(user_id,correlation_id,event_type,redacted_payload)
    select user_id,correlation_id,'on_demand_run_queued',jsonb_build_object('run_id',created_run,'manager',p_manager_code,'hard_cap',p_hard_cap,'request_keys',coalesce((select jsonb_agg(key) from jsonb_object_keys(p_request) as key),'[]'::jsonb)) from public.workflow_runs where id=created_run;
  return created_run;
end; $$;
