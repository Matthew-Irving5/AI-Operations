begin;
select plan(9);

create temporary table ai19_fixture_owner (user_id uuid not null, email text not null) on commit drop;
do $fixture$
declare target_email text; target_user_id uuid;
begin
  select (regexp_match(pg_get_constraintdef(oid), $pattern$'([^']+)'$pattern$))[1] into target_email
  from pg_constraint where conrelid = 'public.app_users'::regclass and conname = 'app_users_email_check';
  select id into target_user_id from public.app_users where lower(email) = lower(target_email);
  if target_user_id is null then
    select id into target_user_id from auth.users where lower(email) = lower(target_email) limit 1;
    if target_user_id is null then
      target_user_id := '00000000-0000-0000-0000-000000000419';
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values ('00000000-0000-0000-0000-000000000000',target_user_id,'authenticated','authenticated',target_email,crypt('synthetic-only',gen_salt('bf')),now(),'{}'::jsonb,'{}'::jsonb,now(),now());
    end if;
    insert into public.app_users (id,email,is_allowed) values (target_user_id,target_email,true)
    on conflict (id) do update set is_allowed=true;
  end if;
  insert into ai19_fixture_owner values (target_user_id,target_email);
end;
$fixture$;

select has_column('public','trace_events','run_id','trace events expose a direct run link');
select has_column('public','trace_events','ai_call_id','trace events expose a direct AI call link');
select has_column('public','trace_events','step_id','trace events expose a direct workflow step link');
select has_column('public','trace_events','archive_reference','trace events expose typed archive metadata');

insert into public.workflow_runs(id,user_id,workflow_definition_id,status,trigger,correlation_id,idempotency_key)
select '00000000-0000-4000-8000-000000000419',(select user_id from ai19_fixture_owner),id,'running','test','00000000-0000-4000-8000-000000000429','ai19-observability-run'
from public.workflow_definitions where code='systems-weekly-quality-platform'
on conflict (id) do nothing;
insert into public.job_queue(user_id,run_id,job_type,payload,deduplication_key)
values ((select user_id from ai19_fixture_owner),'00000000-0000-4000-8000-000000000419','workflow_execute','{}'::jsonb,'ai19-observability-job')
on conflict (deduplication_key) do nothing;
insert into public.ai_calls(id,user_id,run_id,status)
values ('00000000-0000-4000-8000-000000000439',(select user_id from ai19_fixture_owner),'00000000-0000-4000-8000-000000000419','submitted')
on conflict (id) do nothing;

insert into public.trace_events(user_id,correlation_id,event_type,redacted_payload,environment,build_version,archive_reference)
values (
  (select user_id from ai19_fixture_owner),'00000000-0000-4000-8000-000000000429','ai19_result_fixture',
  jsonb_build_object('run_id','00000000-0000-4000-8000-000000000419','call_id','00000000-0000-4000-8000-000000000439','environment','test','build_version','ai19-test'),
  null,null,
  '{"objectKey":"test/ai19/event.json.zst","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sizeBytes":12,"contentType":"application/json"}'::jsonb
);
select ok((select run_id='00000000-0000-4000-8000-000000000419' and ai_call_id='00000000-0000-4000-8000-000000000439' and occurred_at is not null from public.trace_events where event_type='ai19_result_fixture'), 'trace enrichment resolves run and AI call links from existing event metadata');
select ok((select environment='test' and build_version='ai19-test' and archive_reference->>'sha256'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' from public.trace_events where event_type='ai19_result_fixture'), 'trace enrichment preserves environment, build and archive metadata');

select public.record_workflow_stage('00000000-0000-4000-8000-000000000419','ai_execution',1,'running','input:synthetic',null,null);
select public.record_workflow_stage('00000000-0000-4000-8000-000000000419','ai_execution',1,'succeeded','input:synthetic','output:synthetic',null);
select ok((select count(*)=2 from public.trace_events where run_id='00000000-0000-4000-8000-000000000419' and event_type in ('workflow_step_started','workflow_step_succeeded')), 'workflow execution stages append started and completed trace events');
select ok((select count(distinct step_id)=1 and bool_and(parent_event_id is not null) from public.trace_events where run_id='00000000-0000-4000-8000-000000000419' and event_type in ('workflow_step_started','workflow_step_succeeded')), 'stage events share the canonical step ID and link to their parent events');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='trace_events' and policyname='own_traces' and cmd='SELECT' and qual like '%auth.uid()%'), 'trace reads remain protected by the owner-scoped RLS policy');

select * from finish();
rollback;
