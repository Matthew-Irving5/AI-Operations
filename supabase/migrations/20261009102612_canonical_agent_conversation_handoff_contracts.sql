-- Canonical agent runtime contracts. Existing workflows, actions, approvals,
-- traces, audits, reports, source objects and research sources remain canonical.
alter type public.run_status add value if not exists 'waiting_for_dependency' before 'succeeded';

alter table public.actions add column if not exists manager_id uuid references public.managers(id);
alter table public.actions add column if not exists contract_version integer not null default 1 check (contract_version > 0);
alter table public.actions add column if not exists approval_required boolean not null default true;
alter table public.actions add column if not exists authority text not null default 'agent_proposal' check(authority in ('verified_user','agent_proposal','standing_policy'));
alter table public.actions add column if not exists approval_state text not null default 'pending' check(approval_state in ('not_required','pending','approved','rejected','expired','invalidated'));
alter table public.actions add column if not exists required_capability text;
alter table public.actions add column if not exists required_permissions text[] not null default '{}';
alter table public.actions add column if not exists conversation_id uuid;
alter table public.actions add column if not exists source_message_id uuid;
alter table public.actions add column if not exists correlation_id uuid not null default gen_random_uuid();
alter table public.actions add column if not exists idempotency_key text;
update public.actions set idempotency_key = 'legacy-action:' || id::text where idempotency_key is null;
update public.actions a set manager_id = d.manager_id from public.workflow_runs r join public.workflow_definitions d on d.id=r.workflow_definition_id where a.run_id=r.id and a.manager_id is null;
update public.actions a set approval_state = case
  when exists(select 1 from public.approvals p where p.action_id=a.id and p.decision='approved') then 'approved'
  when exists(select 1 from public.approvals p where p.action_id=a.id and p.decision='rejected') then 'rejected'
  when exists(select 1 from public.approvals p where p.action_id=a.id and p.decision='expired') then 'expired'
  else 'pending' end;
