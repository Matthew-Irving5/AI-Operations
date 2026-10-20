begin;

alter table public.prompt_versions
  add column model_route text not null default 'gpt-5.6-terra'
    check (model_route in ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol')),
  add column schema_version integer not null default 1 check (schema_version > 0),
  add column tool_policy_version integer not null default 1 check (tool_policy_version > 0),
  add column tool_policy jsonb not null default '{"version":1,"tools":[]}'::jsonb
    check (jsonb_typeof(tool_policy) = 'object'),
  add column evaluation_result jsonb;

alter table public.ai_calls
  add column schema_version integer,
  add column tool_policy_version integer,
  add column model_route text;

update public.prompt_versions as version
set json_schema = $schema${
  "type":"object","additionalProperties":false,
  "required":["summary","findings","recommendations","actions","alerts","evidence","uncertainties","report_sections"],
  "properties":{
    "summary":{"type":"string"},
    "findings":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["claim","evidenceIds"],"properties":{"claim":{"type":"string"},"evidenceIds":{"type":"array","items":{"type":"string"}}}}},
    "recommendations":{"type":"array","items":{"type":"string"}},
    "actions":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["type","title","risk"],"properties":{"type":{"type":"string"},"title":{"type":"string"},"risk":{"type":"string","enum":["low","medium","high","critical"]}}}},
    "alerts":{"type":"array","items":{"type":"string"}},
    "evidence":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["id","source"],"properties":{"id":{"type":"string"},"source":{"type":"string"}}}},
    "uncertainties":{"type":"array","items":{"type":"string"}},
    "report_sections":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["code","title","content"],"properties":{"code":{"type":"string"},"title":{"type":"string"},"content":{"type":"string"}}}}
  }
}$schema$::jsonb
from public.prompt_templates as template
join public.managers as manager on manager.id = template.manager_id
where version.template_id = template.id
  and template.code = 'controlled-agent-report'
  and manager.code = 'systems';

create table public.prompt_version_transitions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.prompt_templates(id),
  actor_user_id uuid not null references auth.users(id),
  operation text not null check (operation in ('promote', 'rollback')),
  previous_version integer,
  active_version integer not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,200}$'),
  evaluation_result jsonb,
  created_at timestamptz not null default now(),
  unique (template_id, idempotency_key)
);
alter table public.prompt_version_transitions enable row level security;
create policy prompt_version_transitions_deny_api
  on public.prompt_version_transitions for all to public
  using (false) with check (false);
revoke all on public.prompt_version_transitions from anon, authenticated, service_role;

create or replace function public.guard_ai16_prompt_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('ai.prompt_governance_rpc', true) is distinct from 'on' then
    raise exception 'prompt_version_changes_require_governance_rpc';
  end if;
  if row(
    new.template_id, new.version, new.system_text, new.developer_text,
    new.json_schema, new.model_route, new.schema_version,
    new.tool_policy_version, new.tool_policy
  ) is distinct from row(
    old.template_id, old.version, old.system_text, old.developer_text,
    old.json_schema, old.model_route, old.schema_version,
    old.tool_policy_version, old.tool_policy
  ) then
    raise exception 'prompt_version_content_is_immutable';
  end if;
  if new.evaluation_status is distinct from old.evaluation_status
    or new.evaluation_result is distinct from old.evaluation_result then
    if new.evaluation_status not in ('evaluated', 'approved', 'promoted')
      or new.evaluation_result is null then
      raise exception 'invalid_prompt_evaluation_transition';
    end if;
    if new.evaluation_status in ('approved', 'promoted')
      and coalesce((new.evaluation_result ->> 'passed')::boolean, false) is not true then
      raise exception 'prompt_evaluation_gate_failed';
    end if;
  end if;
  return new;
end;
$$;

create trigger ai16_prompt_version_immutable
before update on public.prompt_versions
for each row execute function public.guard_ai16_prompt_version();

create or replace function public.guard_ai16_prompt_active_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.active_version is distinct from old.active_version
    and current_setting('ai.prompt_governance_rpc', true) is distinct from 'on' then
    raise exception 'prompt_activation_requires_governance_rpc';
  end if;
  return new;
end;
$$;
create trigger ai16_prompt_activation_guard
before update of active_version on public.prompt_templates
for each row execute function public.guard_ai16_prompt_active_version();

create or replace function public.bind_ai16_call_governance()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.prompt_version_id is null then return new; end if;
  select version.schema_version, version.tool_policy_version, version.model_route
    into new.schema_version, new.tool_policy_version, new.model_route
  from public.prompt_versions as version
  where version.id = new.prompt_version_id;
  if new.schema_version is null or new.tool_policy_version is null or new.model_route is null then
    raise exception 'prompt_governance_version_unavailable';
  end if;
  return new;
end;
$$;
create trigger ai16_bind_call_governance
before insert on public.ai_calls
for each row execute function public.bind_ai16_call_governance();

