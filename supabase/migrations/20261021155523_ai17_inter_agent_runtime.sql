-- AI-17: persist bounded inter-agent work through the canonical run/queue path.
alter table public.inter_agent_requests
  add column destination_workflow_definition_id uuid
    references public.workflow_definitions(id),
  add column destination_run_id uuid,
  add column delegation_depth smallint,
  add column routing_path text[],
  add column resumed_at timestamptz;

alter table public.inter_agent_requests
  add constraint inter_agent_requests_destination_run_user_fk
    foreign key (destination_run_id, user_id)
    references public.workflow_runs(id, user_id),
  add constraint inter_agent_requests_destination_run_unique
    unique (destination_run_id),
  add constraint inter_agent_requests_delegation_path_check check (
    destination_run_id is null or (
      delegation_depth between 1 and 4
      and cardinality(routing_path) = delegation_depth + 1
      and routing_path[1] = source_manager_code
      and routing_path[cardinality(routing_path)] = destination_manager_code
      and array_position(routing_path, null) is null
    )
  );

create index inter_agent_requests_destination_run_idx
  on public.inter_agent_requests(destination_run_id)
  where destination_run_id is not null;
create index inter_agent_requests_source_pending_idx
  on public.inter_agent_requests(source_run_id, created_at)
  where source_run_id is not null and resumed_at is null;

-- AI-14 omitted the terminal transitions required when a specialist completes
-- work after its source run has entered waiting_for_dependency.
create or replace function public.enforce_agent_contract_transition()
returns trigger language plpgsql as $$
declare allowed boolean := false;
begin
  if new.status = old.status then return new; end if;
  if tg_table_name = 'actions' then
    allowed := (old.status,new.status) in (
      ('proposed','awaiting_approval'),('proposed','approved'),('proposed','rejected'),('proposed','cancelled'),
      ('awaiting_approval','approved'),('awaiting_approval','rejected'),('awaiting_approval','cancelled'),('awaiting_approval','expired'),
      ('approved','queued'),('approved','cancelled'),('approved','expired'),('queued','running'),('queued','failed'),('queued','cancelled'),
      ('running','waiting_for_dependency'),('running','succeeded'),('running','failed'),('running','cancelled'),
      ('waiting_for_dependency','queued'),('waiting_for_dependency','running'),('waiting_for_dependency','failed'),('waiting_for_dependency','cancelled')
    );
  elsif tg_table_name = 'conversations' then
    allowed := (old.status,new.status) in (('open','closed'),('open','archived'),('closed','open'),('closed','archived'));
  elsif tg_table_name = 'conversation_handoffs' then
    allowed := (old.status,new.status) in (('requested','accepted'),('requested','rejected'),('requested','cancelled'));
  elsif tg_table_name = 'inter_agent_requests' then
    allowed := (old.status,new.status) in (
      ('requested','accepted'),('requested','rejected'),('requested','cancelled'),('requested','failed'),
      ('accepted','running'),('accepted','waiting_for_dependency'),('accepted','cancelled'),('accepted','failed'),
      ('running','waiting_for_dependency'),('running','completed'),('running','rejected'),('running','failed'),('running','cancelled'),
      ('waiting_for_dependency','accepted'),('waiting_for_dependency','running'),('waiting_for_dependency','completed'),
      ('waiting_for_dependency','rejected'),('waiting_for_dependency','cancelled'),('waiting_for_dependency','failed')
    );
  elsif tg_table_name = 'attention_items' then
    allowed := (old.status,new.status) in (
      ('new','queued_for_planner'),('new','sent_immediately'),('new','dismissed'),('new','expired'),
      ('queued_for_planner','incorporated'),('queued_for_planner','sent_immediately'),('queued_for_planner','dismissed'),('queued_for_planner','expired'),
      ('incorporated','resolved'),('incorporated','dismissed'),('sent_immediately','resolved'),('sent_immediately','dismissed')
    );
  elsif tg_table_name = 'execution_requests' then
    allowed := (old.status,new.status) in (
      ('received','routed'),('received','failed'),('received','cancelled'),('routed','queued'),('routed','waiting_for_dependency'),('routed','failed'),('routed','cancelled'),
      ('queued','running'),('queued','waiting_for_dependency'),('queued','failed'),('queued','cancelled'),
      ('running','waiting_for_dependency'),('running','succeeded'),('running','failed'),('running','cancelled'),
      ('waiting_for_dependency','queued'),('waiting_for_dependency','running'),('waiting_for_dependency','failed'),('waiting_for_dependency','cancelled')
    );
  end if;
  if not allowed then
    raise exception 'invalid_agent_contract_transition: %.% -> %', tg_table_name, old.status, new.status;
  end if;
  return new;
end;
$$;

-- Preserve the actor in the canonical handoff event, which AI-14 left null.
create or replace function public.record_conversation_handoff_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_user_id uuid;
  audit_aal text;
