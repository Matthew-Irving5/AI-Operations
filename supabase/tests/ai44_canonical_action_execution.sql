begin;
select plan(31);

insert into public.conversations(id,user_id,originating_channel,originating_manager_code,current_manager_code,subject,gmail_thread_id)
values ('00000000-0000-4000-8000-000000004401','00000000-0000-0000-0000-000000000101','web_chat','systems','systems','AI-44 action contract',null);
insert into public.conversation_participants(conversation_id,user_id,kind,role)
values ('00000000-0000-4000-8000-000000004401','00000000-0000-0000-0000-000000000101','user','owner');
insert into public.conversation_messages(id,conversation_id,user_id,direction,sender_kind,channel,semantic_type,authority,body_text,body_sha256,deduplication_key)
values ('00000000-0000-4000-8000-000000004402','00000000-0000-4000-8000-000000004401','00000000-0000-0000-0000-000000000101','inbound','user','web_chat','request','verified_user','synthetic action request',repeat('a',64),'ai44-action-message');
insert into public.actions(id,user_id,action_type,title,description,risk_class,status,proposed_payload,approval_required,authority,approval_state,required_capability,required_permissions,correlation_id,idempotency_key)
values ('00000000-0000-4000-8000-000000004403','00000000-0000-0000-0000-000000000101','review_prompt_promotion','Synthetic prompt promotion','Canonical execution fixture','high','proposed','{"templateId":"00000000-0000-4000-8000-000000004407","targetVersion":2}',false,'verified_user','not_required','prompt_model_config',array['write','execute'],'00000000-0000-4000-8000-000000004404','ai44-action-success');
insert into public.execution_requests(id,user_id,action_id,conversation_id,source_message_id,interpreting_manager_code,authority,status,command_type,intent,typed_parameters,target_type,target_reference,scope,mechanism,required_capability,channel,idempotency_key,correlation_id)
values ('00000000-0000-4000-8000-000000004405','00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004403','00000000-0000-4000-8000-000000004401','00000000-0000-4000-8000-000000004402','systems','verified_user','queued','review_prompt_promotion','Promote evaluated controlled report prompt','{"templateId":"00000000-0000-4000-8000-000000004407","targetVersion":2}','prompt_template','controlled-agent-report','systems controlled agent report prompt','edge_function','prompt_model_config','web_chat','ai44-execution-1','00000000-0000-4000-8000-000000004406');

select is(public.lookup_canonical_action_execution('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')->>'kind','missing','unclaimed request has no receipt');
select is(public.load_canonical_action_execution_request('00000000-0000-4000-8000-000000004405')->'request'->>'actionType','review_prompt_promotion','service loader returns trusted typed action');
select is(public.load_prompt_promotion_target((select id from public.prompt_templates where code='controlled-agent-report'),1)->>'managerCode','systems','prompt target lookup is scoped to Systems controlled report');
select is(public.record_canonical_action_policy_decision('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{"decision":"reauth_required","reason":"web_action_requires_fresh_aal2","freshWebAal2Required":true}'::jsonb),true,'stale web action records an explicit reauthentication requirement');
select is(public.claim_canonical_action_execution('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')->>'kind','conflict','stale web MFA cannot claim the action');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000101","aal":"aal2"}',true);
insert into public.mfa_reauthentication_events(user_id,method) values ('00000000-0000-0000-0000-000000000101','totp');
select is(public.record_canonical_action_policy_decision('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{"decision":"allow","reason":"verified_user_authority","freshWebAal2Required":true}'::jsonb),true,'fresh reauthentication advances the same request to allow');
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
      'actionId','00000000-0000-4000-8000-000000004403','actionType','review_prompt_promotion','authority','verified_user','channel','web_chat',
      'policyDecision','allow','policyReason','verified_user_authority','kind','succeeded','summary','Synthetic prompt version promoted',
      'resultReference','prompt-template:synthetic:version:2','changedReferences',jsonb_build_array('prompt-template:synthetic:version:2'),'errorCode',null,'redactedError',null,'reversalToken','2:1',
      'idempotencyKey','ai44-execution-1','requestFingerprint','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'correlationId','00000000-0000-4000-8000-000000004406','attempt',1
    )
  ) as result
)
select is(result->>'kind','persisted','valid completion persists one truthful terminal receipt') from completion;

select is((select status from public.actions where id='00000000-0000-4000-8000-000000004403'),'reversible','action with a reversal token becomes reversible');
select ok((select completed_at is not null from public.execution_requests where id='00000000-0000-4000-8000-000000004405'),'terminal execution request records its completion time');
select is((public.lookup_canonical_action_execution('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000004405','ai44-execution-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')->'receipt'->>'kind'),'succeeded','replay returns the original receipt');
select is((select count(*) from public.execution_receipts where user_id='00000000-0000-0000-0000-000000000101' and idempotency_key='ai44-execution-1'),1::bigint,'receipt persistence is unique by user and idempotency key');
select ok(not has_function_privilege('authenticated','public.claim_canonical_action_execution(uuid,uuid,text,text)','EXECUTE'),'claim RPC is unavailable to authenticated clients');
select ok(has_function_privilege('service_role','public.claim_canonical_action_execution(uuid,uuid,text,text)','EXECUTE'),'claim RPC is limited to trusted Edge functions');
select ok((select count(*) >= 1 from public.audit_events where action_type='canonical_action_policy_decision' and target_id='00000000-0000-4000-8000-000000004405'),'policy decision is recorded in append-only audit history');

