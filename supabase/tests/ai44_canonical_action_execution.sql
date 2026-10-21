begin;
select plan(12);

insert into public.conversations(id,user_id,originating_channel,originating_manager_code,current_manager_code,subject,gmail_thread_id)
values ('00000000-0000-4000-8000-000000004401','00000000-0000-0000-0000-000000000101','web_chat','personal','personal','AI-44 action contract',null);
insert into public.conversation_participants(conversation_id,user_id,kind,role)
values ('00000000-0000-4000-8000-000000004401','00000000-0000-0000-0000-000000000101','user','owner');
insert into public.conversation_messages(id,conversation_id,user_id,direction,sender_kind,channel,semantic_type,authority,body_text,body_sha256,deduplication_key)
values ('00000000-0000-4000-8000-000000004402','00000000-0000-4000-8000-000000004401','00000000-0000-0000-0000-000000000101','inbound','user','web_chat','request','verified_user','synthetic action request',repeat('a',64),'ai44-action-message');
insert into public.actions(id,user_id,action_type,title,description,risk_class,status,proposed_payload,approval_required,authority,approval_state,required_capability,required_permissions,correlation_id,idempotency_key)
values ('00000000-0000-4000-8000-000000004403','00000000-0000-0000-0000-000000000101','google_task_create','Synthetic task','Canonical execution fixture','low','proposed','{"task":"synthetic"}',false,'verified_user','not_required','reminder_write',array['write','execute'],'00000000-0000-4000-8000-000000004404','ai44-action-success');
insert into public.execution_requests(id,user_id,action_id,conversation_id,source_message_id,interpreting_manager_code,authority,status,command_type,intent,typed_parameters,target_type,scope,mechanism,required_capability,channel,idempotency_key,correlation_id)
values ('00000000-0000-4000-8000-000000004405','00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004403','00000000-0000-4000-8000-000000004401','00000000-0000-4000-8000-000000004402','personal','verified_user','queued','google_task_create','Create synthetic task','{"task":"synthetic"}','task','one task','provider_api','reminder_write','web_chat','ai44-execution-1','00000000-0000-4000-8000-000000004406');

select is(public.lookup_canonical_action_execution('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')->>'kind','missing','unclaimed request has no receipt');
select is(public.record_canonical_action_policy_decision('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{"decision":"allow","reason":"verified_user_authority","freshWebAal2Required":false}'::jsonb),true,'policy decision binds a request fingerprint once');
create temporary table ai44_action_claim as
select public.claim_canonical_action_execution('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') as result;
select is((select result->>'kind' from ai44_action_claim),'claimed','first claim wins atomically');
select is(public.claim_canonical_action_execution('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')->>'kind','in_progress','concurrent claim cannot execute again');
select is(public.lookup_canonical_action_execution('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')->>'kind','conflict','same idempotency scope with different fingerprint conflicts');

with completion as (
  select public.complete_canonical_action_execution(
    '00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ((select result->>'claimToken' from ai44_action_claim))::uuid,
    jsonb_build_object(
      'contractVersion',1,'userId','00000000-0000-0000-0000-000000000101','executionRequestId','00000000-0000-4000-8000-000000004405',
      'actionId','00000000-0000-4000-8000-000000004403','actionType','google_task_create','authority','verified_user','channel','web_chat',
      'policyDecision','allow','policyReason','verified_user_authority','kind','succeeded','summary','Synthetic task applied',
      'resultReference',null,'changedReferences',jsonb_build_array('task:synthetic'),'errorCode',null,'redactedError',null,'reversalToken','undo:synthetic',
      'idempotencyKey','ai44-execution-1','requestFingerprint','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'correlationId','00000000-0000-4000-8000-000000004406','attempt',1
    )
  ) as result
)
select is(result->>'kind','persisted','valid completion persists one truthful terminal receipt') from completion;

select is((select status from public.actions where id='00000000-0000-4000-8000-000000004403'),'succeeded','action state follows its persisted receipt');
select is((public.lookup_canonical_action_execution('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')->'receipt'->>'kind'),'succeeded','replay returns the original receipt');
select is((select count(*) from public.execution_receipts where user_id='00000000-0000-0000-0000-000000000101' and idempotency_key='ai44-execution-1'),1::bigint,'receipt persistence is unique by user and idempotency key');
select ok(not has_function_privilege('authenticated','public.claim_canonical_action_execution(uuid,uuid,text,text)','EXECUTE'),'claim RPC is unavailable to authenticated clients');
select ok(has_function_privilege('service_role','public.claim_canonical_action_execution(uuid,uuid,text,text)','EXECUTE'),'claim RPC is limited to trusted Edge functions');
select ok((select count(*) >= 1 from public.audit_events where action_type='canonical_action_policy_decision' and target_id='00000000-0000-4000-8000-000000004405'),'policy decision is recorded in append-only audit history');

select * from finish();
rollback;
