begin;
select plan(3);

insert into public.inter_agent_requests(id,user_id,source_manager_code,destination_manager_code,status,objective,required_output_contract,idempotency_key)
values
  ('00000000-0000-4000-8000-000000001011','00000000-0000-0000-0000-000000000101','personal','career','waiting_for_dependency','Complete the delegated work','{}','test-request-complete-after-wait'),
  ('00000000-0000-4000-8000-000000001012','00000000-0000-0000-0000-000000000101','personal','travel','waiting_for_dependency','Reject the delegated work','{}','test-request-reject-after-wait');

select lives_ok(
  $$update public.inter_agent_requests set status='completed',result_reference='00000000-0000-4000-8000-000000001013' where id='00000000-0000-4000-8000-000000001011'$$,
  'a specialist result can complete an inter-agent request after its dependency wait'
);
select lives_ok(
  $$update public.inter_agent_requests set status='rejected' where id='00000000-0000-4000-8000-000000001012'$$,
  'a specialist rejection can settle an inter-agent request after its dependency wait'
);
select ok((select count(*)=2 and bool_and(completed_at is not null) from public.inter_agent_requests where id in ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000001012')),
  'dependency-wait terminal outcomes persist completion timestamps');

select * from finish();
rollback;
