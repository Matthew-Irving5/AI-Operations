begin;
select plan(15);

select ok((select count(distinct m.code)=8 from public.manager_capabilities c join public.managers m on m.id=c.manager_id where c.contract_version=1), 'capabilities are seeded for all eight canonical managers');
select ok((select relrowsecurity from pg_class where relname='conversations' and relnamespace='public'::regnamespace), 'canonical conversations enable RLS');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='conversations' and policyname='deny_data_api_clients'), 'conversation Data API access has an explicit deny policy');
select ok(not has_table_privilege('authenticated','public.conversation_messages','SELECT,INSERT,UPDATE,DELETE'), 'authenticated callers have no direct message table access');
select ok(has_table_privilege('service_role','public.conversation_messages','SELECT,INSERT,UPDATE,DELETE'), 'trusted service boundary can operate on messages');

insert into public.conversations(id,user_id,originating_channel,originating_manager_code,current_manager_code,subject,gmail_thread_id)
values ('00000000-0000-4000-8000-000000001001','00000000-0000-0000-0000-000000000101','web_chat','personal','personal','Contract test',null);
insert into public.conversation_participants(conversation_id,user_id,kind,role)
values ('00000000-0000-4000-8000-000000001001','00000000-0000-0000-0000-000000000101','user','owner');
insert into public.conversation_messages(id,conversation_id,user_id,direction,sender_kind,channel,semantic_type,authority,body_text,body_sha256,deduplication_key,created_at)
values ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001001','00000000-0000-0000-0000-000000000101','inbound','user','web_chat','request','verified_user','test',repeat('a',64),'test-message-1',now());

select throws_ok(
  $$insert into public.conversation_messages(conversation_id,user_id,direction,sender_kind,channel,semantic_type,authority,body_text,body_sha256,deduplication_key) values ('00000000-0000-4000-8000-000000001001','00000000-0000-0000-0000-000000000101','inbound','user','web_chat','request','agent_generated','bad',repeat('b',64),'forged-authority')$$,
  '23514', 'message_authority_mismatch', 'transport identity controls message authority'
);
select throws_ok(
  $$insert into public.conversation_messages(conversation_id,user_id,direction,sender_kind,channel,semantic_type,authority,body_text,body_sha256,deduplication_key) values ('00000000-0000-4000-8000-000000001001','00000000-0000-0000-0000-000000000101','inbound','user','web_chat','request','verified_user','duplicate',repeat('c',64),'test-message-1')$$,
  '23505', 'duplicate key value violates unique constraint "conversation_messages_conversation_id_deduplication_key_key"', 'messages are idempotent by conversation and key'
);
select throws_ok(
  $$insert into public.conversation_messages(conversation_id,user_id,direction,sender_kind,channel,semantic_type,authority,body_text,body_sha256,deduplication_key) values ('00000000-0000-4000-8000-000000001099','00000000-0000-0000-0000-000000000101','inbound','user','web_chat','request','verified_user','orphan',repeat('d',64),'orphan-message')$$,
  '23503', 'insert or update on table "conversation_messages" violates foreign key constraint "conversation_messages_conversation_id_user_id_fkey"', 'messages require a conversation owned by the same user'
);
select throws_ok(
  $$update public.conversation_messages set body_text='mutated' where id='00000000-0000-4000-8000-000000001002'$$,
  'P0001', 'append_only_contract_history', 'conversation messages cannot be rewritten'
);

insert into public.conversation_handoffs(user_id,conversation_id,from_manager_code,to_manager_code,reason,idempotency_key)
values ('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000001001','personal','career','contract test','test-handoff-1');
update public.conversation_handoffs set status='accepted' where idempotency_key='test-handoff-1';
select throws_ok(
  $$update public.conversation_handoffs set status='requested' where idempotency_key='test-handoff-1'$$,
  'P0001', 'invalid_agent_contract_transition: conversation_handoffs.accepted -> requested', 'handoff state cannot move backwards'
);
select ok((select current_manager_code='career' from public.conversations where id='00000000-0000-4000-8000-000000001001'), 'accepted handoff changes canonical conversation owner');
select ok((select count(*)=2 from public.conversation_handoff_events where handoff_id=(select id from public.conversation_handoffs where idempotency_key='test-handoff-1')), 'handoff history preserves requested and accepted events');

insert into public.execution_requests(user_id,conversation_id,source_message_id,interpreting_manager_code,authority,command_type,intent,target_type,scope,mechanism,required_capability,idempotency_key)
values ('00000000-0000-0000-0000-000000000101','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001002','personal','verified_user','test-command','test intent','reminder','one reminder','internal','reminder_write','test-execution-1');
update public.execution_requests set status='routed' where idempotency_key='test-execution-1';
update public.execution_requests set status='queued' where idempotency_key='test-execution-1';
update public.execution_requests set status='running' where idempotency_key='test-execution-1';
update public.execution_requests set status='succeeded' where idempotency_key='test-execution-1';
select ok((select status='succeeded' and completed_at is not null from public.execution_requests where idempotency_key='test-execution-1'), 'terminal execution status persists its completion timestamp');
select throws_ok(
  $$insert into public.execution_receipts(execution_request_id,user_id,kind,summary,error_code,correlation_id,idempotency_key) values ((select id from public.execution_requests where idempotency_key='test-execution-1'),'00000000-0000-0000-0000-000000000101','failed','failed test',null,gen_random_uuid(),'failed-receipt-1')$$,
  '23514', 'new row for relation "execution_receipts" violates check constraint "execution_receipts_check"', 'failed receipts require an error code'
);
select ok(not has_table_privilege('authenticated','public.execution_requests','SELECT,INSERT,UPDATE,DELETE'), 'execution requests remain behind authenticated server boundaries');

select * from finish();
rollback;