alter table public.actions alter column idempotency_key set default gen_random_uuid()::text;
alter table public.actions alter column idempotency_key set not null;
alter table public.actions add column if not exists updated_at timestamptz not null default now();
alter table public.actions add constraint actions_proposal_approval_gate_check check (
  (authority <> 'agent_proposal' or approval_required) and
  (authority = 'agent_proposal' or approval_state <> 'pending') and
  (authority <> 'agent_proposal' or status not in ('approved','queued','running','waiting_for_dependency','succeeded') or approval_state='approved')
);
alter table public.managers add column if not exists contract_version integer not null default 1 check(contract_version > 0);
create unique index if not exists actions_user_idempotency_uidx
  on public.actions(user_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists actions_id_user_uidx on public.actions(id,user_id);
create unique index if not exists workflow_runs_id_user_uidx on public.workflow_runs(id,user_id);
create unique index if not exists source_objects_id_user_uidx on public.source_objects(id,user_id);
create unique index if not exists research_sources_id_user_uidx on public.research_sources(id,user_id);
create unique index if not exists approvals_id_user_uidx on public.approvals(id,user_id);

create table public.manager_capabilities (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null check(contract_version = 1),
  manager_id uuid not null references public.managers(id) on delete cascade,
  capability_code text not null check (capability_code in (
    'canonical_conversation_content','gmail_conversation_transport','web_chat_response_transport',
    'own_domain_state','other_domain_state','planner_attention_queue','inter_agent_requests',
    'execution_request_queue','calendar_read','calendar_write','reminder_read','reminder_write',
    'google_drive_read','google_drive_write','apple_health_read','finance_history_research',
    'web_research','personal_github','windows_worker_inventory','windows_worker_mutation',
    'isolated_frontier_sandbox','financial_execution','travel_booking','product_purchase',
    'prompt_model_config','cost_reservations','audit_trace_append','immediate_notification',
    'routine_user_briefing'
  )),
  permissions text[] not null check (cardinality(permissions) > 0 and permissions <@ array['read','write','execute','research','enqueue']::text[]),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(manager_id, contract_version, capability_code)
);

create type public.conversation_channel as enum ('gmail','web_chat','internal');
create type public.conversation_origin_channel as enum ('gmail','web_chat');
create type public.conversation_status as enum ('open','closed','archived');
create type public.conversation_sender_kind as enum ('user','manager','system','external');
create type public.conversation_authority as enum ('verified_user','agent_generated','system_generated','external_untrusted');
create type public.conversation_message_status as enum ('received','queued','routing','processing','processed','failed','ignored');
create type public.handoff_status as enum ('requested','accepted','rejected','cancelled');
create type public.inter_agent_request_status as enum ('requested','accepted','running','waiting_for_dependency','completed','rejected','failed','cancelled');
create type public.attention_status as enum ('new','queued_for_planner','incorporated','sent_immediately','dismissed','expired','resolved');
create type public.execution_request_status as enum ('received','routed','queued','running','waiting_for_dependency','succeeded','failed','cancelled');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  user_id uuid not null references public.app_users(id) on delete cascade,
  status public.conversation_status not null default 'open',
  originating_channel public.conversation_origin_channel not null,
  originating_manager_code text not null references public.managers(code),
  current_manager_code text not null references public.managers(code),
  subject text not null check(length(subject) between 1 and 998),
  gmail_thread_id text,
  last_message_at timestamptz,
  execution_state_summary jsonb not null default '{"state":null,"activeRunId":null,"updatedAt":null}'::jsonb check(jsonb_typeof(execution_state_summary)='object'),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index conversations_user_gmail_thread_uidx on public.conversations(user_id,gmail_thread_id) where gmail_thread_id is not null;

create table public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  conversation_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('user','manager','system','external')),
  manager_code text references public.managers(code),
  provider_actor_id text,
  display_name text,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  foreign key (conversation_id,user_id) references public.conversations(id,user_id) on delete cascade,
  check ((kind = 'manager') = (manager_code is not null)),
  check ((kind = 'external') = (provider_actor_id is not null)),
  check ((kind = 'user') = (role = 'owner')),
  check (left_at is null or left_at >= joined_at),
  unique (conversation_id, kind, manager_code, provider_actor_id)
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  conversation_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound','internal')),
  sender_kind public.conversation_sender_kind not null,
  manager_code text references public.managers(code),
  channel public.conversation_channel not null,
  semantic_type text not null check(semantic_type in ('statement','request','command','correction','cancellation','clarification','response')),
  authority public.conversation_authority not null,
  body_text text,
  body_reference text,
  body_sha256 text not null check (body_sha256 ~ '^[a-f0-9]{64}$'),
  gmail_message_id text,
  gmail_rfc_message_id text,
  gmail_thread_id text,
  in_reply_to text,
  message_references text[] not null default '{}',
  provider_received_at timestamptz,
  deduplication_key text not null,
  processing_status public.conversation_message_status not null default 'received',
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  foreign key (conversation_id,user_id) references public.conversations(id,user_id) on delete cascade,
  check ((sender_kind = 'manager') = (manager_code is not null)),
  check (body_text is not null or body_reference is not null),
  check ((sender_kind='user' and authority='verified_user') or (sender_kind='manager' and authority='agent_generated') or (sender_kind='system' and authority='system_generated') or (sender_kind='external' and authority='external_untrusted')),
  unique (conversation_id,deduplication_key),
  unique (conversation_id,gmail_message_id)
);
alter table public.conversation_messages add constraint conversation_messages_id_user_uidx unique(id,user_id);
create index conversation_messages_timeline_idx on public.conversation_messages(conversation_id,created_at,id);

create table public.conversation_attachments (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  message_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  source_object_id uuid not null,
  original_filename text not null,
  malware_scan_status text not null default 'pending' check(malware_scan_status in ('pending','clean','quarantined','failed')),
  extraction_status text not null default 'pending' check(extraction_status in ('pending','complete','failed','unsupported')),
  extraction_reference text,
  data_classification text not null,
  retention_state text not null default 'retained' check(retention_state in ('retained','quarantined','pending_deletion')),
  created_at timestamptz not null default now(),
  unique(message_id,source_object_id),
  foreign key(message_id,user_id) references public.conversation_messages(id,user_id) on delete cascade,
  foreign key(source_object_id,user_id) references public.source_objects(id,user_id)
);

