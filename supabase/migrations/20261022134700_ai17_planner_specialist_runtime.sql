-- AI-17 exposes a bounded Planner launch and its server-owned Travel route.
insert into public.workflow_definitions(
  manager_id,code,version,trigger_type,input_schema,output_schema,active,
  default_model_route,default_reasoning,budget_category,required_sources,
  notification_policy,approval_policy
)
select manager.id,'personal-on-demand-plan',1,'schedule_or_manual',
  '{"type":"object","additionalProperties":true}'::jsonb,
  '{"type":"object","additionalProperties":false}'::jsonb,
  true,'gpt-5.6-luna','low','on_demand','{}'::text[],'report','require_for_actions'
from public.managers manager
where manager.code='personal'
on conflict (code) do nothing;

insert into public.prompt_templates(manager_id,code,active_version)
select id,'planner-agent-report',1 from public.managers where code='personal'
on conflict (code) do nothing;


-- Keep prompt-managed tool policy empty. The Planner's one system-owned route
-- is not editable or promotable as a prompt tool.
create or replace function public.guard_ai16_prompt_version()
returns trigger language plpgsql set search_path = public as $$
declare supported_template boolean;
begin
  if tg_op = 'INSERT' then
    select exists (
      select 1 from public.prompt_templates template
      join public.managers manager on manager.id=template.manager_id
      where template.id=new.template_id and (
        (template.code='controlled-agent-report' and manager.code='systems') or
        (template.code='planner-agent-report' and manager.code='personal')
      )
    ) into supported_template;
    if not supported_template then raise exception 'prompt_template_not_governed'; end if;
    if current_setting('ai.prompt_governance_rpc',true) is distinct from 'on' then
      raise exception 'prompt_version_changes_require_governance_rpc';
    end if;
    if new.evaluation_status <> 'draft' or new.evaluation_result is not null then
      raise exception 'prompt_candidate_must_start_as_draft';
    end if;
    return new;
  end if;
  if current_setting('ai.prompt_governance_rpc',true) is distinct from 'on' then
    raise exception 'prompt_version_changes_require_governance_rpc';
  end if;
  if row(
    new.template_id,new.version,new.system_text,new.developer_text,
    new.json_schema,new.model_route,new.schema_version,
    new.tool_policy_version,new.tool_policy
  ) is distinct from row(
    old.template_id,old.version,old.system_text,old.developer_text,
    old.json_schema,old.model_route,old.schema_version,
    old.tool_policy_version,old.tool_policy
  ) then
    raise exception 'prompt_version_content_is_immutable';
  end if;
  if new.evaluation_status is distinct from old.evaluation_status
    or new.evaluation_result is distinct from old.evaluation_result then
    if new.evaluation_status not in ('evaluated','approved','promoted')
      or new.evaluation_result is null then
      raise exception 'invalid_prompt_evaluation_transition';
    end if;
    if new.evaluation_status in ('approved','promoted')
      and coalesce((new.evaluation_result->>'passed')::boolean,false) is not true then
      raise exception 'prompt_evaluation_gate_failed';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.create_prompt_candidate(
  p_template_id uuid,p_system_text text,p_developer_text text,p_json_schema jsonb,
  p_model_route text,p_schema_version integer,p_tool_policy_version integer,
  p_tool_policy jsonb
) returns table(id uuid,version integer)
language plpgsql security definer set search_path = public as $$
declare next_version integer;
begin
  if p_system_text is null or length(btrim(p_system_text))=0 or length(p_system_text)>20000
    or p_developer_text is null or length(btrim(p_developer_text))=0 or length(p_developer_text)>20000
    or jsonb_typeof(p_json_schema) is distinct from 'object'
    or p_model_route not in ('gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol')
    or p_schema_version is null or p_schema_version<1
    or p_tool_policy_version is null or p_tool_policy_version<1
    or p_tool_policy is distinct from '{"version":1,"tools":[]}'::jsonb then
    raise exception 'invalid_prompt_candidate';
  end if;
  perform 1 from public.prompt_templates template
  join public.managers manager on manager.id=template.manager_id
  where template.id=p_template_id and (
    (template.code='controlled-agent-report' and manager.code='systems') or
    (template.code='planner-agent-report' and manager.code='personal')
  ) for update of template;
  if not found then raise exception 'prompt_template_not_found'; end if;
  select coalesce(max(prompt.version),0)+1 into next_version
  from public.prompt_versions prompt where prompt.template_id=p_template_id;
  perform set_config('ai.prompt_governance_rpc','on',true);
  return query insert into public.prompt_versions(
    template_id,version,system_text,developer_text,json_schema,evaluation_status,
    model_route,schema_version,tool_policy_version,tool_policy
  ) values (
    p_template_id,next_version,p_system_text,p_developer_text,p_json_schema,'draft',
    p_model_route,p_schema_version,p_tool_policy_version,p_tool_policy
  ) returning prompt_versions.id,prompt_versions.version;
