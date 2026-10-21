-- Atomic, owner-scoped persistence for canonical action execution.
alter table public.execution_requests
  add column channel public.conversation_channel,
  add column execution_mode text not null default 'execute' check (execution_mode in ('execute','reverse')),
  add column request_fingerprint text,
  add column policy_decision jsonb,
  add column claim_token uuid,
  add column claimed_at timestamptz;

update public.execution_requests request
set channel = message.channel
from public.conversation_messages message
where message.id = request.source_message_id
  and message.user_id = request.user_id
  and request.channel is null;

update public.execution_requests set channel = 'internal' where channel is null;
alter table public.execution_requests alter column channel set default 'internal';
alter table public.execution_requests alter column channel set not null;
alter table public.execution_requests add constraint execution_requests_fingerprint_check
  check (request_fingerprint is null or request_fingerprint ~ '^sha256:[a-f0-9]{64}$');
alter table public.execution_requests add constraint execution_requests_policy_decision_check
  check (policy_decision is null or (jsonb_typeof(policy_decision) = 'object' and policy_decision ? 'decision' and policy_decision ? 'reason'));
alter table public.execution_requests add constraint execution_requests_claim_binding_check
  check ((claim_token is null) = (claimed_at is null));

alter table public.execution_receipts drop constraint execution_receipts_check;
alter table public.execution_receipts add constraint execution_receipts_check
  check ((kind in ('failed', 'waiting_for_dependency', 'partially_succeeded')) = (error_code is not null));
alter table public.execution_receipts drop constraint execution_receipts_kind_check;
alter table public.execution_receipts add constraint execution_receipts_kind_check
  check (kind in ('accepted','waiting_for_dependency','succeeded','partially_succeeded','failed','rejected','cancelled','expired','too_late_to_cancel','reversed'));

alter table public.actions drop constraint actions_proposal_approval_gate_check;
alter table public.actions add constraint actions_proposal_approval_gate_check check (
  (authority <> 'agent_proposal' or approval_required) and
  (authority = 'agent_proposal' or approval_state <> 'pending') and
  (authority <> 'agent_proposal' or status not in ('approved','queued','running','waiting_for_dependency','succeeded','partially_succeeded','reversible','reversed','closed') or approval_state='approved')
);

create or replace function public.enforce_agent_contract_transition()
returns trigger language plpgsql as $$
declare allowed boolean := false;
begin
  if new.status = old.status then return new; end if;
  if tg_table_name = 'actions' then
    allowed := (old.status,new.status) in (
      ('proposed','awaiting_approval'),('proposed','approved'),('proposed','rejected'),('proposed','queued'),('proposed','cancelled'),('proposed','expired'),
      ('awaiting_approval','approved'),('awaiting_approval','rejected'),('awaiting_approval','cancelled'),('awaiting_approval','expired'),
      ('approved','queued'),('approved','cancelled'),('approved','expired'),
      ('queued','running'),('queued','failed'),('queued','cancelled'),('queued','expired'),('queued','waiting_for_dependency'),
      ('running','waiting_for_dependency'),('running','succeeded'),('running','partially_succeeded'),('running','failed'),('running','cancelled'),
      ('waiting_for_dependency','queued'),('waiting_for_dependency','running'),('waiting_for_dependency','failed'),('waiting_for_dependency','cancelled'),('waiting_for_dependency','expired'),
      ('succeeded','reversible'),('succeeded','closed'),('partially_succeeded','reversible'),('partially_succeeded','closed'),
      ('reversible','reversed'),('reversible','closed'),('reversed','closed'),('failed','closed')
    );
  elsif tg_table_name = 'conversations' then
    allowed := (old.status,new.status) in (('open','closed'),('open','archived'),('closed','open'),('closed','archived'));
  elsif tg_table_name = 'conversation_handoffs' then
    allowed := (old.status,new.status) in (('requested','accepted'),('requested','rejected'),('requested','cancelled'));
  elsif tg_table_name = 'inter_agent_requests' then
    allowed := (old.status,new.status) in (('requested','accepted'),('requested','rejected'),('requested','cancelled'),('requested','failed'),('accepted','running'),('accepted','waiting_for_dependency'),('accepted','cancelled'),('accepted','failed'),('running','waiting_for_dependency'),('running','completed'),('running','rejected'),('running','failed'),('running','cancelled'),('waiting_for_dependency','accepted'),('waiting_for_dependency','running'),('waiting_for_dependency','cancelled'),('waiting_for_dependency','failed'));
  elsif tg_table_name = 'attention_items' then
    allowed := (old.status,new.status) in (('new','queued_for_planner'),('new','sent_immediately'),('new','dismissed'),('new','expired'),('queued_for_planner','incorporated'),('queued_for_planner','sent_immediately'),('queued_for_planner','dismissed'),('queued_for_planner','expired'),('incorporated','resolved'),('incorporated','dismissed'),('sent_immediately','resolved'),('sent_immediately','dismissed'));
  elsif tg_table_name = 'execution_requests' then
    allowed := (old.status,new.status) in (('received','routed'),('received','failed'),('received','cancelled'),('routed','queued'),('routed','waiting_for_dependency'),('routed','failed'),('routed','cancelled'),('queued','running'),('queued','waiting_for_dependency'),('queued','failed'),('queued','cancelled'),('running','waiting_for_dependency'),('running','succeeded'),('running','failed'),('running','cancelled'),('waiting_for_dependency','queued'),('waiting_for_dependency','running'),('waiting_for_dependency','failed'),('waiting_for_dependency','cancelled'));
  end if;
  if not allowed then raise exception 'invalid_agent_contract_transition: %.% -> %', tg_table_name, old.status, new.status; end if;
  return new;