create table public.conversation_handoffs (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  conversation_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  from_manager_code text not null references public.managers(code),
  to_manager_code text not null references public.managers(code),
  status public.handoff_status not null default 'requested',
  reason text not null check(length(reason) between 1 and 2000),
  source_message_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  initiated_at timestamptz not null default now(),
  accepted_at timestamptz,
  foreign key (conversation_id,user_id) references public.conversations(id,user_id) on delete cascade,
  foreign key (source_message_id,user_id) references public.conversation_messages(id,user_id),
  check (from_manager_code <> to_manager_code),
  check ((status = 'accepted') = (accepted_at is not null)),
  unique(user_id,idempotency_key),
  unique(id,user_id)
);
create table public.conversation_handoff_events (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  handoff_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  status public.handoff_status not null,
  actor_manager_code text references public.managers(code),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(handoff_id,user_id) references public.conversation_handoffs(id,user_id) on delete cascade,
  unique(handoff_id,status)
);
create table public.conversation_entity_links (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  conversation_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  message_id uuid,
  entity_type text not null check(entity_type in ('workflow_run','report','action','execution_request','finance_close','finance_opportunity','travel_trip','travel_watch','procurement_item','health_plan','health_finding','career_project','career_opportunity','career_radar_candidate','digital_finding','digital_plan','planner_commitment','time_block','evidence_reference')),
  entity_id uuid not null,
  relation text not null check(relation in ('context','produced_by','supports','supersedes')),
  created_at timestamptz not null default now(),
  foreign key(conversation_id,user_id) references public.conversations(id,user_id) on delete cascade,
  foreign key(message_id,user_id) references public.conversation_messages(id,user_id) on delete cascade,
  unique(conversation_id,message_id,entity_type,entity_id,relation)
);

alter table public.actions add constraint actions_conversation_user_fk
  foreign key(conversation_id,user_id) references public.conversations(id,user_id);
alter table public.actions add constraint actions_source_message_user_fk
  foreign key(source_message_id,user_id) references public.conversation_messages(id,user_id);

create table public.inter_agent_requests (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  user_id uuid not null references public.app_users(id) on delete cascade,
  conversation_id uuid,
  source_manager_code text not null references public.managers(code),
  destination_manager_code text not null references public.managers(code),
  status public.inter_agent_request_status not null default 'requested',
  objective text not null check(length(objective) between 1 and 4000),
  required_output_contract jsonb not null check(jsonb_typeof(required_output_contract) = 'object'),
  context_evidence_ids uuid[] not null default '{}',
  priority smallint not null default 2 check(priority between 0 and 4),
  deadline_at timestamptz,
  source_run_id uuid,
  source_message_id uuid,
  result_reference uuid,
  result jsonb check(result is null or jsonb_typeof(result) = 'object'),
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key(conversation_id,user_id) references public.conversations(id,user_id) on delete set null (conversation_id),
  foreign key(source_run_id,user_id) references public.workflow_runs(id,user_id),
  foreign key(source_message_id,user_id) references public.conversation_messages(id,user_id),
  check(source_manager_code <> destination_manager_code),
  check(completed_at is null or completed_at >= created_at),
  check ((status in ('completed','rejected','failed','cancelled')) = (completed_at is not null)),
  check (status <> 'completed' or result_reference is not null),
  unique(user_id,idempotency_key),
  unique(id,user_id)
);
create table public.inter_agent_replies (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  request_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  manager_code text not null references public.managers(code),
  kind text not null check(kind in ('completed','rejected','failed')),
  output jsonb not null default '{}'::jsonb check(jsonb_typeof(output)='object'),
  result_reference uuid,
  evidence_reference_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  correlation_id uuid not null,
  foreign key(request_id,user_id) references public.inter_agent_requests(id,user_id) on delete cascade,
  check(kind <> 'completed' or result_reference is not null),
  unique(request_id)
);

create table public.attention_items (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  user_id uuid not null references public.app_users(id) on delete cascade,
  source_manager_code text not null references public.managers(code),
  source_conversation_id uuid,
  source_run_id uuid,
  status public.attention_status not null default 'new',
  item_type text not null,
  finding text not null,
  recommended_communication text not null,
  recommended_action text,
  priority smallint not null default 2 check(priority between 0 and 4),
  urgency text not null default 'routine' check(urgency in ('routine','time_sensitive','urgent')),
  deadline_at timestamptz,
  expires_at timestamptz,
  acknowledgement_required boolean not null default false,
  acknowledged_at timestamptz,
  evidence_reference_ids uuid[] not null default '{}',
  correlation_id uuid not null default gen_random_uuid(),
  deduplication_key text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key(source_conversation_id,user_id) references public.conversations(id,user_id) on delete set null (source_conversation_id),
  foreign key(source_run_id,user_id) references public.workflow_runs(id,user_id),
  check (status <> 'incorporated' or not acknowledgement_required or acknowledged_at is not null),
  check (resolved_at is null or resolved_at >= created_at),
  check ((status = 'resolved') = (resolved_at is not null)),
  unique(user_id,deduplication_key)
);