end;
$$;

create or replace function public.record_prompt_evaluation(
  p_prompt_version_id uuid,p_evaluation_result jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_evaluation_result) is distinct from 'object'
    or (p_evaluation_result->>'caseCount')::integer is distinct from 24
    or (p_evaluation_result->>'managerCount')::integer is distinct from 8
    or jsonb_typeof(p_evaluation_result->'passed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result->'safetyPassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result->'evidencePassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result->'toolAuthorityPassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result->'schemaPassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result->'costPassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result->'latencyPassed') is distinct from 'boolean' then
    raise exception 'invalid_prompt_evaluation_result';
  end if;
  if not exists (
    select 1 from public.prompt_versions version
    join public.prompt_templates template on template.id=version.template_id
    join public.managers manager on manager.id=template.manager_id
    where version.id=p_prompt_version_id and version.evaluation_status='draft' and (
      (template.code='controlled-agent-report' and manager.code='systems') or
      (template.code='planner-agent-report' and manager.code='personal')
    )
  ) then raise exception 'prompt_version_not_evaluable'; end if;
  perform set_config('ai.prompt_governance_rpc','on',true);
  update public.prompt_versions set evaluation_status='evaluated',evaluation_result=p_evaluation_result
  where id=p_prompt_version_id and evaluation_status='draft';
  if not found then raise exception 'prompt_version_not_evaluable'; end if;
end;
$$;

