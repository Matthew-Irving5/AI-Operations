-- Atomic, owner-scoped persistence for canonical action execution.
alter table public.execution_requests
  add column channel public.conversation_channel,
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
alter table public.execution_receipts add constraint execution_receipts_error_kind_check
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
  if request_row.request_fingerprint is not null and request_row.request_fingerprint <> p_request_fingerprint then
    return false;
  end if;
  if request_row.policy_decision is not null and request_row.policy_decision <> p_policy_decision and not (
    request_row.policy_decision->>'decision' = 'approval_required'
      and p_policy_decision->>'decision' = 'allow'
      and request_row.authority = 'agent_proposal'
      and exists(select 1 from public.actions where id = request_row.action_id and user_id = p_user_id and approval_state = 'approved')
  ) and not (
    request_row.policy_decision->>'decision' = 'reauth_required'
      and p_policy_decision->>'decision' = 'allow'
      and request_row.authority = 'verified_user'
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
  if request_row.authority = 'verified_user' and request_row.channel = 'web_chat'
     and coalesce((request_row.policy_decision->>'freshWebAal2Required')::boolean, false)
     and not exists(select 1 from public.mfa_reauthentication_events where user_id = p_user_id and verified_at >= now() - interval '5 minutes') then
    return jsonb_build_object('kind','conflict');
  end if;
  token := gen_random_uuid();
  update public.execution_requests set status = 'running', claim_token = token, claimed_at = now(),
    attempt_count = attempt_count + 1
    where id = p_execution_request_id and user_id = p_user_id;
  if request_row.action_id is not null and action_row.id is not null then
    if action_row.status in ('proposed','approved') then
      update public.actions set status='queued', updated_at=now() where id=action_row.id and user_id=p_user_id;
      update public.actions set status='running', updated_at=now() where id=action_row.id and user_id=p_user_id;
    elsif action_row.status in ('queued','waiting_for_dependency') then
      update public.actions set status='running', updated_at=now() where id=action_row.id and user_id=p_user_id;
    else
      raise exception 'canonical_action_not_executable';
    end if;
  end if;
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
     or kind_value not in ('waiting_for_dependency','succeeded','partially_succeeded','failed')
     or p_receipt->>'attempt' <> request_row.attempt_count::text
     or p_receipt->>'actionType' <> request_row.command_type then
    raise exception 'invalid_canonical_action_receipt';
  end if;
  receipt_id := gen_random_uuid();
  receipt_time := now();
  p_receipt := p_receipt || jsonb_build_object('id',receipt_id,'createdAt',receipt_time);
  terminal_status := case when kind_value = 'waiting_for_dependency' then 'waiting_for_dependency'::public.execution_request_status
    when kind_value in ('succeeded','partially_succeeded') then 'succeeded'::public.execution_request_status
    else 'failed'::public.execution_request_status end;
  action_status := case when kind_value = 'waiting_for_dependency' then 'waiting_for_dependency'
    when kind_value = 'partially_succeeded' then 'partially_succeeded'
    else kind_value end;
  insert into public.execution_receipts(id,execution_request_id,user_id,kind,summary,action_id,result,error_code,redacted_error,correlation_id,idempotency_key,created_at)
  values (receipt_id,p_execution_request_id,p_user_id,kind_value,p_receipt->>'summary',request_row.action_id,p_receipt,
    p_receipt->>'errorCode',p_receipt->>'redactedError',request_row.correlation_id,p_idempotency_key,receipt_time);
  update public.execution_requests set status = terminal_status,
    error_code = case when kind_value = 'failed' then p_receipt->>'errorCode' else null end,
    redacted_error = case when kind_value = 'failed' then p_receipt->>'redactedError' else null end,
    claim_token = null, claimed_at = null
    where id = p_execution_request_id and user_id = p_user_id;
  if request_row.action_id is not null then
    update public.actions set status = action_status, updated_at = now()
      where id = request_row.action_id and user_id = p_user_id and status = 'running';
  end if;
  return jsonb_build_object('kind','persisted','receipt',p_receipt);
end $$;

revoke all on function public.lookup_canonical_action_execution(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.record_canonical_action_policy_decision(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.claim_canonical_action_execution(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.complete_canonical_action_execution(uuid,uuid,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.lookup_canonical_action_execution(uuid,uuid,text,text) to service_role;
grant execute on function public.record_canonical_action_policy_decision(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.claim_canonical_action_execution(uuid,uuid,text,text) to service_role;
grant execute on function public.complete_canonical_action_execution(uuid,uuid,text,text,uuid,jsonb) to service_role;