create table public.execution_requests (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  user_id uuid not null references public.app_users(id) on delete cascade,
  workflow_run_id uuid,
  action_id uuid,
  approval_id uuid,
  conversation_id uuid not null,
  source_message_id uuid not null,
  interpreting_manager_code text not null references public.managers(code),
  authority text not null check(authority in ('verified_user','agent_proposal','standing_policy')),
  status public.execution_request_status not null default 'received',
  command_type text not null,
  command_version integer not null default 1 check(command_version > 0),
  intent text not null,
  typed_parameters jsonb not null default '{}'::jsonb check(jsonb_typeof(typed_parameters) = 'object'),
  target_type text not null,
  target_reference text,
  scope text not null,
  mechanism text not null check(mechanism in ('edge_function','worker','provider_api','internal')),
  required_capability text not null check(required_capability in (
    'canonical_conversation_content','gmail_conversation_transport','web_chat_response_transport',
    'own_domain_state','other_domain_state','planner_attention_queue','inter_agent_requests',
    'execution_request_queue','calendar_read','calendar_write','reminder_read','reminder_write',
    'google_drive_read','google_drive_write','apple_health_read','finance_history_research',
    'web_research','personal_github','windows_worker_inventory','windows_worker_mutation',
    'isolated_frontier_sandbox','financial_execution','travel_booking','product_purchase',
    'prompt_model_config','cost_reservations','audit_trace_append','immediate_notification','routine_user_briefing'
  )),
  attempt_count integer not null default 0 check(attempt_count >= 0),
  dependency text,
  result_reference uuid,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  error_code text,
  redacted_error text,
  foreign key(conversation_id,user_id) references public.conversations(id,user_id) on delete cascade,
  foreign key(source_message_id,user_id) references public.conversation_messages(id,user_id),
  foreign key(action_id,user_id) references public.actions(id,user_id),
  foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id),
  foreign key(approval_id,user_id) references public.approvals(id,user_id),
  unique(user_id,idempotency_key),
  unique(id,user_id),
  check (started_at is null or started_at >= created_at),
  check (completed_at is null or completed_at >= created_at),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check (status not in ('succeeded','failed') or completed_at is not null),
  check (status <> 'failed' or error_code is not null),
  check (authority <> 'agent_proposal' or action_id is not null or approval_id is not null)
);
create index execution_requests_queue_idx on public.execution_requests(status,created_at) where status in ('received','routed','queued','waiting_for_dependency');

create table public.execution_receipts (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  execution_request_id uuid not null references public.execution_requests(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check(kind in ('accepted','waiting_for_dependency','succeeded','failed','cancelled','too_late_to_cancel')),
  summary text not null,
  action_id uuid,
  result_reference uuid,
  result jsonb not null default '{}'::jsonb check(jsonb_typeof(result) = 'object'),
  error_code text,
  redacted_error text,
  correlation_id uuid not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'failed') = (error_code is not null)),
  unique(user_id,idempotency_key),
  unique(id,user_id),
  foreign key(execution_request_id,user_id) references public.execution_requests(id,user_id) on delete cascade,
  foreign key(action_id,user_id) references public.actions(id,user_id)
);