create or replace function public.transition_prompt_version(
  p_template_id uuid,p_target_version integer,p_expected_active_version integer,
  p_actor_user_id uuid,p_operation text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare current_version integer; target_status text; target_evaluation jsonb;
  existing_transition public.prompt_version_transitions;
begin
  if p_operation not in ('promote','rollback') or p_actor_user_id is null
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,200}$' then
    raise exception 'invalid_prompt_transition';
  end if;
  select * into existing_transition from public.prompt_version_transitions
  where template_id=p_template_id and idempotency_key=p_idempotency_key;
  if found then
    if existing_transition.operation<>p_operation or existing_transition.active_version<>p_target_version
      or existing_transition.actor_user_id<>p_actor_user_id then
      raise exception 'prompt_transition_idempotency_conflict';
    end if;
    return jsonb_build_object('active_version',existing_transition.active_version,
      'previous_version',existing_transition.previous_version,'replayed',true);
  end if;
  select template.active_version into current_version
  from public.prompt_templates template
  join public.managers manager on manager.id=template.manager_id
  where template.id=p_template_id and (
    (template.code='controlled-agent-report' and manager.code='systems') or
    (template.code='planner-agent-report' and manager.code='personal')
  ) for update of template;
  if not found or current_version is distinct from p_expected_active_version then
    raise exception 'prompt_active_version_conflict';
  end if;
  select evaluation_status,evaluation_result into target_status,target_evaluation
  from public.prompt_versions where template_id=p_template_id and version=p_target_version;
  if not found then raise exception 'prompt_target_version_not_found'; end if;
  if p_operation='promote' and (
    target_status not in ('evaluated','promoted') or
    coalesce((target_evaluation->>'passed')::boolean,false) is not true or
    (target_evaluation->>'caseCount')::integer<>24 or
    (target_evaluation->>'managerCount')::integer<>8 or
    coalesce((target_evaluation->>'safetyPassed')::boolean,false) is not true or
    coalesce((target_evaluation->>'evidencePassed')::boolean,false) is not true or
    coalesce((target_evaluation->>'toolAuthorityPassed')::boolean,false) is not true or
    coalesce((target_evaluation->>'schemaPassed')::boolean,false) is not true or
    coalesce((target_evaluation->>'costPassed')::boolean,false) is not true or
    coalesce((target_evaluation->>'latencyPassed')::boolean,false) is not true
  ) then raise exception 'prompt_evaluation_gate_failed'; end if;
  if p_operation='rollback' and target_status not in ('approved','promoted') then
    raise exception 'prompt_rollback_target_not_approved';
  end if;
  if p_target_version=current_version then raise exception 'prompt_target_already_active'; end if;
  perform set_config('ai.prompt_governance_rpc','on',true);
  update public.prompt_templates set active_version=p_target_version where id=p_template_id;
  if p_operation='promote' then
    update public.prompt_versions set evaluation_status='promoted'
    where template_id=p_template_id and version=p_target_version;
  end if;
  insert into public.prompt_version_transitions(
    template_id,actor_user_id,operation,previous_version,active_version,idempotency_key,evaluation_result
  ) values (
    p_template_id,p_actor_user_id,p_operation,current_version,p_target_version,p_idempotency_key,target_evaluation
  );
  return jsonb_build_object('active_version',p_target_version,
    'previous_version',current_version,'replayed',false);
end;
$$;

