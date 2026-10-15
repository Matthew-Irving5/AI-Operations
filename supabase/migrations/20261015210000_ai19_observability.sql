create or replace function public.record_conversation_handoff_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_user_id uuid;
  audit_aal text;
begin
  insert into public.conversation_handoff_events(
    handoff_id,user_id,status,actor_manager_code,correlation_id,created_at
  ) values (
    new.id,new.user_id,new.status,null,new.correlation_id,now()
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
end
$$;

revoke all on function public.record_conversation_handoff_event()
  from public, anon, authenticated, service_role;

create or replace function public.transition_ai14_contract_handoff(
  p_user_id uuid,
  p_handoff_id uuid,
  p_status public.handoff_status,
  p_aal2_verified boolean
)
returns setof public.conversation_handoffs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_aal2_verified is distinct from true then
    raise exception 'aal2_verification_required';
  end if;

  perform 1
  from public.conversation_handoffs
  where id = p_handoff_id and user_id = p_user_id
  for update;
  if not found then
    return;
  end if;

  perform set_config('ai19.actor_user_id', p_user_id::text, true);
  perform set_config('ai19.actor_aal', 'aal2', true);

  return query
  update public.conversation_handoffs
  set status = p_status
  where id = p_handoff_id and user_id = p_user_id
  returning *;
end
$$;

revoke all on function public.transition_ai14_contract_handoff(uuid,uuid,public.handoff_status,boolean) from public, anon, authenticated;
grant execute on function public.transition_ai14_contract_handoff(uuid,uuid,public.handoff_status,boolean) to service_role;

create or replace function public.reject_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events_are_append_only';
end
$$;

revoke all on function public.reject_audit_event_mutation()
  from public, anon, authenticated, service_role;

create trigger audit_events_append_only
before update or delete on public.audit_events
for each row execute function public.reject_audit_event_mutation();

alter table public.trace_events
  add column contract_version integer not null default 1 check (contract_version=1),
  add column run_id uuid,
  add column step_id uuid,
  add column ai_call_id uuid,
  add column parent_event_id uuid,
  add column outcome text check (outcome in ('started','succeeded','failed','waiting','skipped')),
  add column environment text check (environment in ('local','test','staging','production')),
  add column build_version text check (build_version is null or length(build_version) between 1 and 120),
  add column occurred_at timestamptz,
  add column archive_reference jsonb check (
    archive_reference is null or (
      jsonb_typeof(archive_reference)='object'
      and (archive_reference - 'objectKey' - 'sha256' - 'sizeBytes' - 'contentType') = '{}'::jsonb
      and archive_reference ?& array['objectKey','sha256','sizeBytes','contentType']
      and jsonb_typeof(archive_reference->'objectKey')='string'
      and length(archive_reference->>'objectKey') between 1 and 1024
      and archive_reference->>'sha256' ~ '^[a-f0-9]{64}$'
      and jsonb_typeof(archive_reference->'sizeBytes')='number'
      and archive_reference->>'sizeBytes' ~ '^[0-9]+$'
      and jsonb_typeof(archive_reference->'contentType')='string'
      and length(archive_reference->>'contentType') between 1 and 120
    )
  );

update public.trace_events set occurred_at = created_at where occurred_at is null;
update public.trace_events set outcome = case
  when event_type ~ '(_started|_running)$' then 'started'
  when event_type ~ '(_succeeded|_completed)$' then 'succeeded'
  when event_type ~ '(_failed|_dead_lettered)$' then 'failed'
  when event_type ~ '(_waiting|_retry_scheduled|_awaiting_provider)$' then 'waiting'
  when event_type ~ '_skipped$' then 'skipped'
  else null
end where outcome is null;

create index trace_events_run_occurred_idx on public.trace_events(run_id, occurred_at desc) where run_id is not null;
create index trace_events_parent_idx on public.trace_events(parent_event_id) where parent_event_id is not null;

create or replace function public.enrich_trace_event_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payload jsonb;
  payload_run_id uuid;
  payload_job_id uuid;
  payload_call_id uuid;
  payload_step_id uuid;
  payload_step_code text;
  linked_run_id uuid;
  matching_run_count bigint;
begin
  payload := case when jsonb_typeof(new.redacted_payload) = 'object' then new.redacted_payload else '{}'::jsonb end;
  new.occurred_at := coalesce(new.occurred_at,new.created_at,clock_timestamp());
  new.environment := coalesce(new.environment,case when payload->>'environment' in ('local','test','staging','production') then payload->>'environment' end);
  new.build_version := coalesce(new.build_version,nullif(left(payload->>'build_version',120),''));
  new.archive_reference := coalesce(new.archive_reference,case when jsonb_typeof(payload->'archived_payload')='object' then payload->'archived_payload' end);
  new.outcome := coalesce(new.outcome,case
    when new.event_type ~ '(_started|_running)$' then 'started'
    when new.event_type ~ '(_succeeded|_completed)$' then 'succeeded'
    when new.event_type ~ '(_failed|_dead_lettered)$' then 'failed'
    when new.event_type ~ '(_waiting|_retry_scheduled|_awaiting_provider)$' then 'waiting'
    when new.event_type ~ '_skipped$' then 'skipped'
  end);

  if coalesce(payload->>'run_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    payload_run_id := (payload->>'run_id')::uuid;
  end if;
  if coalesce(payload->>'job_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    payload_job_id := (payload->>'job_id')::uuid;
  end if;
  if coalesce(payload->>'call_id',payload->>'ai_call_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    payload_call_id := coalesce(payload->>'call_id',payload->>'ai_call_id')::uuid;
  end if;
  if coalesce(payload->>'step_id',payload->>'run_step_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    payload_step_id := coalesce(payload->>'step_id',payload->>'run_step_id')::uuid;
  end if;

  new.ai_call_id := coalesce(new.ai_call_id,payload_call_id);
  new.step_id := coalesce(new.step_id,payload_step_id);
  payload_step_code := coalesce(payload->>'step_code',payload->>'step');

  if new.run_id is null and payload_run_id is not null then
    select r.id into new.run_id from public.workflow_runs r
    where r.id=payload_run_id and r.user_id=new.user_id and r.correlation_id=new.correlation_id;
    if new.run_id is null then raise exception 'trace_run_context_mismatch'; end if;
  end if;
  if new.run_id is null and payload_job_id is not null then
    select r.id into new.run_id from public.job_queue q
    join public.workflow_runs r on r.id=q.run_id
    where q.id=payload_job_id and q.user_id=new.user_id and r.correlation_id=new.correlation_id;
    if new.run_id is null then raise exception 'trace_job_context_mismatch'; end if;
  end if;
  if new.run_id is null and new.ai_call_id is not null then
    select c.run_id into linked_run_id from public.ai_calls c
    where c.id=new.ai_call_id and c.user_id=new.user_id;
    if not found then raise exception 'trace_ai_call_context_mismatch'; end if;
    if linked_run_id is not null then
      select r.id into new.run_id from public.workflow_runs r
      where r.id=linked_run_id and r.user_id=new.user_id and r.correlation_id=new.correlation_id;
      if new.run_id is null then raise exception 'trace_ai_call_context_mismatch'; end if;
    end if;
  end if;
  if new.run_id is null then
    select count(*) into matching_run_count from public.workflow_runs r
    where r.user_id=new.user_id and r.correlation_id=new.correlation_id;
    if matching_run_count = 1 then
      select r.id into new.run_id from public.workflow_runs r
      where r.user_id=new.user_id and r.correlation_id=new.correlation_id;
    end if;
  end if;

  if new.run_id is not null and not exists (
    select 1 from public.workflow_runs r where r.id=new.run_id and r.user_id=new.user_id and r.correlation_id=new.correlation_id
  ) then
    raise exception 'trace_run_context_mismatch';
  end if;
  if new.ai_call_id is not null and not exists (
    select 1 from public.ai_calls c where c.id=new.ai_call_id and c.user_id=new.user_id and c.run_id=new.run_id
  ) then
    raise exception 'trace_ai_call_context_mismatch';
  end if;

  if new.step_id is null and new.run_id is not null and payload_step_code is not null then
    select s.id into new.step_id from public.run_steps s where s.run_id=new.run_id and s.step_code=payload_step_code;
  end if;
  if new.step_id is not null and new.run_id is not null and not exists (
    select 1 from public.run_steps s where s.id=new.step_id and s.run_id=new.run_id
  ) then
    raise exception 'trace_step_context_mismatch';
  end if;

  if new.parent_event_id is null and coalesce(payload->>'parent_event_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    new.parent_event_id := (payload->>'parent_event_id')::uuid;
  end if;
  if new.parent_event_id is null and new.run_id is not null then
    select parent.id into new.parent_event_id from public.trace_events parent
    where parent.run_id=new.run_id order by parent.occurred_at desc,parent.created_at desc limit 1;
  end if;
  if new.parent_event_id is not null and not exists (
    select 1 from public.trace_events parent where parent.id=new.parent_event_id and parent.user_id=new.user_id and parent.correlation_id=new.correlation_id
  ) then
    raise exception 'trace_parent_context_mismatch';
  end if;
  return new;
end
$$;

revoke all on function public.enrich_trace_event_metadata()
  from public, anon, authenticated, service_role;

create trigger trace_event_metadata_before_insert
before insert on public.trace_events
for each row execute function public.enrich_trace_event_metadata();

create or replace function public.record_workflow_step_trace_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  run_row record;
  step_row public.run_steps%rowtype;
  parent_event uuid;
  event_name text;
begin
  select r.user_id,r.correlation_id into run_row from public.workflow_runs r where r.id=new.run_id;
  select s.* into step_row from public.run_steps s where s.run_id=new.run_id and s.step_code=new.step_code;
  if run_row.user_id is null or step_row.id is null then raise exception 'workflow_step_trace_context_missing'; end if;
  select e.id into parent_event from public.trace_events e where e.run_id=new.run_id order by e.occurred_at desc,e.created_at desc limit 1;
  event_name := case when new.status='running' then 'workflow_step_started' else 'workflow_step_'||new.status::text end;
  insert into public.trace_events(
    user_id,correlation_id,event_type,severity,redacted_payload,run_id,step_id,parent_event_id
  ) values (
    run_row.user_id,run_row.correlation_id,event_name,
    case when new.status='failed' then 'error' else 'info' end,
    jsonb_build_object('run_id',new.run_id,'step_id',step_row.id,'step_code',new.step_code,'attempt',new.attempt_number,'status',new.status),
    new.run_id,step_row.id,parent_event
  );
  return new;
end
$$;

revoke all on function public.record_workflow_step_trace_event()
  from public, anon, authenticated, service_role;

create trigger run_step_attempt_trace_insert
after insert on public.run_step_attempts
for each row execute function public.record_workflow_step_trace_event();
create trigger run_step_attempt_trace_transition
after update of status on public.run_step_attempts
for each row when (old.status is distinct from new.status)
execute function public.record_workflow_step_trace_event();
