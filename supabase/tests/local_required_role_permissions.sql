-- Read-only observed role ACL snapshot, 2026-11-11. Run only in isolated local Supabase.
-- Role expectations are table-level. Column grants and specific RPC EXECUTE are tested separately.
-- Keep this snapshot and docs/testing/platform-local-parity.csv in sync after a reviewed permissions change.
BEGIN;
SELECT plan(48);

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.actions'::regclass), true, 'public.actions: RLS remains enabled');
SELECT is(has_table_privilege('anon', 'public.actions', 'SELECT'), false, 'public.actions: anon SELECT=false');
SELECT is(has_table_privilege('authenticated', 'public.actions', 'SELECT'), true, 'public.actions: authenticated SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.actions', 'SELECT'), false, 'public.actions: service_role SELECT=false');
SELECT is(has_table_privilege('service_role', 'public.actions', 'INSERT'), true, 'public.actions: service_role INSERT=true');
SELECT is(has_table_privilege('service_role', 'public.actions', 'UPDATE'), false, 'public.actions: service_role UPDATE=false');

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.conversations'::regclass), true, 'public.conversations: RLS remains enabled');
SELECT is(has_table_privilege('anon', 'public.conversations', 'SELECT'), false, 'public.conversations: anon SELECT=false');
SELECT is(has_table_privilege('authenticated', 'public.conversations', 'SELECT'), false, 'public.conversations: authenticated SELECT=false');
SELECT is(has_table_privilege('service_role', 'public.conversations', 'SELECT'), true, 'public.conversations: service_role SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.conversations', 'INSERT'), true, 'public.conversations: service_role INSERT=true');
SELECT is(has_table_privilege('service_role', 'public.conversations', 'UPDATE'), true, 'public.conversations: service_role UPDATE=true');

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.conversation_messages'::regclass), true, 'public.conversation_messages: RLS remains enabled');
SELECT is(has_table_privilege('anon', 'public.conversation_messages', 'SELECT'), false, 'public.conversation_messages: anon SELECT=false');
SELECT is(has_table_privilege('authenticated', 'public.conversation_messages', 'SELECT'), false, 'public.conversation_messages: authenticated SELECT=false');
SELECT is(has_table_privilege('service_role', 'public.conversation_messages', 'SELECT'), true, 'public.conversation_messages: service_role SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.conversation_messages', 'INSERT'), true, 'public.conversation_messages: service_role INSERT=true');
SELECT is(has_table_privilege('service_role', 'public.conversation_messages', 'UPDATE'), true, 'public.conversation_messages: service_role UPDATE=true');

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.google_drive_files'::regclass), true, 'public.google_drive_files: RLS remains enabled');
SELECT is(has_table_privilege('anon', 'public.google_drive_files', 'SELECT'), false, 'public.google_drive_files: anon SELECT=false');
SELECT is(has_table_privilege('authenticated', 'public.google_drive_files', 'SELECT'), false, 'public.google_drive_files: authenticated SELECT=false');
SELECT is(has_table_privilege('service_role', 'public.google_drive_files', 'SELECT'), true, 'public.google_drive_files: service_role SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.google_drive_files', 'INSERT'), true, 'public.google_drive_files: service_role INSERT=true');
SELECT is(has_table_privilege('service_role', 'public.google_drive_files', 'UPDATE'), true, 'public.google_drive_files: service_role UPDATE=true');

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.inter_agent_requests'::regclass), true, 'public.inter_agent_requests: RLS remains enabled');
SELECT is(has_table_privilege('anon', 'public.inter_agent_requests', 'SELECT'), false, 'public.inter_agent_requests: anon SELECT=false');
SELECT is(has_table_privilege('authenticated', 'public.inter_agent_requests', 'SELECT'), false, 'public.inter_agent_requests: authenticated SELECT=false');
SELECT is(has_table_privilege('service_role', 'public.inter_agent_requests', 'SELECT'), true, 'public.inter_agent_requests: service_role SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.inter_agent_requests', 'INSERT'), true, 'public.inter_agent_requests: service_role INSERT=true');
SELECT is(has_table_privilege('service_role', 'public.inter_agent_requests', 'UPDATE'), true, 'public.inter_agent_requests: service_role UPDATE=true');

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.model_pricing'::regclass), true, 'public.model_pricing: RLS remains enabled');
SELECT is(has_table_privilege('anon', 'public.model_pricing', 'SELECT'), false, 'public.model_pricing: anon SELECT=false');
SELECT is(has_table_privilege('authenticated', 'public.model_pricing', 'SELECT'), false, 'public.model_pricing: authenticated SELECT=false');
SELECT is(has_table_privilege('service_role', 'public.model_pricing', 'SELECT'), true, 'public.model_pricing: service_role SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.model_pricing', 'INSERT'), false, 'public.model_pricing: service_role INSERT=false');
SELECT is(has_table_privilege('service_role', 'public.model_pricing', 'UPDATE'), false, 'public.model_pricing: service_role UPDATE=false');

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trace_events'::regclass), true, 'public.trace_events: RLS remains enabled');
SELECT is(has_table_privilege('anon', 'public.trace_events', 'SELECT'), false, 'public.trace_events: anon SELECT=false');
SELECT is(has_table_privilege('authenticated', 'public.trace_events', 'SELECT'), true, 'public.trace_events: authenticated SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.trace_events', 'SELECT'), false, 'public.trace_events: service_role SELECT=false');
SELECT is(has_table_privilege('service_role', 'public.trace_events', 'INSERT'), true, 'public.trace_events: service_role INSERT=true');
SELECT is(has_table_privilege('service_role', 'public.trace_events', 'UPDATE'), false, 'public.trace_events: service_role UPDATE=false');

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.workflow_runs'::regclass), true, 'public.workflow_runs: RLS remains enabled');
SELECT is(has_table_privilege('anon', 'public.workflow_runs', 'SELECT'), false, 'public.workflow_runs: anon SELECT=false');
SELECT is(has_table_privilege('authenticated', 'public.workflow_runs', 'SELECT'), true, 'public.workflow_runs: authenticated SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.workflow_runs', 'SELECT'), true, 'public.workflow_runs: service_role SELECT=true');
SELECT is(has_table_privilege('service_role', 'public.workflow_runs', 'INSERT'), false, 'public.workflow_runs: service_role INSERT=false');
SELECT is(has_table_privilege('service_role', 'public.workflow_runs', 'UPDATE'), true, 'public.workflow_runs: service_role UPDATE=true');

SELECT * FROM finish();
ROLLBACK;