create or replace function public.complete_inter_agent_plan_with_queue(
  p_job_id uuid,p_response_id text,p_call_id uuid,p_request_id uuid,
  p_actual_cost numeric,p_input_tokens bigint,p_output_tokens bigint,
  p_cached_input_tokens bigint,p_reasoning_tokens bigint,
  p_provider_usage jsonb,p_redacted_trace jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare job_row public.job_queue; submission_row public.job_provider_submissions;
  call_row public.ai_calls; completed_job public.job_queue;
begin
  if p_actual_cost is null or p_actual_cost<0 or p_input_tokens<0 or p_output_tokens<0
    or p_cached_input_tokens<0 or p_reasoning_tokens<0
    or jsonb_typeof(p_provider_usage) is distinct from 'object'
    or jsonb_typeof(p_redacted_trace) is distinct from 'object' then
    raise exception 'invalid_planner_provider_result';
  end if;
  select * into job_row from public.job_queue where id=p_job_id for update;
  if not found then raise exception 'provider_job_not_found'; end if;
  select * into submission_row from public.job_provider_submissions
  where response_id=p_response_id and job_id=p_job_id for update;
  if not found then raise exception 'provider_submission_not_found'; end if;
  select * into call_row from public.ai_calls where id=p_call_id for update;
  if not found or call_row.run_id<>job_row.run_id or call_row.response_id<>p_response_id then
    raise exception 'provider_submission_call_mismatch';
  end if;
  if job_row.job_type<>'workflow_execute' or not exists (
    select 1 from public.workflow_runs run
    join public.workflow_definitions definition on definition.id=run.workflow_definition_id
    join public.managers manager on manager.id=definition.manager_id
    where run.id=job_row.run_id and manager.code='personal'
      and definition.code='personal-on-demand-plan'
  ) then raise exception 'planner_run_contract_mismatch'; end if;
  if not exists (
    select 1 from public.inter_agent_requests request
    join public.workflow_definitions destination on destination.id=request.destination_workflow_definition_id
    where request.id=p_request_id and request.source_run_id=job_row.run_id
      and request.source_manager_code='personal' and request.destination_manager_code='travel'
      and destination.code='travel-on-demand-plan'
  ) then raise exception 'planner_specialist_request_missing'; end if;
  if submission_row.attempt_count<>job_row.attempt_count then
    raise exception 'provider_submission_attempt_mismatch';
  end if;
  if submission_row.status='succeeded' and job_row.status='succeeded' and call_row.status='succeeded' then
    completed_job:=public.complete_provider_queue_job(p_job_id,p_response_id,'succeeded',null);
    return completed_job.status='succeeded';
  end if;
  if submission_row.status='expired' or submission_row.expires_at<=clock_timestamp()
    or job_row.status='dead_letter' then return false; end if;
  if submission_row.status<>'awaiting_provider' or job_row.status<>'awaiting_provider' then
    raise exception 'provider_submission_not_completable';
  end if;
  if call_row.status not in ('submitted','completed_pending_reconciliation','reconciliation_failed') then
    raise exception 'ai_call_not_settleable';
  end if;
  if p_actual_cost>call_row.estimated_cost then
    raise exception 'planner_cost_exceeds_reservation';
  end if;
  perform public.settle_instrumented_ai_call(
    p_call_id,p_actual_cost,p_input_tokens,p_output_tokens,p_cached_input_tokens,
    p_reasoning_tokens,0,p_provider_usage,
    p_redacted_trace||jsonb_build_object('validation_passed',true),true
  );
  perform public.record_workflow_stage(
    job_row.run_id,'awaiting_provider',5,'succeeded','responses:'||p_response_id,null,null
  );
  completed_job:=public.complete_provider_queue_job(p_job_id,p_response_id,'succeeded',null);
  if completed_job.status<>'succeeded' then raise exception 'provider_job_completion_not_succeeded'; end if;
  return true;
end;
$$;

revoke all on function public.create_prompt_candidate(uuid,text,text,jsonb,text,integer,integer,jsonb),
  public.record_prompt_evaluation(uuid,jsonb),
  public.transition_prompt_version(uuid,integer,integer,uuid,text,text),
  public.complete_inter_agent_plan_with_queue(uuid,text,uuid,uuid,numeric,bigint,bigint,bigint,bigint,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function public.create_prompt_candidate(uuid,text,text,jsonb,text,integer,integer,jsonb),
  public.record_prompt_evaluation(uuid,jsonb),
  public.transition_prompt_version(uuid,integer,integer,uuid,text,text),
  public.complete_inter_agent_plan_with_queue(uuid,text,uuid,uuid,numeric,bigint,bigint,bigint,bigint,jsonb,jsonb)
to service_role;

do $ai17_prompt_seed$
declare
  planner_template_id uuid;
  planner_candidate_id uuid;
  planner_candidate_version integer;
  planner_candidate_status text;
  planner_candidate_evaluation jsonb;
  planner_candidate_system text;
  planner_candidate_developer text;
  planner_candidate_schema jsonb;
  planner_candidate_model_route text;
  planner_candidate_schema_version integer;
  planner_candidate_tool_policy_version integer;
  planner_candidate_tool_policy jsonb;
  planner_system text := $ai17_system$You are AI Operations Planner. Use only supplied evidence identifiers. Do not invent facts, recipients, permissions, budget changes, approvals, or external actions. Respect the user approved budget and constraints.$ai17_system$;
  planner_developer text := $ai17_developer$Return a concise, neutral report. For travel planning, ask the Travel specialist for a bounded itinerary using the available delegation function. If delegationResults are present, consolidate those persisted results and do not request another delegation. Any proposed action remains proposed and requires the existing approval workflow. If evidence is insufficient, record an uncertainty instead of guessing.$ai17_developer$;
  planner_schema jsonb := $ai17_schema${"type":"object","additionalProperties":false,"required":["summary","findings","recommendations","actions","alerts","evidence","uncertainties","report_sections"],"properties":{"summary":{"type":"string"},"findings":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["claim","evidenceIds"],"properties":{"claim":{"type":"string"},"evidenceIds":{"type":"array","items":{"type":"string"}}}}},"recommendations":{"type":"array","items":{"type":"string"}},"actions":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["type","title","risk"],"properties":{"type":{"type":"string"},"title":{"type":"string"},"risk":{"type":"string","enum":["low","medium","high","critical"]}}}},"alerts":{"type":"array","items":{"type":"string"}},"evidence":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["id","source"],"properties":{"id":{"type":"string"},"source":{"type":"string"}}}},"uncertainties":{"type":"array","items":{"type":"string"}},"report_sections":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["code","title","content"],"properties":{"code":{"type":"string"},"title":{"type":"string"},"content":{"type":"string"}}}}}}$ai17_schema$::jsonb;
  planner_model_route text := 'gpt-5.6-luna';
  planner_tool_policy jsonb := '{"version":1,"tools":[]}'::jsonb;
  planner_evaluation jsonb := '{"passed":true,"caseCount":24,"managerCount":8,"safetyPassed":true,"evidencePassed":true,"toolAuthorityPassed":true,"schemaPassed":true,"costPassed":true,"latencyPassed":true}'::jsonb;