revoke all on function public.guard_ai16_prompt_version(),
  public.guard_ai16_prompt_active_version(),
  public.bind_ai16_call_governance()
  from public, anon, authenticated, service_role;

create or replace function public.record_prompt_evaluation(
  p_prompt_version_id uuid,
  p_evaluation_result jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_evaluation_result) is distinct from 'object'
    or (p_evaluation_result ->> 'caseCount')::integer is distinct from 24
    or (p_evaluation_result ->> 'managerCount')::integer is distinct from 8
    or jsonb_typeof(p_evaluation_result -> 'passed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result -> 'safetyPassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result -> 'evidencePassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result -> 'toolAuthorityPassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result -> 'schemaPassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result -> 'costPassed') is distinct from 'boolean'
    or jsonb_typeof(p_evaluation_result -> 'latencyPassed') is distinct from 'boolean' then
    raise exception 'invalid_prompt_evaluation_result';
  end if;
  perform set_config('ai.prompt_governance_rpc', 'on', true);
  update public.prompt_versions
    set evaluation_status = 'evaluated', evaluation_result = p_evaluation_result
    where id = p_prompt_version_id and evaluation_status = 'draft';
  if not found then raise exception 'prompt_version_not_evaluable'; end if;
end;
$$;

create or replace function public.transition_prompt_version(
  p_template_id uuid,
  p_target_version integer,
  p_expected_active_version integer,
  p_actor_user_id uuid,
  p_operation text,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_version integer;
  target_status text;
  target_evaluation jsonb;
  existing_transition public.prompt_version_transitions;
begin
  if p_operation not in ('promote', 'rollback') or p_actor_user_id is null
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,200}$' then
    raise exception 'invalid_prompt_transition';
  end if;
  select * into existing_transition from public.prompt_version_transitions
    where template_id = p_template_id and idempotency_key = p_idempotency_key;
  if found then
    if existing_transition.operation <> p_operation
      or existing_transition.active_version <> p_target_version
      or existing_transition.actor_user_id <> p_actor_user_id then
      raise exception 'prompt_transition_idempotency_conflict';
    end if;
    return jsonb_build_object('active_version', existing_transition.active_version,
      'previous_version', existing_transition.previous_version, 'replayed', true);
  end if;
  select active_version into current_version from public.prompt_templates
    where id = p_template_id for update;
  if not found or current_version is distinct from p_expected_active_version then
    raise exception 'prompt_active_version_conflict';
  end if;
  select evaluation_status, evaluation_result into target_status, target_evaluation
    from public.prompt_versions where template_id = p_template_id and version = p_target_version;
  if not found then raise exception 'prompt_target_version_not_found'; end if;
  if p_operation = 'promote' and (
    target_status not in ('evaluated', 'promoted') or
    coalesce((target_evaluation ->> 'passed')::boolean, false) is not true or
    (target_evaluation ->> 'caseCount')::integer <> 24 or
    (target_evaluation ->> 'managerCount')::integer <> 8 or
    coalesce((target_evaluation ->> 'safetyPassed')::boolean, false) is not true or
    coalesce((target_evaluation ->> 'evidencePassed')::boolean, false) is not true or
    coalesce((target_evaluation ->> 'toolAuthorityPassed')::boolean, false) is not true or
    coalesce((target_evaluation ->> 'schemaPassed')::boolean, false) is not true or
    coalesce((target_evaluation ->> 'costPassed')::boolean, false) is not true or
    coalesce((target_evaluation ->> 'latencyPassed')::boolean, false) is not true
  ) then raise exception 'prompt_evaluation_gate_failed'; end if;
  if p_operation = 'rollback' and target_status not in ('approved', 'promoted') then
    raise exception 'prompt_rollback_target_not_approved';
  end if;
  if p_target_version = current_version then
    raise exception 'prompt_target_already_active';
  end if;
  perform set_config('ai.prompt_governance_rpc', 'on', true);
  update public.prompt_templates set active_version = p_target_version where id = p_template_id;
  if p_operation = 'promote' then
    update public.prompt_versions set evaluation_status = 'promoted'
      where template_id = p_template_id and version = p_target_version;
  end if;
  insert into public.prompt_version_transitions(
    template_id, actor_user_id, operation, previous_version, active_version,
    idempotency_key, evaluation_result
  ) values (
    p_template_id, p_actor_user_id, p_operation, current_version, p_target_version,
    p_idempotency_key, target_evaluation
  );
  return jsonb_build_object('active_version', p_target_version,
    'previous_version', current_version, 'replayed', false);
end;
$$;

revoke all on function public.record_prompt_evaluation(uuid, jsonb),
  public.transition_prompt_version(uuid, integer, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_prompt_evaluation(uuid, jsonb),
  public.transition_prompt_version(uuid, integer, integer, uuid, text, text) to service_role;

commit;