delete from public.mfa_reauthentication_events where user_id='00000000-0000-0000-0000-000000000101';
create temporary table ai44_reversal_request as
select public.request_canonical_action_reversal(
  (select id from public.execution_receipts where idempotency_key='ai44-execution-1'),
  'ai44-reversal-1'
) as result;
select is((select result->>'replayed' from ai44_reversal_request),'false','authenticated reversal request is created once');
select is((public.request_canonical_action_reversal(
  (select id from public.execution_receipts where idempotency_key='ai44-execution-1'),
  'ai44-reversal-1'
)->>'replayed'),'true','same reversal idempotency key returns its queued request');
select is(public.load_canonical_action_execution_request((select result->>'executionRequestId' from ai44_reversal_request)::uuid)->'request'->>'executionMode','reverse','loaded request retains reversal operation mode');
select is(public.record_canonical_action_policy_decision(
  '00000000-0000-0000-0000-000000000101',
  (select result->>'executionRequestId' from ai44_reversal_request)::uuid,
  'ai44-reversal-1','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  '{"decision":"reauth_required","reason":"web_action_requires_fresh_aal2","freshWebAal2Required":true}'::jsonb
),true,'stale reversal records an explicit reauthentication requirement');
select is(public.claim_canonical_action_execution(
  '00000000-0000-0000-0000-000000000101',
  (select result->>'executionRequestId' from ai44_reversal_request)::uuid,
  'ai44-reversal-1','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
)->>'kind','conflict','stale MFA cannot claim a reversal');
insert into public.mfa_reauthentication_events(user_id,method) values ('00000000-0000-0000-0000-000000000101','totp');
select is(public.record_canonical_action_policy_decision(
  '00000000-0000-0000-0000-000000000101',
  (select result->>'executionRequestId' from ai44_reversal_request)::uuid,
  'ai44-reversal-1','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  '{"decision":"allow","reason":"verified_user_authority","freshWebAal2Required":true}'::jsonb
),true,'fresh MFA authorizes the same reversal request');
create temporary table ai44_reversal_claim as
select public.claim_canonical_action_execution(
  '00000000-0000-0000-0000-000000000101',
  (select result->>'executionRequestId' from ai44_reversal_request)::uuid,
  'ai44-reversal-1','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
) as result;
select is((select result->>'kind' from ai44_reversal_claim),'claimed','one reversal claim wins');
select is(public.claim_canonical_action_execution(
  '00000000-0000-0000-0000-000000000101',
  (select result->>'executionRequestId' from ai44_reversal_request)::uuid,
  'ai44-reversal-1','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
)->>'kind','in_progress','concurrent reversal cannot run a second effect');
with reversal_completion as (
  select public.complete_canonical_action_execution(
    '00000000-0000-0000-0000-000000000101',
    (select result->>'executionRequestId' from ai44_reversal_request)::uuid,
    'ai44-reversal-1','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    ((select result->>'claimToken' from ai44_reversal_claim))::uuid,
    jsonb_build_object(
      'contractVersion',1,'userId','00000000-0000-0000-0000-000000000101',
      'executionRequestId',(select result->>'executionRequestId' from ai44_reversal_request),
      'actionId','00000000-0000-4000-8000-000000004403','actionType','review_prompt_promotion',
      'authority','verified_user','channel','web_chat','policyDecision','allow',
      'policyReason','verified_user_authority','kind','reversed','summary','Prior prompt version restored',
      'resultReference','prompt-template:synthetic:version:1','changedReferences',jsonb_build_array('prompt-template:synthetic:version:2'),
      'errorCode',null,'redactedError',null,'reversalToken',null,
      'reversesReceiptId',(select id from public.execution_receipts where idempotency_key='ai44-execution-1'),
      'idempotencyKey','ai44-reversal-1','requestFingerprint','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'correlationId',(select correlation_id from public.execution_requests where id=(select result->>'executionRequestId' from ai44_reversal_request)::uuid),
      'attempt',1
    )
  ) as result
)
select is(result->>'kind','persisted','reversal persists one truthful linked receipt') from reversal_completion;
select is((select status from public.actions where id='00000000-0000-4000-8000-000000004403'),'reversed','action reaches reversed only after its receipt persists');
select is((public.lookup_canonical_action_execution(
  '00000000-0000-0000-0000-000000000101',
  (select result->>'executionRequestId' from ai44_reversal_request)::uuid,
  'ai44-reversal-1','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
)->'receipt'->>'reversesReceiptId'),(select id::text from public.execution_receipts where idempotency_key='ai44-execution-1'),'reversal replay returns its original linked receipt');
select ok(has_function_privilege('authenticated','public.request_canonical_action_reversal(uuid,text)','EXECUTE'),'users can request an owned reversal through the authenticated RPC');
select ok(not has_function_privilege('anon','public.request_canonical_action_reversal(uuid,text)','EXECUTE'),'anonymous users cannot request reversals');
select ok(not has_function_privilege('authenticated','public.load_canonical_action_execution_request(uuid)','EXECUTE'),'request loader stays service-only');

select * from finish();
rollback;