create table public.evidence_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  contract_version integer not null default 1 check(contract_version=1),
  source_type text not null check(source_type in ('source_object','research_source','domain_record','external_url','legacy_reference')),
  source_object_id uuid,
  research_source_id uuid,
  source_record_table text,
  source_record_id text,
  source_url text check(source_url is null or source_url like 'https://%'),
  source_key text,
  title text not null,
  sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz,
  retrieved_at timestamptz,
  verification_method text not null check(verification_method in ('provider_verified','user_supplied','source_document','authoritative_url','derived_deterministically','model_inference','legacy_unclassified')),
  confidence text not null check(confidence in ('unknown','low','medium','high')),
  expires_at timestamptz,
  workflow_run_id uuid,
  ai_call_id uuid,
  trace_event_id uuid,
  prompt_version_id uuid,
  model_id text,
  provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  check (num_nonnulls(source_object_id,research_source_id,source_record_id,source_url,source_key) = 1),
  check ((source_type = 'source_object') = (source_object_id is not null)),
  check ((source_type = 'research_source') = (research_source_id is not null)),
  check ((source_type = 'domain_record') = (source_record_table is not null and source_record_id is not null)),
  check ((source_type = 'external_url') = (source_url is not null)),
  check ((source_type = 'legacy_reference') = (source_key is not null)),
  check (verification_method <> 'authoritative_url' or source_url is not null),
  check (verification_method <> 'provider_verified' or retrieved_at is not null),
  unique(id,user_id),
  foreign key(source_object_id,user_id) references public.source_objects(id,user_id),
  foreign key(research_source_id,user_id) references public.research_sources(id,user_id)
);
create table public.evidence_links (
  id uuid primary key default gen_random_uuid(),
  contract_version integer not null default 1 check(contract_version=1),
  evidence_reference_id uuid not null references public.evidence_references(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  entity_type text not null check(entity_type in ('conversation','conversation_message','conversation_attachment','conversation_handoff','inter_agent_request','attention_item','action','execution_request','execution_receipt','workflow_run','run_step','report','report_section')),
  entity_id uuid not null,
  relation text not null default 'supports' check(relation in ('supports','derived_from','supersedes','context')),
  created_at timestamptz not null default now(),
  foreign key(evidence_reference_id,user_id) references public.evidence_references(id,user_id) on delete cascade,
  unique(evidence_reference_id,entity_type,entity_id,relation)
);
create unique index evidence_references_user_source_key_uidx
  on public.evidence_references(user_id,source_key) where source_key is not null;

-- Preserve the existing report-section evidence payloads as legacy provenance
-- and link them to their source section before consumers migrate to v1 refs.
with legacy_rows as (
  select report.user_id, section.id as section_id, report.id as report_id,
    evidence.value as legacy_payload, evidence.ordinality as evidence_index,
    coalesce(nullif(left(evidence.value->>'source',500),''), 'Legacy report evidence') as evidence_title,
    coalesce(nullif(left(evidence.value->>'id',1000),''), 'item-' || evidence.ordinality::text) as evidence_id
  from public.report_sections section
  join public.reports report on report.id=section.report_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(section.evidence_references)='array' then section.evidence_references else '[]'::jsonb end
  ) with ordinality as evidence(value,ordinality)
), inserted as (
  insert into public.evidence_references(
    user_id,contract_version,source_type,source_key,title,verification_method,confidence,provenance,created_at
  )
  select user_id,1,'legacy_reference',
    'report-section:' || section_id::text || ':' || evidence_index::text || ':' || evidence_id,
    evidence_title,'legacy_unclassified','unknown',
    jsonb_build_object('legacyPayload',legacy_payload,'reportId',report_id,'reportSectionId',section_id),now()
  from legacy_rows
  on conflict(user_id,source_key) where source_key is not null do nothing
  returning id,user_id,source_key
)
insert into public.evidence_links(evidence_reference_id,user_id,entity_type,entity_id,relation)
select evidence.id,evidence.user_id,'report_section',legacy.section_id,'context'
from inserted evidence
join legacy_rows legacy on evidence.user_id=legacy.user_id
  and evidence.source_key='report-section:' || legacy.section_id::text || ':' || legacy.evidence_index::text || ':' || legacy.evidence_id
on conflict(evidence_reference_id,entity_type,entity_id,relation) do nothing;