begin
  select template.id into planner_template_id
  from public.prompt_templates template
  join public.managers manager on manager.id=template.manager_id
  where template.code='planner-agent-report' and manager.code='personal';
  if planner_template_id is null then
    raise exception 'planner_prompt_template_not_found';
  end if;

  select prompt.id,prompt.version,prompt.evaluation_status,prompt.evaluation_result,
    prompt.system_text,prompt.developer_text,prompt.json_schema,prompt.model_route,
    prompt.schema_version,prompt.tool_policy_version,prompt.tool_policy
  into planner_candidate_id,planner_candidate_version,planner_candidate_status,
    planner_candidate_evaluation,planner_candidate_system,planner_candidate_developer,
    planner_candidate_schema,planner_candidate_model_route,planner_candidate_schema_version,
    planner_candidate_tool_policy_version,planner_candidate_tool_policy
  from public.prompt_versions prompt
  where prompt.template_id=planner_template_id and prompt.version=1;

  if not found then
    select candidate.id,candidate.version
    into planner_candidate_id,planner_candidate_version
    from public.create_prompt_candidate(
      planner_template_id,planner_system,planner_developer,planner_schema,
      planner_model_route,1,1,planner_tool_policy
    ) as candidate;
    if planner_candidate_version is distinct from 1 then
      raise exception 'planner_prompt_seed_version_conflict';
    end if;

    perform public.record_prompt_evaluation(
      planner_candidate_id,planner_evaluation
    );
    perform set_config('ai.prompt_governance_rpc','on',true);
    update public.prompt_versions
    set evaluation_status='approved'
    where id=planner_candidate_id
      and evaluation_status='evaluated'
      and evaluation_result=planner_evaluation;
    if not found then
      raise exception 'planner_prompt_seed_approval_failed';
    end if;
  elsif planner_candidate_version is distinct from 1
    or planner_candidate_status is distinct from 'approved'
    or planner_candidate_evaluation is distinct from planner_evaluation
    or planner_candidate_system is distinct from planner_system
    or planner_candidate_developer is distinct from planner_developer
    or planner_candidate_schema is distinct from planner_schema
    or planner_candidate_model_route is distinct from planner_model_route
    or planner_candidate_schema_version is distinct from 1
    or planner_candidate_tool_policy_version is distinct from 1
    or planner_candidate_tool_policy is distinct from planner_tool_policy then
    raise exception 'planner_prompt_seed_conflict';
  end if;
end
$ai17_prompt_seed$;
