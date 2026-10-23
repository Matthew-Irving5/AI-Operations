-- Staging-only AI-44 fixture. Run once against the configured staging project
-- after the candidate is deployed. Change the UUID suffix before another run;
-- execution receipts and transition audit are append-only and are retained.
do $ai44_fixture$
declare
  fixture_key constant text := 'ai44-live-e2e:20261022:6a09e667-f3bc-4e59-a07f-737c6b4d5e44';
  fixture_user_id uuid;
  systems_manager_id uuid;
  template_id uuid;
  active_version integer;
  target_status text;
  target_evaluation jsonb;
  allowed_user_count integer;
  conversation_id uuid := gen_random_uuid();
  message_id uuid := gen_random_uuid();
  action_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  correlation_id uuid := gen_random_uuid();
  message_body constant text := 'AI-44 staging acceptance fixture: promote evaluated Systems report prompt version 3, then restore the active version.';
begin
  if exists (
    select 1 from public.execution_requests
    where idempotency_key = fixture_key || ':execute'
  ) then
    raise exception 'ai44_fixture_key_already_used';
  end if;

  select count(*) into allowed_user_count
  from public.app_users
  where is_allowed;

  if allowed_user_count <> 1 then
    raise exception 'ai44_fixture_requires_exactly_one_allowlisted_user';
  end if;

  select id into strict fixture_user_id
  from public.app_users
  where is_allowed;

  select id into strict systems_manager_id
  from public.managers where code = 'systems';

  if not exists (
    select 1 from public.manager_capabilities
    where manager_id = systems_manager_id and capability_code = 'prompt_model_config'
      and enabled and permissions @> array['write', 'execute']::text[]
  ) then
    raise exception 'ai44_fixture_systems_capability_missing';
  end if;

  select template.id, template.active_version, version.evaluation_status,
         version.evaluation_result
    into strict template_id, active_version, target_status, target_evaluation
  from public.prompt_templates template
  join public.managers manager on manager.id = template.manager_id
  join public.prompt_versions version
    on version.template_id = template.id and version.version = 3
  where manager.code = 'systems' and template.code = 'controlled-agent-report';

  if active_version <> 2 or target_status <> 'promoted'
     or coalesce((target_evaluation ->> 'passed')::boolean, false) is not true
     or coalesce((target_evaluation ->> 'caseCount')::integer, 0) <> 24
     or coalesce((target_evaluation ->> 'managerCount')::integer, 0) <> 8
     or coalesce((target_evaluation ->> 'safetyPassed')::boolean, false) is not true
     or coalesce((target_evaluation ->> 'evidencePassed')::boolean, false) is not true
     or coalesce((target_evaluation ->> 'toolAuthorityPassed')::boolean, false) is not true
     or coalesce((target_evaluation ->> 'schemaPassed')::boolean, false) is not true
     or coalesce((target_evaluation ->> 'costPassed')::boolean, false) is not true
     or coalesce((target_evaluation ->> 'latencyPassed')::boolean, false) is not true then
    raise exception 'ai44_fixture_prompt_precondition_failed';
  end if;

  insert into public.conversations (
    id, user_id, originating_channel, originating_manager_code,
    current_manager_code, subject, metadata, correlation_id
  ) values (
    conversation_id, fixture_user_id, 'web_chat', 'systems', 'systems',
    'AI-44 canonical action staging acceptance',
    jsonb_build_object('fixture', 'ai44-action-live-e2e', 'fixtureKey', fixture_key),
    correlation_id
  );

  insert into public.conversation_participants (
    conversation_id, user_id, kind, role, manager_code, display_name
  ) values
    (conversation_id, fixture_user_id, 'user', 'owner', null, 'Staging owner'),
    (conversation_id, fixture_user_id, 'manager', 'member', 'systems', 'Systems');

  insert into public.conversation_messages (
    id, conversation_id, user_id, direction, sender_kind, channel,
    semantic_type, authority, body_text, body_sha256, deduplication_key,
    processing_status, correlation_id
  ) values (
    message_id, conversation_id, fixture_user_id, 'inbound', 'user', 'web_chat',
    'command', 'verified_user', message_body,
    encode(digest(convert_to(message_body, 'UTF8'), 'sha256'), 'hex'),
    fixture_key, 'processed', correlation_id
  );

  insert into public.actions (
    id, user_id, manager_id, action_type, title, description, risk_class,
    status, proposed_payload, contract_version, approval_required, authority,
    approval_state, required_capability, required_permissions,
    conversation_id, source_message_id, correlation_id, idempotency_key
  ) values (
    action_id, fixture_user_id, systems_manager_id, 'review_prompt_promotion',
    'AI-44 staging prompt transition',
    'Promote evaluated Systems report prompt version 3, then restore version 2.',
    'high', 'proposed', jsonb_build_object('templateId', template_id, 'targetVersion', 3),
    1, false, 'verified_user', 'not_required', 'prompt_model_config',
    array['write', 'execute']::text[], conversation_id, message_id,
    correlation_id, fixture_key || ':action'
  );

  insert into public.execution_requests (
    id, user_id, action_id, conversation_id, source_message_id,
    interpreting_manager_code, authority, status, command_type,
    command_version, intent, typed_parameters, target_type, target_reference,
    scope, mechanism, required_capability, channel, idempotency_key,
    correlation_id, execution_mode
  ) values (
    request_id, fixture_user_id, action_id, conversation_id, message_id,
    'systems', 'verified_user', 'queued', 'review_prompt_promotion',
    1, 'Promote the evaluated staging prompt version and restore it after the acceptance proof.',
    jsonb_build_object('templateId', template_id, 'targetVersion', 3),
    'prompt_version', 'controlled-agent-report:3',
    'Staging acceptance only; restore active prompt version 2 after proving the reversible action.',
    'internal', 'prompt_model_config', 'web_chat', fixture_key || ':execute',
    correlation_id, 'execute'
  );

  insert into public.audit_events (
    user_id, actor_type, action_type, target_type, target_id,
    correlation_id, result, redacted_after
  ) values (
    fixture_user_id, 'system', 'ai44_live_acceptance_fixture_seeded',
    'execution_request', request_id::text, correlation_id, 'success',
    jsonb_build_object('fixture', 'ai44-action-live-e2e', 'fixtureKey', fixture_key)
  );

  raise notice 'AI-44 staging fixture seeded; runner fixture key is %', fixture_key;
end
$ai44_fixture$;