insert into public.manager_capabilities(manager_id,contract_version,capability_code,permissions)
with capability_matrix(capability_code,grants) as (values
  ('canonical_conversation_content','finance=read,write;health=read,write;travel=read,write;procurement=read,write;personal=read,write;career=read,write;digital_estate=read,write;systems=read'),
  ('gmail_conversation_transport','finance=enqueue;health=enqueue;travel=enqueue;procurement=enqueue;personal=read,write,execute,enqueue;career=enqueue;digital_estate=enqueue;systems=execute,enqueue'),
  ('web_chat_response_transport','finance=write;health=write;travel=write;procurement=write;personal=write;career=write;digital_estate=write;systems=execute'),
  ('own_domain_state','finance=read,write;health=read,write;travel=read,write;procurement=read,write;personal=read,write;career=read,write;digital_estate=read,write;systems=read'),
  ('other_domain_state','finance=read;health=read;travel=read;procurement=read;personal=read;career=read;digital_estate=read;systems=read'),
  ('planner_attention_queue','finance=enqueue;health=enqueue;travel=enqueue;procurement=enqueue;personal=read,write,execute;career=enqueue;digital_estate=enqueue;systems=read,execute'),
  ('inter_agent_requests','finance=read,write,enqueue;health=read,write,enqueue;travel=read,write,enqueue;procurement=read,write,enqueue;personal=read,write,enqueue;career=read,write,enqueue;digital_estate=read,write,enqueue;systems=read,write,enqueue'),
  ('execution_request_queue','finance=enqueue;health=enqueue;travel=enqueue;procurement=enqueue,execute;personal=enqueue;career=enqueue;digital_estate=enqueue,execute;systems=read,write,execute'),
  ('calendar_read','finance=read;health=read;travel=read;procurement=read;personal=read;career=read;digital_estate=read;systems=read'),
  ('calendar_write','personal=write,execute'),
  ('reminder_read','finance=read;health=read;travel=read;procurement=read;personal=read;career=read;digital_estate=read;systems=read'),
  ('reminder_write','personal=write,execute'),
  ('google_drive_read','finance=read;health=read;travel=read;procurement=read;personal=read;career=read;digital_estate=read;systems=read'),
  ('google_drive_write','finance=write;health=enqueue;travel=enqueue;procurement=enqueue;personal=write,enqueue;career=enqueue;digital_estate=enqueue;systems=execute'),
  ('apple_health_read','health=read;personal=read;systems=read'),
  ('finance_history_research','finance=read;travel=enqueue;procurement=enqueue;personal=read'),
  ('web_research','finance=research;health=research;travel=research;procurement=research;personal=research;career=research;digital_estate=research;systems=research'),
  ('personal_github','career=read,research;systems=read'),
  ('windows_worker_inventory','digital_estate=read,execute,enqueue;systems=read'),
  ('windows_worker_mutation','digital_estate=execute,enqueue;systems=execute'),
  ('isolated_frontier_sandbox','career=execute,enqueue;systems=execute,enqueue'),
  ('prompt_model_config','systems=read,write,execute'),
  ('cost_reservations','finance=read;health=read;travel=read;procurement=read;personal=read;career=read;digital_estate=read;systems=read,write,execute'),
  ('audit_trace_append','finance=enqueue;health=enqueue;travel=enqueue;procurement=enqueue;personal=enqueue;career=enqueue;digital_estate=enqueue;systems=write,execute'),
  ('immediate_notification','finance=enqueue;health=enqueue;travel=enqueue;procurement=enqueue;personal=enqueue,execute;career=enqueue;digital_estate=enqueue;systems=execute'),
  ('routine_user_briefing','finance=enqueue;health=enqueue;travel=enqueue;procurement=enqueue;personal=write,execute;career=enqueue;digital_estate=enqueue')
), expanded as (
  select matrix.capability_code, split_part(grant_spec,'=',1) as manager_code,
    string_to_array(split_part(grant_spec,'=',2),',') as permissions
  from capability_matrix matrix
  cross join lateral unnest(string_to_array(matrix.grants,';')) grant_spec
)
select managers.id, 1, expanded.capability_code, expanded.permissions
from expanded join public.managers on managers.code=expanded.manager_code
on conflict(manager_id,contract_version,capability_code) do update set permissions=excluded.permissions, enabled=true;