begin
  insert into public.conversation_handoff_events(
    handoff_id,user_id,status,actor_manager_code,correlation_id,created_at
  ) values (
    new.id,
    new.user_id,
    new.status,
    case when new.status in ('requested','cancelled')
      then new.from_manager_code else new.to_manager_code end,
    new.correlation_id,
    clock_timestamp()
  );

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      audit_user_id := nullif(current_setting('ai19.actor_user_id', true), '')::uuid;
      audit_aal := nullif(current_setting('ai19.actor_aal', true), '');
      if audit_user_id is distinct from new.user_id or audit_aal is distinct from 'aal2' then
        raise exception 'handoff_transition_audit_context_required';
      end if;

      insert into public.audit_events(
        user_id,actor_type,action_type,target_type,target_id,aal,correlation_id,
        redacted_before,redacted_after,result
      ) values (
        audit_user_id,'user','transition_ai14_contract_handoff',
        'conversation_handoff',new.id::text,audit_aal,new.correlation_id,
        jsonb_build_object('status',old.status),
        jsonb_build_object('status',new.status),
        'success'
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.create_inter_agent_request_run(
  p_request jsonb,
  p_delegation_depth integer,
  p_routing_path text[],
  p_cost_root_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_user_id uuid;
  v_source_run_id uuid;
  v_source_message_id uuid;
  v_source_manager_code text;
  v_destination_manager_code text;
  v_destination_workflow_code text;
  v_destination_workflow_id uuid;
  v_objective text;
  v_output_contract jsonb;
  v_evidence_ids uuid[];
  v_priority smallint;
  v_deadline_at timestamptz;
  v_correlation_id uuid;
  v_idempotency_key text;
  v_conversation_id uuid;
  v_source public.workflow_runs;
  v_existing public.inter_agent_requests;
  v_parent_path text[];
  v_expected_path text[];
  v_source_payload jsonb;
  v_cost_root_run_id uuid;
  v_child_run_id uuid;
  v_capability_count integer;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or p_request->>'contractVersion' is distinct from '1'
    or p_request->>'status' is distinct from 'requested'
    or p_delegation_depth not between 1 and 4
    or p_routing_path is null or cardinality(p_routing_path) <> p_delegation_depth + 1
    or array_position(p_routing_path, null) is not null then
    raise exception 'inter_agent_request_contract_invalid';
  end if;

  begin
    v_request_id := (p_request->>'id')::uuid;
    v_user_id := (p_request->>'userId')::uuid;
    v_source_run_id := nullif(p_request->>'sourceRunId','')::uuid;
    v_source_message_id := nullif(p_request->>'sourceMessageId','')::uuid;
    v_correlation_id := (p_request->>'correlationId')::uuid;
  exception when others then
    raise exception 'inter_agent_request_identity_invalid';
  end;
  v_source_manager_code := p_request->>'sourceManagerCode';
  v_destination_manager_code := p_request->>'destinationManagerCode';
  v_destination_workflow_code := p_request->>'destinationWorkflowCode';
  v_objective := btrim(coalesce(p_request->>'objective',''));
  v_output_contract := p_request->'requiredOutputContract';
  v_idempotency_key := p_request->>'idempotencyKey';
  if v_request_id is null or v_user_id is null or v_correlation_id is null
    or v_source_manager_code is null or v_destination_manager_code is null
    or v_source_manager_code = v_destination_manager_code
    or v_destination_workflow_code is null or length(btrim(v_destination_workflow_code)) not between 1 and 120
    or length(v_objective) not between 1 and 4000
    or jsonb_typeof(v_output_contract) is distinct from 'object'
    or v_idempotency_key is null or length(v_idempotency_key) not between 1 and 200
    or (v_source_run_id is null and v_source_message_id is null) then
    raise exception 'inter_agent_request_contract_invalid';
  end if;
  if jsonb_typeof(coalesce(p_request->'contextEvidenceIds','[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_request->'contextEvidenceIds','[]'::jsonb)) > 50 then
    raise exception 'inter_agent_request_evidence_invalid';
  end if;
  begin
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into v_evidence_ids
    from jsonb_array_elements_text(coalesce(p_request->'contextEvidenceIds','[]'::jsonb)) as evidence(value);
    v_priority := coalesce((p_request->>'priority')::smallint, 2);
    v_deadline_at := nullif(p_request->>'deadlineAt','')::timestamptz;
  exception when others then
    raise exception 'inter_agent_request_contract_invalid';
  end;
  if v_priority not between 0 and 4 then
    raise exception 'inter_agent_request_priority_invalid';
  end if;

  select d.id into v_destination_workflow_id
  from public.workflow_definitions d
  join public.managers m on m.id = d.manager_id
  where d.code = v_destination_workflow_code
    and d.active
    and m.code = v_destination_manager_code
    and m.enabled;
  if not found then
    raise exception 'inter_agent_destination_workflow_unavailable';
  end if;

  if v_source_run_id is not null then
    select r.* into v_source
    from public.workflow_runs r
    where r.id = v_source_run_id and r.user_id = v_user_id
    for update;
    if not found then raise exception 'inter_agent_source_run_unavailable'; end if;
    select m.code into v_source_manager_code
    from public.workflow_definitions d
    join public.managers m on m.id = d.manager_id
    where d.id = v_source.workflow_definition_id and m.enabled;
    if not found or v_source_manager_code <> p_request->>'sourceManagerCode' then
      raise exception 'inter_agent_source_manager_mismatch';
    end if;
    if v_source_message_id is not null then
      select cm.conversation_id into v_conversation_id
      from public.conversation_messages cm
      where cm.id = v_source_message_id and cm.user_id = v_user_id;
      if not found or not exists (
        select 1 from public.conversations c
        where c.id = v_conversation_id and c.user_id = v_user_id
          and c.status = 'open' and c.current_manager_code = v_source_manager_code
      ) then raise exception 'inter_agent_source_message_unavailable'; end if;
    end if;
    v_cost_root_run_id := coalesce(v_source.cost_root_run_id, v_source.id);
    if p_cost_root_run_id is distinct from v_cost_root_run_id then
      raise exception 'inter_agent_cost_root_mismatch';
    end if;
    select q.payload into v_source_payload
    from public.job_queue q
    where q.run_id = v_source.id and q.job_type = 'workflow_execute'
    order by q.created_at desc, q.id desc
    limit 1;
    v_parent_path := array[v_source_manager_code];
    if jsonb_typeof(v_source_payload #> '{request,delegationPath}') = 'array' then
      select coalesce(array_agg(value), array[v_source_manager_code])
      into v_parent_path
      from jsonb_array_elements_text(v_source_payload #> '{request,delegationPath}') as path(value);
    end if;
    if cardinality(v_parent_path) = 0
      or v_parent_path[cardinality(v_parent_path)] <> v_source_manager_code
      or cardinality(v_parent_path) > 4
      or cardinality(v_parent_path) <> cardinality(array(select distinct unnest(v_parent_path))) then
      raise exception 'inter_agent_routing_path_invalid';
    end if;
  else
    v_cost_root_run_id := null;
    if p_cost_root_run_id is not null then raise exception 'inter_agent_cost_root_mismatch'; end if;
    if v_source_message_id is null then raise exception 'inter_agent_request_origin_missing'; end if;
    select cm.conversation_id into v_conversation_id
    from public.conversation_messages cm
    where cm.id = v_source_message_id and cm.user_id = v_user_id;
    if not found then raise exception 'inter_agent_source_message_unavailable'; end if;
    if not exists (
      select 1 from public.conversations c
      where c.id = v_conversation_id and c.user_id = v_user_id
        and c.status = 'open' and c.current_manager_code = v_source_manager_code
    ) then raise exception 'inter_agent_source_manager_mismatch'; end if;
    v_parent_path := array[v_source_manager_code];
  end if;
  v_expected_path := v_parent_path || v_destination_manager_code;
  if p_routing_path is distinct from v_expected_path
    or p_delegation_depth <> cardinality(v_expected_path) - 1
    or v_destination_manager_code = any(v_parent_path) then
    raise exception 'inter_agent_routing_path_invalid';
  end if;

  select count(*) into v_capability_count
  from public.manager_capabilities source_cap
  join public.managers source_manager on source_manager.id = source_cap.manager_id
  join public.manager_capabilities destination_cap
    on destination_cap.capability_code = 'inter_agent_requests'
  join public.managers destination_manager on destination_manager.id = destination_cap.manager_id
  where source_manager.code = v_source_manager_code and source_manager.enabled
    and source_cap.capability_code = 'inter_agent_requests' and source_cap.enabled
    and source_cap.permissions @> array['write','enqueue']::text[]
    and destination_manager.code = v_destination_manager_code and destination_manager.enabled
    and destination_cap.enabled and destination_cap.permissions @> array['read']::text[];
  if v_capability_count = 0 then raise exception 'inter_agent_capability_missing'; end if;

  select * into v_existing
  from public.inter_agent_requests
  where user_id = v_user_id and idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_existing.source_run_id is distinct from v_source_run_id
      or v_existing.source_message_id is distinct from v_source_message_id
      or v_existing.source_manager_code <> v_source_manager_code
      or v_existing.destination_manager_code <> v_destination_manager_code
      or v_existing.destination_workflow_definition_id is distinct from v_destination_workflow_id
      or v_existing.objective <> v_objective
      or v_existing.required_output_contract <> v_output_contract then
      raise exception 'inter_agent_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'requestId', v_existing.id,
      'destinationRunId', v_existing.destination_run_id,
      'duplicate', true
    );
  end if;

  if v_source_run_id is not null and v_source.status <> 'running' then
    raise exception 'inter_agent_source_run_not_delegatable';
  end if;
  if v_source_run_id is null and not exists (
    select 1 from public.conversations c
    where c.id = v_conversation_id and c.status = 'open'
  ) then raise exception 'inter_agent_conversation_not_open'; end if;

  insert into public.inter_agent_requests(
    id,user_id,conversation_id,source_manager_code,destination_manager_code,status,
    objective,required_output_contract,context_evidence_ids,priority,deadline_at,
    source_run_id,source_message_id,correlation_id,idempotency_key,
    destination_workflow_definition_id,delegation_depth,routing_path
  ) values (
    v_request_id,v_user_id,v_conversation_id,v_source_manager_code,v_destination_manager_code,'requested',
    v_objective,v_output_contract,v_evidence_ids,v_priority,v_deadline_at,
    v_source_run_id,v_source_message_id,v_correlation_id,v_idempotency_key,
    v_destination_workflow_id,p_delegation_depth,p_routing_path
  );

  insert into public.workflow_runs(
    user_id,workflow_definition_id,status,trigger,correlation_id,idempotency_key,priority,cost_root_run_id
  ) values (
    v_user_id,v_destination_workflow_id,'queued','inter_agent_request',v_correlation_id,
    'inter-agent-request:' || v_request_id::text,v_priority,v_cost_root_run_id
  ) returning id into v_child_run_id;

  insert into public.job_queue(user_id,run_id,job_type,payload,priority,deduplication_key)
  values (
    v_user_id,
    v_child_run_id,
    'workflow_execute',
    jsonb_build_object('request',jsonb_build_object(
      'interAgentRequestId',v_request_id,
      'sourceRunId',v_source_run_id,
      'sourceManagerCode',v_source_manager_code,
      'destinationManagerCode',v_destination_manager_code,
      'destinationWorkflowCode',v_destination_workflow_code,
      'objective',v_objective,
      'requiredOutputContract',v_output_contract,
      'contextEvidenceIds',to_jsonb(v_evidence_ids),
      'delegationDepth',p_delegation_depth,
      'delegationPath',to_jsonb(p_routing_path)
    )),
    v_priority,
    'inter-agent-request:' || v_request_id::text
  );

  update public.inter_agent_requests
  set destination_run_id = v_child_run_id,
      status = 'accepted',
      updated_at = clock_timestamp()
  where id = v_request_id;
  if v_source_run_id is not null then
    update public.workflow_runs
    set status = 'waiting_for_dependency', completed_at = null
    where id = v_source_run_id and status = 'running';
  end if;
  insert into public.trace_events(user_id,correlation_id,event_type,severity,redacted_payload)
  values (
    v_user_id,v_correlation_id,'inter_agent_request_queued','info',
    jsonb_build_object('request_id',v_request_id,'source_run_id',v_source_run_id,
      'destination_run_id',v_child_run_id,'destination_manager',v_destination_manager_code,
      'destination_workflow',v_destination_workflow_code,'delegation_depth',p_delegation_depth)
  );
  return jsonb_build_object(
    'requestId',v_request_id,
    'destinationRunId',v_child_run_id,
    'duplicate',false
  );
end;
$$;

create or replace function public.resume_inter_agent_source_run(p_source_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.workflow_runs;
  v_base_payload jsonb;
  v_results jsonb;
  v_prior_results jsonb;
  v_latest_request_id uuid;
  v_deduplication_key text;
  v_inserted_job_id uuid;
begin
  if p_source_run_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_source_run_id::text, 0));
  select * into v_source
  from public.workflow_runs
  where id = p_source_run_id
  for update;
  if not found or v_source.status <> 'waiting_for_dependency' then return null; end if;
  if exists (
    select 1 from public.inter_agent_requests r
    where r.source_run_id = p_source_run_id and r.resumed_at is null
      and r.status in ('requested','accepted','running','waiting_for_dependency')
  ) then return null; end if;
  if not exists (
    select 1 from public.inter_agent_requests r
    where r.source_run_id = p_source_run_id and r.resumed_at is null
  ) then return null; end if;
  if exists (
    select 1 from public.job_queue q
    where q.run_id = p_source_run_id and q.job_type = 'workflow_execute'
      and q.status in ('queued','leased','awaiting_provider')
  ) then return null; end if;

  select q.payload into v_base_payload
  from public.job_queue q
  where q.run_id = p_source_run_id and q.job_type = 'workflow_execute'
  order by q.created_at desc, q.id desc
  limit 1;
  if v_base_payload is null then v_base_payload := '{}'::jsonb; end if;
  if jsonb_typeof(v_base_payload->'request') <> 'object' then
    v_base_payload := jsonb_set(v_base_payload, '{request}', '{}'::jsonb, true);
  end if;
  v_prior_results := case
    when jsonb_typeof(v_base_payload #> '{request,delegationResults}') = 'array'
      then v_base_payload #> '{request,delegationResults}'
    else '[]'::jsonb
  end;
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'requestId', r.id,
      'destinationManagerCode', r.destination_manager_code,
      'destinationWorkflowCode', d.code,
      'status', r.status,
      'reply', coalesce(to_jsonb(reply.output), '{}'::jsonb),
      'resultReference', reply.result_reference,
      'evidenceReferenceIds', to_jsonb(coalesce(reply.evidence_reference_ids, '{}'::uuid[]))
    ) order by r.created_at, r.id), '[]'::jsonb),
    (array_agg(r.id order by r.created_at desc, r.id desc))[1]
  into v_results, v_latest_request_id
  from public.inter_agent_requests r
  join public.workflow_definitions d on d.id = r.destination_workflow_definition_id
  left join public.inter_agent_replies reply on reply.request_id = r.id
  where r.source_run_id = p_source_run_id and r.resumed_at is null
    and r.status in ('completed','rejected','failed','cancelled');
  if v_latest_request_id is null then return null; end if;
  v_deduplication_key := 'inter-agent-resume:' || p_source_run_id::text || ':' || v_latest_request_id::text;
  v_base_payload := jsonb_set(
    v_base_payload,
    '{request,delegationResults}',
    v_prior_results || v_results,
    true
  );
  v_base_payload := jsonb_set(
    v_base_payload,
    '{request,delegationResumeRequestId}',
    to_jsonb(v_latest_request_id::text),
    true
  );
  insert into public.job_queue(user_id,run_id,job_type,payload,priority,deduplication_key)
  values (v_source.user_id,p_source_run_id,'workflow_execute',v_base_payload,v_source.priority,v_deduplication_key)
  on conflict (deduplication_key) do nothing
  returning id into v_inserted_job_id;
  update public.inter_agent_requests
  set resumed_at = clock_timestamp(), updated_at = clock_timestamp()
  where source_run_id = p_source_run_id and resumed_at is null
    and status in ('completed','rejected','failed','cancelled');
  update public.workflow_runs
  set status = 'queued', completed_at = null, error_code = null, redacted_error = null
  where id = p_source_run_id and status = 'waiting_for_dependency';
  insert into public.trace_events(user_id,correlation_id,event_type,severity,redacted_payload)
  values (
    v_source.user_id,v_source.correlation_id,'inter_agent_source_resumed','info',
    jsonb_build_object('source_run_id',p_source_run_id,'request_count',jsonb_array_length(v_results),
      'queue_job_id',v_inserted_job_id,'deduplication_key',v_deduplication_key)
  );
  return p_source_run_id;
end;
$$;

create or replace function public.complete_inter_agent_request(
  p_request_id uuid,
  p_reply jsonb,
  p_status text,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.inter_agent_requests;
  v_child public.workflow_runs;
  v_reply_id uuid;
  v_result_reference uuid;
  v_evidence_ids uuid[];
  v_kind text;
  v_resumed_source_run_id uuid;
begin
  if p_request_id is null or p_reply is null or jsonb_typeof(p_reply) <> 'object'
    or p_reply->>'contractVersion' is distinct from '1'
    or p_status not in ('completed','rejected','failed')
    or p_completed_at is null or p_completed_at > clock_timestamp() + interval '1 minute'
    or octet_length(p_reply::text) > 24000 then
    raise exception 'inter_agent_reply_contract_invalid';
  end if;
  begin
    v_reply_id := (p_reply->>'id')::uuid;
    v_result_reference := nullif(p_reply->>'resultReference','')::uuid;
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into v_evidence_ids
    from jsonb_array_elements_text(coalesce(p_reply->'evidenceReferenceIds','[]'::jsonb)) as evidence(value);
  exception when others then
    raise exception 'inter_agent_reply_contract_invalid';
  end;
  v_kind := p_reply->>'kind';
  if v_reply_id is null or jsonb_typeof(p_reply->'output') is distinct from 'object'
    or jsonb_typeof(coalesce(p_reply->'evidenceReferenceIds','[]'::jsonb)) is distinct from 'array'
    or v_kind is distinct from p_status
    or (p_status = 'completed' and v_result_reference is null)
    or (p_status <> 'completed' and v_result_reference is not null) then
    raise exception 'inter_agent_reply_contract_invalid';
  end if;

  select * into v_request
  from public.inter_agent_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'inter_agent_request_not_found'; end if;
  if p_reply->>'requestId' is distinct from v_request.id::text
    or p_reply->>'userId' is distinct from v_request.user_id::text
    or p_reply->>'managerCode' is distinct from v_request.destination_manager_code
    or p_reply->>'correlationId' is distinct from v_request.correlation_id::text then
    raise exception 'inter_agent_reply_owner_mismatch';
  end if;
  select * into v_child
  from public.workflow_runs
  where id = v_request.destination_run_id and user_id = v_request.user_id
  for update;
  if not found or v_child.status not in ('succeeded','failed','cancelled') then
    raise exception 'inter_agent_destination_run_not_terminal';
  end if;
  if p_status = 'completed' and not exists (
    select 1 from public.reports report
    where report.id = v_result_reference and report.run_id = v_child.id and report.user_id = v_request.user_id
  ) then raise exception 'inter_agent_result_reference_mismatch'; end if;

  if exists (select 1 from public.inter_agent_replies where request_id = p_request_id) then
    v_resumed_source_run_id := public.resume_inter_agent_source_run(v_request.source_run_id);
    return jsonb_build_object(
      'sourceRunId',v_request.source_run_id,
      'resumed',v_resumed_source_run_id is not null
    );
  end if;
  if v_request.status = 'accepted' then
    update public.inter_agent_requests set status = 'running' where id = p_request_id;
  end if;
  insert into public.inter_agent_replies(
    id,request_id,user_id,manager_code,kind,output,result_reference,evidence_reference_ids,created_at,correlation_id
  ) values (
    v_reply_id,p_request_id,v_request.user_id,v_request.destination_manager_code,p_status,
    p_reply->'output',v_result_reference,v_evidence_ids,clock_timestamp(),v_request.correlation_id
  );
  update public.inter_agent_requests
  set status = p_status::public.inter_agent_request_status,
      result_reference = v_result_reference,
      result = p_reply->'output',
      updated_at = clock_timestamp()
  where id = p_request_id;
  if p_status in ('failed','rejected') then
    insert into public.attention_items(
      user_id,source_manager_code,source_conversation_id,source_run_id,item_type,
      finding,recommended_communication,recommended_action,priority,urgency,deadline_at,
      acknowledgement_required,evidence_reference_ids,correlation_id,deduplication_key
    ) values (
      v_request.user_id,v_request.source_manager_code,v_request.conversation_id,v_request.source_run_id,
      'inter_agent_request_failure',
      'A specialist request did not produce the required result.',
      'Review the specialist request failure and decide whether to retry or continue.',
      'Review the linked inter-agent request and its safe error code.',
      v_request.priority,case when v_request.deadline_at is not null and v_request.deadline_at <= clock_timestamp() then 'time_sensitive' else 'routine' end,
      v_request.deadline_at,false,v_request.context_evidence_ids,v_request.correlation_id,
      'inter-agent-request:' || p_request_id::text
    ) on conflict (user_id,deduplication_key) do nothing;
  end if;
  insert into public.trace_events(user_id,correlation_id,event_type,severity,redacted_payload)
  values (
    v_request.user_id,v_request.correlation_id,
    case when p_status = 'completed' then 'inter_agent_request_completed' else 'inter_agent_request_failed' end,
    case when p_status = 'completed' then 'info' else 'error' end,
    jsonb_build_object('request_id',p_request_id,'destination_run_id',v_child.id,'status',p_status,
      'result_reference',v_result_reference,'error_code',p_reply #>> '{output,errorCode}')
  );
  v_resumed_source_run_id := public.resume_inter_agent_source_run(v_request.source_run_id);
  return jsonb_build_object('sourceRunId',v_request.source_run_id,'resumed',v_resumed_source_run_id is not null);
end;
$$;

create or replace function public.finalize_inter_agent_destination_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.inter_agent_requests;
  v_report public.reports;
  v_status text;
  v_reply jsonb;
begin
  select * into v_request
  from public.inter_agent_requests
  where destination_run_id = new.id
  for update;
  if not found or v_request.status in ('completed','rejected','failed','cancelled') then return new; end if;
  v_status := case when new.status = 'succeeded' then 'completed' when new.status = 'cancelled' then 'rejected' else 'failed' end;
  if v_status = 'completed' then
    select * into v_report from public.reports
    where run_id = new.id and user_id = new.user_id
    order by created_at desc limit 1;
    if not found then v_status := 'failed'; end if;
  end if;
  v_reply := jsonb_build_object(
    'contractVersion',1,
    'id',gen_random_uuid(),
    'userId',v_request.user_id,
    'requestId',v_request.id,
    'managerCode',v_request.destination_manager_code,
    'kind',v_status,
    'output',case when v_status = 'completed' then jsonb_build_object(
      'reportId',v_report.id,'title',left(v_report.title,200),'summary',left(v_report.summary,4000)
    ) else jsonb_build_object(
      'errorCode',case when new.status = 'succeeded' then 'inter_agent_result_missing' else coalesce(new.error_code,'inter_agent_destination_failed') end
    ) end,
    'resultReference',case when v_status = 'completed' then v_report.id else null end,
    'evidenceReferenceIds',to_jsonb(v_request.context_evidence_ids),
    'createdAt',clock_timestamp(),
    'correlationId',v_request.correlation_id
  );
  perform public.complete_inter_agent_request(v_request.id,v_reply,v_status,clock_timestamp());
  return new;
end;
$$;

create trigger inter_agent_destination_run_terminal
after update of status on public.workflow_runs
for each row
when (old.status is distinct from new.status and new.status in ('succeeded','failed','cancelled'))
execute function public.finalize_inter_agent_destination_run();

create or replace function public.guard_inter_agent_source_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'succeeded' and old.status is distinct from new.status
    and exists (
      select 1 from public.inter_agent_requests r
      where r.source_run_id = new.id and r.resumed_at is null
    ) then
    new.status := 'waiting_for_dependency';
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger inter_agent_source_completion_guard
before update of status on public.workflow_runs
for each row execute function public.guard_inter_agent_source_completion();

create or replace function public.resume_waiting_inter_agent_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'waiting_for_dependency' then
    perform public.resume_inter_agent_source_run(new.id);
  end if;
  return new;
end;
$$;

create trigger inter_agent_source_resume
after update of status on public.workflow_runs
for each row execute function public.resume_waiting_inter_agent_source();

create or replace function public.expire_inter_agent_requests(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.inter_agent_requests;
  v_expired integer := 0;
begin
  for v_request in
    select r.*
    from public.inter_agent_requests r
    where r.deadline_at is not null and r.deadline_at <= clock_timestamp()
      and r.status in ('requested','accepted','running','waiting_for_dependency')
    order by r.deadline_at, r.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  loop
    update public.job_provider_submissions
    set status = 'expired', completed_at = clock_timestamp(), error_code = 'inter_agent_deadline_expired'
    where job_id in (select q.id from public.job_queue q where q.run_id = v_request.destination_run_id)
      and status = 'awaiting_provider';
    update public.job_queue
    set status = 'cancelled', completed_at = clock_timestamp(), lease_owner = null, lease_expires_at = null
    where run_id = v_request.destination_run_id and status in ('queued','leased','awaiting_provider');
    update public.workflow_runs
    set status = 'failed', completed_at = clock_timestamp(), error_code = 'inter_agent_deadline_expired',
        redacted_error = 'Specialist request exceeded its deadline.'
    where id = v_request.destination_run_id and status not in ('succeeded','failed','cancelled');
    if not found then
      perform public.complete_inter_agent_request(
        v_request.id,
        jsonb_build_object(
          'contractVersion',1,'id',gen_random_uuid(),'userId',v_request.user_id,
          'requestId',v_request.id,'managerCode',v_request.destination_manager_code,'kind','failed',
          'output',jsonb_build_object('errorCode','inter_agent_deadline_expired'),
          'resultReference',null,'evidenceReferenceIds',to_jsonb(v_request.context_evidence_ids),
          'createdAt',clock_timestamp(),'correlationId',v_request.correlation_id
        ),
        'failed',clock_timestamp()
      );
    end if;
    v_expired := v_expired + 1;
  end loop;
  return v_expired;
end;
$$;

-- A bounded recurring sweep ensures expired requests become attention items
-- even when no further worker claim happens to arrive.
select cron.schedule(
  'ai17-expire-inter-agent-requests',
  '* * * * *',
  'select public.expire_inter_agent_requests(50);'
)
where not exists (select 1 from cron.job where jobname = 'ai17-expire-inter-agent-requests');

create or replace function public.create_conversation_handoff(p_handoff jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_user_id uuid;
  v_conversation_id uuid;
  v_source_message_id uuid;
  v_from_manager_code text;
  v_to_manager_code text;
  v_reason text;
  v_correlation_id uuid;
  v_idempotency_key text;
  v_existing public.conversation_handoffs;
  v_capability_count integer;
begin
  if p_handoff is null or jsonb_typeof(p_handoff) <> 'object'
    or p_handoff->>'status' is distinct from 'requested'
    or p_handoff->>'contractVersion' is distinct from '1'
    or p_handoff->'acceptedAt' is distinct from 'null'::jsonb then
    raise exception 'conversation_handoff_contract_invalid';
  end if;
  begin
    v_id := (p_handoff->>'id')::uuid;
    v_user_id := (p_handoff->>'userId')::uuid;
    v_conversation_id := (p_handoff->>'conversationId')::uuid;
    v_source_message_id := nullif(p_handoff->>'sourceMessageId','')::uuid;
    v_correlation_id := (p_handoff->>'correlationId')::uuid;
  exception when others then
    raise exception 'conversation_handoff_identity_invalid';
  end;
  v_from_manager_code := p_handoff->>'fromManagerCode';
  v_to_manager_code := p_handoff->>'toManagerCode';
  v_reason := btrim(coalesce(p_handoff->>'reason',''));
  v_idempotency_key := p_handoff->>'idempotencyKey';
  if v_id is null or v_user_id is null or v_conversation_id is null or v_correlation_id is null
    or v_from_manager_code is null or v_to_manager_code is null or v_from_manager_code = v_to_manager_code
    or length(v_reason) not between 1 and 2000
    or v_idempotency_key is null or length(v_idempotency_key) not between 1 and 200 then
    raise exception 'conversation_handoff_contract_invalid';
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = v_conversation_id and c.user_id = v_user_id
      and c.status = 'open' and c.current_manager_code = v_from_manager_code
  ) then raise exception 'conversation_handoff_source_owner_mismatch'; end if;
  if v_source_message_id is not null and not exists (
    select 1 from public.conversation_messages cm
    where cm.id = v_source_message_id and cm.user_id = v_user_id and cm.conversation_id = v_conversation_id
  ) then raise exception 'conversation_handoff_source_message_mismatch'; end if;
  select count(*) into v_capability_count
  from public.manager_capabilities source_cap
  join public.managers source_manager on source_manager.id = source_cap.manager_id
  join public.manager_capabilities destination_cap on destination_cap.capability_code = 'inter_agent_requests'
  join public.managers destination_manager on destination_manager.id = destination_cap.manager_id
  where source_manager.code = v_from_manager_code and source_manager.enabled
    and source_cap.capability_code = 'inter_agent_requests' and source_cap.enabled
    and source_cap.permissions @> array['write','enqueue']::text[]
    and destination_manager.code = v_to_manager_code and destination_manager.enabled
    and destination_cap.enabled and destination_cap.permissions @> array['read']::text[];
  if v_capability_count = 0 then raise exception 'conversation_handoff_capability_missing'; end if;

  select * into v_existing from public.conversation_handoffs
  where user_id = v_user_id and idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_existing.conversation_id <> v_conversation_id
      or v_existing.from_manager_code <> v_from_manager_code
      or v_existing.to_manager_code <> v_to_manager_code
      or v_existing.reason <> v_reason
      or v_existing.source_message_id is distinct from v_source_message_id then
      raise exception 'conversation_handoff_idempotency_conflict';
    end if;
    return jsonb_build_object('handoffId',v_existing.id,'duplicate',true);
  end if;
  insert into public.conversation_handoffs(
    id,user_id,conversation_id,from_manager_code,to_manager_code,status,reason,
    source_message_id,correlation_id,idempotency_key
  ) values (
    v_id,v_user_id,v_conversation_id,v_from_manager_code,v_to_manager_code,'requested',v_reason,
    v_source_message_id,v_correlation_id,v_idempotency_key
  );
  insert into public.trace_events(user_id,correlation_id,event_type,severity,redacted_payload)
  values (
    v_user_id,v_correlation_id,'conversation_handoff_requested','info',
    jsonb_build_object('handoff_id',v_id,'conversation_id',v_conversation_id,
      'from_manager',v_from_manager_code,'to_manager',v_to_manager_code)
  );
  return jsonb_build_object('handoffId',v_id,'duplicate',false);
end;
$$;

create or replace function public.resolve_conversation_handoff(
  p_handoff_id uuid,
  p_user_id uuid,
  p_status text,
  p_actor_manager_code text,
  p_correlation_id uuid,
  p_transitioned_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff public.conversation_handoffs;
  v_current_owner text;
begin
  if p_handoff_id is null or p_user_id is null
    or p_status is null or p_status not in ('accepted','rejected','cancelled')
    or p_transitioned_at is null or p_transitioned_at > clock_timestamp() + interval '1 minute' then
    raise exception 'conversation_handoff_resolution_invalid';
  end if;
  select * into v_handoff
  from public.conversation_handoffs
  where id = p_handoff_id and user_id = p_user_id
  for update;
  if not found then raise exception 'conversation_handoff_not_found'; end if;
  if v_handoff.status <> 'requested' or p_correlation_id is distinct from v_handoff.correlation_id then
    raise exception 'conversation_handoff_transition_invalid';
  end if;
  if (p_status = 'accepted' and p_actor_manager_code <> v_handoff.to_manager_code)
    or (p_status = 'rejected' and p_actor_manager_code <> v_handoff.to_manager_code)
    or (p_status = 'cancelled' and p_actor_manager_code <> v_handoff.from_manager_code) then
    raise exception 'conversation_handoff_actor_mismatch';
  end if;
  if p_status = 'accepted' and not exists (
    select 1 from public.manager_capabilities c join public.managers m on m.id = c.manager_id
    where m.code = v_handoff.to_manager_code and m.enabled
      and c.capability_code = 'inter_agent_requests' and c.enabled and c.permissions @> array['read']::text[]
  ) then raise exception 'conversation_handoff_capability_missing'; end if;
  update public.conversation_handoffs
  set status = p_status::public.handoff_status,
      accepted_at = case when p_status = 'accepted' then clock_timestamp() else null end
  where id = p_handoff_id;
  select current_manager_code into v_current_owner
  from public.conversations
  where id = v_handoff.conversation_id and user_id = p_user_id;
  if not found then raise exception 'conversation_handoff_conversation_unavailable'; end if;
  insert into public.trace_events(user_id,correlation_id,event_type,severity,redacted_payload)
  values (
    p_user_id,v_handoff.correlation_id,'conversation_handoff_' || p_status,
    case when p_status = 'accepted' then 'info' else 'notice' end,
    jsonb_build_object('handoff_id',p_handoff_id,'conversation_id',v_handoff.conversation_id,
      'actor_manager',p_actor_manager_code,'status',p_status,'current_owner',v_current_owner)
  );
  return jsonb_build_object('conversationId',v_handoff.conversation_id,'currentManagerCode',v_current_owner);
end;
$$;

revoke all privileges on function public.create_inter_agent_request_run(jsonb,integer,text[],uuid),
  public.complete_inter_agent_request(uuid,jsonb,text,timestamptz),
  public.create_conversation_handoff(jsonb),
  public.resolve_conversation_handoff(uuid,uuid,text,text,uuid,timestamptz),
  public.expire_inter_agent_requests(integer)
from public, anon, authenticated, service_role;
grant execute on function public.create_inter_agent_request_run(jsonb,integer,text[],uuid),
  public.complete_inter_agent_request(uuid,jsonb,text,timestamptz),
  public.create_conversation_handoff(jsonb),
  public.resolve_conversation_handoff(uuid,uuid,text,text,uuid,timestamptz)
to service_role;

revoke all privileges on function public.resume_inter_agent_source_run(uuid),
  public.finalize_inter_agent_destination_run(),
  public.guard_inter_agent_source_completion(),
  public.resume_waiting_inter_agent_source()
from public, anon, authenticated, service_role;
