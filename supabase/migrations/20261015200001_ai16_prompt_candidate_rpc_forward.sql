begin;

create or replace function public.guard_ai16_prompt_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1 from public.prompt_templates template
    join public.managers manager on manager.id = template.manager_id
    where template.id = new.template_id
      and template.code = 'controlled-agent-report'
      and manager.code = 'systems'
  ) then
    return new;
  end if;
  if current_setting('ai.prompt_governance_rpc', true) is distinct from 'on' then
    raise exception 'prompt_version_changes_require_governance_rpc';
  end if;
  if tg_op = 'INSERT' then
    if new.evaluation_status <> 'draft' or new.evaluation_result is not null then
      raise exception 'prompt_candidate_must_start_as_draft';
    end if;
    return new;
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

create trigger ai16_prompt_candidate_insert_guard
before insert on public.prompt_versions
for each row execute function public.guard_ai16_prompt_version();

create or replace function public.create_prompt_candidate(
  p_template_id uuid,
  p_system_text text,
  p_developer_text text,
  p_json_schema jsonb,
  p_model_route text,
  p_schema_version integer,
  p_tool_policy_version integer,
  p_tool_policy jsonb
) returns table(id uuid, version integer)
language plpgsql security definer set search_path = public as $$
declare
  next_version integer;
begin
  if p_system_text is null or length(btrim(p_system_text)) = 0 or length(p_system_text) > 20000
    or p_developer_text is null or length(btrim(p_developer_text)) = 0 or length(p_developer_text) > 20000
    or jsonb_typeof(p_json_schema) is distinct from 'object'
    or p_model_route not in ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol')
    or p_schema_version is null or p_schema_version < 1
    or p_tool_policy_version is null or p_tool_policy_version < 1
    or p_tool_policy is distinct from '{"version":1,"tools":[]}'::jsonb then
    raise exception 'invalid_prompt_candidate';
  end if;
  perform 1
    from public.prompt_templates template
    join public.managers manager on manager.id = template.manager_id
    where template.id = p_template_id
      and template.code = 'controlled-agent-report'
      and manager.code = 'systems'
    for update of template;
  if not found then raise exception 'prompt_template_not_found'; end if;

  select coalesce(max(prompt.version), 0) + 1 into next_version
    from public.prompt_versions prompt where prompt.template_id = p_template_id;
  perform set_config('ai.prompt_governance_rpc', 'on', true);
  return query
    insert into public.prompt_versions(
      template_id, version, system_text, developer_text, json_schema,
      evaluation_status, model_route, schema_version, tool_policy_version, tool_policy
    ) values (
      p_template_id, next_version, p_system_text, p_developer_text, p_json_schema,
      'draft', p_model_route, p_schema_version, p_tool_policy_version, p_tool_policy
    ) returning prompt_versions.id, prompt_versions.version;
end;
$$;

revoke all on function public.create_prompt_candidate(uuid,text,text,jsonb,text,integer,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_prompt_candidate(uuid,text,text,jsonb,text,integer,integer,jsonb)
  to service_role;

commit;