-- New runtime tables are service-only. Explicit policies make the denial
-- visible to future access-contract checks; access remains via Edge Functions.
do $$ declare table_name text; begin
  foreach table_name in array array[
    'manager_capabilities','conversations','conversation_participants','conversation_messages',
    'conversation_attachments','conversation_handoffs','conversation_handoff_events','conversation_entity_links',
    'inter_agent_requests','inter_agent_replies','attention_items','execution_requests','execution_receipts',
    'evidence_references','evidence_links'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy deny_data_api_clients on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', table_name);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;
grant all privileges on table
  public.manager_capabilities, public.conversations, public.conversation_participants,
  public.conversation_messages, public.conversation_attachments, public.conversation_handoffs,
  public.conversation_handoff_events, public.conversation_entity_links, public.inter_agent_requests,
  public.inter_agent_replies, public.attention_items, public.execution_requests,
  public.execution_receipts, public.evidence_references, public.evidence_links
to service_role;

create or replace function public.reject_contract_history_mutation()
returns trigger language plpgsql as $$ begin
  raise exception 'append_only_contract_history';
end $$;
create trigger conversation_message_append_only before update or delete on public.conversation_messages for each row execute function public.reject_contract_history_mutation();
create trigger conversation_handoff_event_append_only before update or delete on public.conversation_handoff_events for each row execute function public.reject_contract_history_mutation();
create trigger execution_receipt_append_only before update or delete on public.execution_receipts for each row execute function public.reject_contract_history_mutation();

create or replace function public.enforce_conversation_message_authority()
returns trigger language plpgsql as $$ begin
  if not ((new.sender_kind='user' and new.authority='verified_user') or (new.sender_kind='manager' and new.authority='agent_generated') or (new.sender_kind='system' and new.authority='system_generated') or (new.sender_kind='external' and new.authority='external_untrusted')) then
    raise exception using errcode='23514', message='message_authority_mismatch';
  end if;
  return new;
end $$;
create trigger conversation_message_authority before insert on public.conversation_messages for each row execute function public.enforce_conversation_message_authority();

create or replace function public.enforce_agent_contract_transition()
returns trigger language plpgsql as $$
declare allowed boolean := false; begin
  if new.status = old.status then return new; end if;
  if tg_table_name = 'actions' then
    allowed := (old.status,new.status) in (('proposed','awaiting_approval'),('proposed','approved'),('proposed','rejected'),('proposed','cancelled'),('awaiting_approval','approved'),('awaiting_approval','rejected'),('awaiting_approval','cancelled'),('awaiting_approval','expired'),('approved','queued'),('approved','cancelled'),('approved','expired'),('queued','running'),('queued','failed'),('queued','cancelled'),('running','waiting_for_dependency'),('running','succeeded'),('running','failed'),('running','cancelled'),('waiting_for_dependency','queued'),('waiting_for_dependency','running'),('waiting_for_dependency','failed'),('waiting_for_dependency','cancelled'));
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
create trigger conversation_status_transition before update of status on public.conversations for each row execute function public.enforce_agent_contract_transition();
create trigger action_status_transition before update of status on public.actions for each row execute function public.enforce_agent_contract_transition();
create trigger handoff_status_transition before update of status on public.conversation_handoffs for each row execute function public.enforce_agent_contract_transition();
create trigger inter_agent_status_transition before update of status on public.inter_agent_requests for each row execute function public.enforce_agent_contract_transition();
create trigger attention_status_transition before update of status on public.attention_items for each row execute function public.enforce_agent_contract_transition();
create trigger execution_request_status_transition before update of status on public.execution_requests for each row execute function public.enforce_agent_contract_transition();

create or replace function public.sync_agent_contract_timestamps()
returns trigger language plpgsql as $$ begin
  if tg_table_name='conversation_handoffs' then
    if new.status='accepted' and old.status is distinct from new.status then new.accepted_at := coalesce(new.accepted_at,now()); end if;
  elsif tg_table_name='inter_agent_requests' then
    if new.status in ('completed','rejected','failed','cancelled') and old.status is distinct from new.status then new.completed_at := coalesce(new.completed_at,now()); end if;
  elsif tg_table_name='attention_items' then
    if new.status='resolved' and old.status is distinct from new.status then new.resolved_at := coalesce(new.resolved_at,now()); end if;
  elsif tg_table_name='execution_requests' then
    if new.status='running' and old.status is distinct from new.status then new.started_at := coalesce(new.started_at,now()); end if;
    if new.status in ('succeeded','failed') and old.status is distinct from new.status then new.completed_at := coalesce(new.completed_at,now()); end if;
    if new.status='cancelled' and old.status is distinct from new.status then new.cancelled_at := coalesce(new.cancelled_at,now()); end if;
  end if;
  return new;
end $$;
create trigger handoff_timestamps before update of status on public.conversation_handoffs for each row execute function public.sync_agent_contract_timestamps();
create trigger inter_agent_timestamps before update of status on public.inter_agent_requests for each row execute function public.sync_agent_contract_timestamps();
create trigger attention_timestamps before update of status on public.attention_items for each row execute function public.sync_agent_contract_timestamps();
create trigger execution_request_timestamps before update of status on public.execution_requests for each row execute function public.sync_agent_contract_timestamps();

create or replace function public.record_conversation_handoff_event()
returns trigger language plpgsql as $$ begin
  insert into public.conversation_handoff_events(handoff_id,user_id,status,actor_manager_code,correlation_id,created_at)
  values(new.id,new.user_id,new.status,null,new.correlation_id,now());
  return new;
end $$;
create trigger conversation_handoff_event_insert after insert on public.conversation_handoffs for each row execute function public.record_conversation_handoff_event();
create trigger conversation_handoff_event_transition after update of status on public.conversation_handoffs for each row when (old.status is distinct from new.status) execute function public.record_conversation_handoff_event();

create or replace function public.accept_conversation_handoff()
returns trigger language plpgsql as $$ begin
  if new.status = 'accepted' then
    if new.accepted_at is null then new.accepted_at := now(); end if;
    update public.conversations set current_manager_code = new.to_manager_code, updated_at = now()
    where id = new.conversation_id and user_id = new.user_id and current_manager_code = new.from_manager_code;
    if not found then raise exception 'handoff_owner_changed_before_acceptance'; end if;
  end if;
  return new;
end $$;
create trigger conversation_handoff_accept before update of status on public.conversation_handoffs for each row when (new.status='accepted' and old.status is distinct from new.status) execute function public.accept_conversation_handoff();

create or replace function public.update_conversation_message_timestamp()
returns trigger language plpgsql as $$ begin
  update public.conversations set last_message_at = greatest(coalesce(last_message_at,new.created_at),new.created_at), updated_at = now()
  where id = new.conversation_id and user_id = new.user_id;
  return new;
end $$;
create trigger conversation_message_last_message after insert on public.conversation_messages for each row execute function public.update_conversation_message_timestamp();

create or replace function public.decide_approval(p_user_id uuid, p_approval_id uuid, p_decision public.approval_decision, p_note text default null)
returns public.approvals language plpgsql security definer set search_path = public as $$
declare decided public.approvals;
begin
  if p_decision not in ('approved','rejected') then raise exception 'invalid_approval_decision'; end if;
  if not exists(select 1 from public.mfa_reauthentication_events where user_id = p_user_id and verified_at >= now() - interval '5 minutes') then raise exception 'fresh_mfa_required'; end if;
  update public.approvals set decision = p_decision, decided_at = now() where id = p_approval_id and user_id = p_user_id and decision = 'pending' and expires_at > now() returning * into decided;
  if not found then raise exception 'approval_not_pending'; end if;
  update public.actions set status = case when p_decision = 'approved' then 'approved' else 'rejected' end,
    approval_state = case when p_decision = 'approved' then 'approved' else 'rejected' end,
    updated_at = now()
  where id = decided.action_id and user_id = p_user_id;
  insert into public.audit_events(user_id, actor_type, action_type, target_type, target_id, aal, result, redacted_after)
    values (p_user_id, 'user', 'decide_approval', 'approval', p_approval_id::text, 'aal2_fresh', 'success', jsonb_build_object('decision', p_decision, 'note', left(coalesce(p_note, ''), 500)));
  return decided;
end; $$;

comment on table public.manager_capabilities is 'Versioned manager capability contract. Capabilities are data; authorization is enforced by trusted server boundaries.';
comment on table public.conversations is 'Canonical cross-channel conversation identity and current owner. Gmail and Web Chat share this record.';
comment on table public.conversation_messages is 'Append-only canonical messages with authenticated authority, deduplication and content hash.';
comment on table public.conversation_handoffs is 'Current handoff request state; handoff events preserve the immutable ownership history.';
comment on table public.execution_requests is 'Durable canonical typed command queue. Actions remain proposals and approvals remain the existing approval store.';
comment on table public.execution_receipts is 'Append-only execution outcomes linked to canonical execution requests.';
comment on table public.evidence_references is 'Canonical provenance wrapper over existing source_objects, research_sources and typed domain records.';