end $$;

create or replace function public.lookup_canonical_action_execution(
  p_user_id uuid,
  p_execution_request_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.execution_requests; receipt_row public.execution_receipts;
begin
  select * into request_row from public.execution_requests
    where id = p_execution_request_id and user_id = p_user_id and idempotency_key = p_idempotency_key;
  if not found then return jsonb_build_object('kind','conflict'); end if;
  if request_row.request_fingerprint is not null and request_row.request_fingerprint <> p_request_fingerprint then
    return jsonb_build_object('kind','conflict');
  end if;
  select * into receipt_row from public.execution_receipts
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('kind','replay','receipt',receipt_row.result); end if;
  if request_row.status in ('running') then return jsonb_build_object('kind','in_progress'); end if;
  if request_row.status in ('succeeded','failed','cancelled') then return jsonb_build_object('kind','conflict'); end if;
  return jsonb_build_object('kind','missing');
end $$;

create or replace function public.record_canonical_action_policy_decision(
  p_user_id uuid,
  p_execution_request_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_policy_decision jsonb
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.execution_requests;
begin
  if p_request_fingerprint !~ '^sha256:[a-f0-9]{64}$' or jsonb_typeof(p_policy_decision) <> 'object'
     or p_policy_decision->>'decision' not in ('allow','approval_required','reauth_required','deny')
     or p_policy_decision->>'reason' is null then
    raise exception 'invalid_canonical_action_policy_decision';
  end if;
  select * into request_row from public.execution_requests
    where id = p_execution_request_id and user_id = p_user_id and idempotency_key = p_idempotency_key
    for update;
  if not found then return false; end if;
  if p_policy_decision->>'decision' = 'allow'
     and coalesce((p_policy_decision->>'freshWebAal2Required')::boolean, false)
     and (request_row.channel <> 'web_chat' or not exists(
       select 1 from public.mfa_reauthentication_events
       where user_id = p_user_id and verified_at >= now() - interval '5 minutes'
     )) then
    return false;
  end if;
  if request_row.request_fingerprint is not null and request_row.request_fingerprint <> p_request_fingerprint then
    return false;
  end if;
  if request_row.policy_decision is not null and request_row.policy_decision <> p_policy_decision and not (
    request_row.policy_decision->>'decision' = 'approval_required'
      and p_policy_decision->>'decision' in ('reauth_required','allow')
      and request_row.authority = 'agent_proposal'
      and exists(select 1 from public.actions where id = request_row.action_id and user_id = p_user_id and approval_state = 'approved')
      and (p_policy_decision->>'decision' <> 'allow' or not coalesce((p_policy_decision->>'freshWebAal2Required')::boolean, false)
        or exists(select 1 from public.mfa_reauthentication_events where user_id = p_user_id and verified_at >= now() - interval '5 minutes'))
  ) and not (
    request_row.policy_decision->>'decision' = 'reauth_required'
      and p_policy_decision->>'decision' = 'allow'
      and request_row.channel = 'web_chat'
      and exists(select 1 from public.mfa_reauthentication_events where user_id = p_user_id and verified_at >= now() - interval '5 minutes')
  ) then
    return false;
  end if;
  update public.execution_requests set request_fingerprint = p_request_fingerprint,
    policy_decision = p_policy_decision
    where id = p_execution_request_id and user_id = p_user_id;
  insert into public.audit_events(user_id,actor_type,action_type,target_type,target_id,correlation_id,result,redacted_after)
    values (p_user_id,'system','canonical_action_policy_decision','execution_request',p_execution_request_id::text,
      request_row.correlation_id,'success',jsonb_build_object('decision',p_policy_decision));
  if p_policy_decision->>'decision' = 'approval_required' and request_row.action_id is not null then
    update public.actions set status='awaiting_approval', approval_required=true, approval_state='pending', updated_at=now()
      where id=request_row.action_id and user_id=p_user_id and authority='agent_proposal' and status='proposed';
  end if;
  return true;
end $$;

create or replace function public.claim_canonical_action_execution(
  p_user_id uuid,
  p_execution_request_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.execution_requests; action_row public.actions; receipt_row public.execution_receipts; token uuid;
begin
  select * into request_row from public.execution_requests
    where id = p_execution_request_id and user_id = p_user_id and idempotency_key = p_idempotency_key
    for update;
  if not found or request_row.request_fingerprint is distinct from p_request_fingerprint then
    return jsonb_build_object('kind','conflict');
  end if;
  select * into receipt_row from public.execution_receipts
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('kind','replay','receipt',receipt_row.result); end if;
  if request_row.status = 'running' then return jsonb_build_object('kind','in_progress'); end if;
  if request_row.status not in ('queued','routed','waiting_for_dependency') or coalesce(request_row.policy_decision->>'decision','') <> 'allow' then
    return jsonb_build_object('kind','conflict');
  end if;
  if request_row.authority = 'agent_proposal' then
    select * into action_row from public.actions where id = request_row.action_id and user_id = p_user_id for update;
    if not found or action_row.authority <> request_row.authority or not action_row.approval_required or action_row.approval_state <> 'approved' then
      return jsonb_build_object('kind','conflict');
    end if;
  elsif request_row.action_id is not null then
    select * into action_row from public.actions where id = request_row.action_id and user_id = p_user_id for update;
    if not found or action_row.authority <> request_row.authority then
      return jsonb_build_object('kind','conflict');
    end if;
  end if;
  if request_row.channel = 'web_chat'
     and coalesce((request_row.policy_decision->>'freshWebAal2Required')::boolean, false)
     and not exists(select 1 from public.mfa_reauthentication_events where user_id = p_user_id and verified_at >= now() - interval '5 minutes') then
    return jsonb_build_object('kind','conflict');
  end if;
  if request_row.execution_mode = 'reverse' then
    if request_row.action_id is null or action_row.id is null or action_row.status <> 'reversible'
       or not exists (
         select 1 from public.execution_receipts original
         where original.id = nullif(request_row.typed_parameters->>'originalReceiptId','')::uuid
           and original.user_id = p_user_id and original.action_id = request_row.action_id
           and original.kind in ('succeeded','partially_succeeded')
           and original.result->>'reversalToken' is not null
       )
       or exists (
         select 1 from public.execution_requests other
         where other.user_id = p_user_id and other.action_id = request_row.action_id
           and other.execution_mode = 'reverse' and other.id <> request_row.id and other.status = 'running'
       ) then
      return jsonb_build_object('kind','conflict');
    end if;
  elsif request_row.action_id is not null and action_row.id is not null then
    if action_row.status in ('proposed','approved') then
      update public.actions set status='queued', updated_at=now() where id=action_row.id and user_id=p_user_id;
      update public.actions set status='running', updated_at=now() where id=action_row.id and user_id=p_user_id;
    elsif action_row.status in ('queued','waiting_for_dependency') then
      update public.actions set status='running', updated_at=now() where id=action_row.id and user_id=p_user_id;
    else
      return jsonb_build_object('kind','conflict');
    end if;
  end if;
  token := gen_random_uuid();
  update public.execution_requests set status = 'running', claim_token = token, claimed_at = now(),
    started_at = coalesce(started_at, now()), attempt_count = attempt_count + 1
    where id = p_execution_request_id and user_id = p_user_id;
  return jsonb_build_object('kind','claimed','claimToken',token,'attempt',request_row.attempt_count + 1);
end $$;

create or replace function public.complete_canonical_action_execution(
  p_user_id uuid,
  p_execution_request_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_claim_token uuid,
  p_receipt jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.execution_requests; receipt_row public.execution_receipts; kind_value text; receipt_id uuid; receipt_time timestamptz; terminal_status public.execution_request_status; action_status text;
begin
  select * into request_row from public.execution_requests
    where id = p_execution_request_id and user_id = p_user_id and idempotency_key = p_idempotency_key
    for update;
  if not found or request_row.request_fingerprint is distinct from p_request_fingerprint then
    return jsonb_build_object('kind','conflict');
  end if;
  select * into receipt_row from public.execution_receipts where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('kind','replay','receipt',receipt_row.result); end if;
  if request_row.status <> 'running' or request_row.claim_token is distinct from p_claim_token then
    return jsonb_build_object('kind','conflict');
  end if;
  kind_value := p_receipt->>'kind';
  if p_receipt->>'contractVersion' <> '1'
     or p_receipt->>'userId' <> p_user_id::text
     or p_receipt->>'executionRequestId' <> p_execution_request_id::text
     or p_receipt->>'idempotencyKey' <> p_idempotency_key
     or p_receipt->>'requestFingerprint' <> p_request_fingerprint
     or p_receipt->>'policyDecision' <> 'allow'
     or p_receipt->>'authority' <> request_row.authority
     or p_receipt->>'channel' <> request_row.channel::text
     or p_receipt->>'correlationId' <> request_row.correlation_id::text
     or p_receipt->>'policyReason' <> request_row.policy_decision->>'reason'
     or p_receipt->>'actionId' is distinct from request_row.action_id::text
     or kind_value not in ('waiting_for_dependency','succeeded','partially_succeeded','failed','reversed')
     or (request_row.execution_mode = 'execute' and kind_value = 'reversed')
     or (request_row.execution_mode = 'reverse' and kind_value = 'succeeded')
     or p_receipt->>'attempt' <> request_row.attempt_count::text
     or p_receipt->>'actionType' <> request_row.command_type
     or (request_row.execution_mode = 'execute' and p_receipt->>'reversesReceiptId' is not null)
     or (request_row.execution_mode = 'reverse' and (
       p_receipt->>'kind' = 'reversed' and p_receipt->>'reversesReceiptId' is distinct from request_row.typed_parameters->>'originalReceiptId'
     ))
     or (request_row.execution_mode = 'reverse' and p_receipt->>'kind' <> 'reversed'
       and p_receipt->>'reversesReceiptId' is distinct from request_row.typed_parameters->>'originalReceiptId')
     or (request_row.execution_mode = 'reverse' and not exists (
       select 1 from public.execution_receipts original
       where original.id = nullif(request_row.typed_parameters->>'originalReceiptId','')::uuid
         and original.user_id = p_user_id and original.action_id = request_row.action_id
         and original.kind in ('succeeded','partially_succeeded')
         and original.result->>'reversalToken' is not null
     )) then
    raise exception 'invalid_canonical_action_receipt';
  end if;
  receipt_id := gen_random_uuid();
  receipt_time := now();
  p_receipt := p_receipt || jsonb_build_object('id',receipt_id,'createdAt',receipt_time);
  terminal_status := case when kind_value = 'waiting_for_dependency' then 'waiting_for_dependency'::public.execution_request_status
    when kind_value in ('succeeded','partially_succeeded','reversed') then 'succeeded'::public.execution_request_status
    else 'failed'::public.execution_request_status end;
  action_status := case when kind_value = 'reversed' then 'reversed'
    when kind_value = 'waiting_for_dependency' then 'waiting_for_dependency'
    when kind_value = 'partially_succeeded' and p_receipt->>'reversalToken' is not null then 'reversible'
    when kind_value = 'succeeded' and p_receipt->>'reversalToken' is not null then 'reversible'
    when kind_value = 'partially_succeeded' then 'partially_succeeded'
    else kind_value end;
  insert into public.execution_receipts(id,execution_request_id,user_id,kind,summary,action_id,result,error_code,redacted_error,correlation_id,idempotency_key,created_at)
  values (receipt_id,p_execution_request_id,p_user_id,kind_value,p_receipt->>'summary',request_row.action_id,p_receipt,
    p_receipt->>'errorCode',p_receipt->>'redactedError',request_row.correlation_id,p_idempotency_key,receipt_time);
  update public.execution_requests set status = terminal_status,
    error_code = case when kind_value = 'failed' then p_receipt->>'errorCode' else null end,
    redacted_error = case when kind_value = 'failed' then p_receipt->>'redactedError' else null end,
    completed_at = case when terminal_status in ('succeeded','failed') then receipt_time else null end,
    claim_token = null, claimed_at = null
    where id = p_execution_request_id and user_id = p_user_id;
  if request_row.action_id is not null and request_row.execution_mode = 'execute' then
    if action_status = 'reversible' then
      update public.actions set status = case when kind_value = 'partially_succeeded' then 'partially_succeeded' else 'succeeded' end, updated_at = now()
        where id = request_row.action_id and user_id = p_user_id and status = 'running';
      update public.actions set status = 'reversible', updated_at = now()
        where id = request_row.action_id and user_id = p_user_id and status = case when kind_value = 'partially_succeeded' then 'partially_succeeded' else 'succeeded' end;
    else
      update public.actions set status = action_status, updated_at = now()
        where id = request_row.action_id and user_id = p_user_id and status = 'running';
    end if;
  elsif request_row.action_id is not null and kind_value = 'reversed' then
    update public.actions set status = 'reversed', updated_at = now()
      where id = request_row.action_id and user_id = p_user_id and status = 'reversible';
  end if;
  return jsonb_build_object('kind','persisted','receipt',p_receipt);
end $$;

create or replace function public.load_canonical_action_execution_request(
  p_execution_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare context_value jsonb;
begin
  select jsonb_build_object(
    'request', jsonb_build_object(
      'id', request.id,
      'userId', request.user_id,
      'actionId', request.action_id,
      'executionMode', request.execution_mode,
      'authority', request.authority,
      'channel', request.channel,
      'managerCode', request.interpreting_manager_code,
      'actionType', request.command_type,
      'riskClass', action.risk_class,
      'approvalState', case when request.authority = 'verified_user' then 'not_required' else action.approval_state end,
      'idempotencyKey', request.idempotency_key,
      'requestFingerprint', request.request_fingerprint,
      'correlationId', request.correlation_id,
      'typedParameters', request.typed_parameters,
      'commandVersion', request.command_version,
      'targetType', request.target_type,
      'targetReference', request.target_reference,
      'scope', request.scope
    ),
    'capabilities', coalesce((
      select jsonb_agg(jsonb_build_object('capabilityCode', capability.capability_code, 'permissions', to_jsonb(capability.permissions)) order by capability.capability_code)
      from public.manager_capabilities capability
      join public.managers manager on manager.id = capability.manager_id
      where manager.code = request.interpreting_manager_code and capability.enabled
    ), '[]'::jsonb),
    'freshWebAal2', exists(
      select 1 from public.mfa_reauthentication_events event
      where event.user_id = request.user_id and event.verified_at >= now() - interval '5 minutes'
    ),
    'standingPolicyPreauthorized', request.authority = 'standing_policy'
      and action.authority = 'standing_policy'
      and action.approval_state = 'not_required'
      and action.required_capability = request.required_capability
      and request.channel = 'internal',
    'originalReceipt', case when request.execution_mode = 'reverse' then original_receipt.result else null end,
    'originalPayload', case when request.execution_mode = 'reverse' then original_request.typed_parameters else null end
  ) into context_value
  from public.execution_requests request
  left join public.actions action on action.id = request.action_id and action.user_id = request.user_id
  left join public.execution_receipts original_receipt on request.execution_mode = 'reverse'
    and original_receipt.id = nullif(request.typed_parameters->>'originalReceiptId','')::uuid
    and original_receipt.user_id = request.user_id
  left join public.execution_requests original_request on original_request.id = original_receipt.execution_request_id
    and original_request.user_id = request.user_id
  where request.id = p_execution_request_id;
  return context_value;
end $$;

create or replace function public.load_prompt_promotion_target(
  p_template_id uuid,
  p_target_version integer
) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'managerCode', manager.code,
    'templateCode', template.code,
    'activeVersion', template.active_version,
    'targetVersion', version.version,
    'evaluationStatus', version.evaluation_status,
    'evaluationPassed', coalesce((version.evaluation_result->>'passed')::boolean, false)
  )
  from public.prompt_templates template
  join public.managers manager on manager.id = template.manager_id
  join public.prompt_versions version on version.template_id = template.id and version.version = p_target_version
  where template.id = p_template_id and manager.code = 'systems'
    and template.code = 'controlled-agent-report'
$$;

create or replace function public.request_canonical_action_reversal(
  p_original_receipt_id uuid,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user_id uuid := auth.uid(); receipt_row public.execution_receipts; original_request public.execution_requests; action_row public.actions; existing_request public.execution_requests; request_id uuid;
begin
  if v_user_id is null or not public.is_allowed_aal2() then
    raise exception 'aal2_verification_required';
  end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,200}$' then
    raise exception 'invalid_canonical_action_reversal_key';
  end if;
  select * into existing_request from public.execution_requests request
    where request.user_id = v_user_id and request.idempotency_key = p_idempotency_key;
  if found then
    if existing_request.execution_mode = 'reverse'
       and existing_request.typed_parameters->>'originalReceiptId' = p_original_receipt_id::text then
      return jsonb_build_object('executionRequestId', existing_request.id, 'replayed', true);
    end if;
    raise exception 'canonical_action_reversal_idempotency_conflict';
  end if;
  select * into receipt_row from public.execution_receipts receipt
    where receipt.id = p_original_receipt_id and receipt.user_id = v_user_id for update;
  if not found or receipt_row.kind not in ('succeeded','partially_succeeded')
     or receipt_row.result->>'reversalToken' is null
     or receipt_row.result->>'actionType' <> 'review_prompt_promotion' then
    raise exception 'canonical_action_receipt_not_reversible';
  end if;
  select * into original_request from public.execution_requests request
    where request.id = receipt_row.execution_request_id and request.user_id = v_user_id;
  select * into action_row from public.actions action
    where action.id = receipt_row.action_id and action.user_id = v_user_id for update;
  if not found or action_row.status <> 'reversible'
     or action_row.authority = 'standing_policy'
     or original_request.action_id is distinct from action_row.id then
    raise exception 'canonical_action_not_reversible';
  end if;
  if exists (
    select 1 from public.execution_receipts prior_reversal
    where prior_reversal.user_id = v_user_id and prior_reversal.kind = 'reversed'
      and prior_reversal.result->>'reversesReceiptId' = p_original_receipt_id::text
  ) then
    raise exception 'canonical_action_already_reversed';
  end if;
  request_id := gen_random_uuid();
  insert into public.execution_requests(
    id,user_id,workflow_run_id,action_id,approval_id,conversation_id,source_message_id,
    interpreting_manager_code,authority,status,command_type,command_version,intent,typed_parameters,
    target_type,target_reference,scope,mechanism,required_capability,channel,idempotency_key,
    correlation_id,execution_mode
  ) values (
    request_id,v_user_id,original_request.workflow_run_id,action_row.id,original_request.approval_id,
    original_request.conversation_id,original_request.source_message_id,original_request.interpreting_manager_code,
    action_row.authority,'queued',original_request.command_type,original_request.command_version,
    'Reverse a previously completed action',
    original_request.typed_parameters || jsonb_build_object('originalReceiptId',p_original_receipt_id),
    original_request.target_type,original_request.target_reference,original_request.scope,
    original_request.mechanism,original_request.required_capability,'web_chat',p_idempotency_key,
    gen_random_uuid(),'reverse'
  );
  insert into public.audit_events(user_id,actor_type,action_type,target_type,target_id,aal,correlation_id,result,redacted_after)
    values(v_user_id,'user','canonical_action_reversal_requested','execution_request',request_id::text,'aal2',
      (select correlation_id from public.execution_requests where id=request_id), 'success',
      jsonb_build_object('originalReceiptId',p_original_receipt_id,'actionId',action_row.id));
  return jsonb_build_object('executionRequestId',request_id,'replayed',false);
end $$;

revoke all on function public.lookup_canonical_action_execution(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.record_canonical_action_policy_decision(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.claim_canonical_action_execution(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.complete_canonical_action_execution(uuid,uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.load_canonical_action_execution_request(uuid) from public, anon, authenticated;
revoke all on function public.load_prompt_promotion_target(uuid,integer) from public, anon, authenticated;
revoke all on function public.request_canonical_action_reversal(uuid,text) from public, anon;
grant execute on function public.lookup_canonical_action_execution(uuid,uuid,text,text) to service_role;
grant execute on function public.record_canonical_action_policy_decision(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.claim_canonical_action_execution(uuid,uuid,text,text) to service_role;
grant execute on function public.complete_canonical_action_execution(uuid,uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.load_canonical_action_execution_request(uuid) to service_role;
grant execute on function public.load_prompt_promotion_target(uuid,integer) to service_role;
grant execute on function public.request_canonical_action_reversal(uuid,text) to authenticated;
