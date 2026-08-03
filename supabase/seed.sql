-- Synthetic development-only data; never run against production.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'matthewirving99@gmail.com', crypt('synthetic-only', gen_salt('bf')), now(), '', '', '', '', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at, confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '', updated_at = excluded.updated_at;

insert into auth.identities(provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('matthewirving99@gmail.com', '00000000-0000-0000-0000-000000000101', '{"sub":"00000000-0000-0000-0000-000000000101","email":"matthewirving99@gmail.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now())
on conflict (provider_id, provider) do update set identity_data = excluded.identity_data, updated_at = excluded.updated_at;

insert into public.app_users(id, email, is_allowed)
values ('00000000-0000-0000-0000-000000000101', 'matthewirving99@gmail.com', true)
on conflict (id) do update set email = excluded.email, is_allowed = true;

insert into public.managers(code,name,description,risk_class) values ('finance','Finance Operations','Synthetic seed','high') on conflict(code) do nothing;

insert into public.workflow_runs(id, user_id, workflow_definition_id, status, trigger, correlation_id, idempotency_key, requested_at, completed_at)
select '00000000-0000-4000-8000-000000000303', '00000000-0000-0000-0000-000000000101', id, 'succeeded', 'schedule', '00000000-0000-4000-8000-000000000404', 'e2e-synthetic-systems-run', now() - interval '1 hour', now() - interval '55 minutes'
from public.workflow_definitions where code = 'systems-daily-cost-capacity'
on conflict (idempotency_key) do nothing;

insert into public.reports(id, user_id, run_id, report_type, title, summary, markdown, structured_metrics, status)
values ('00000000-0000-4000-8000-000000000505', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000000303', 'systems-daily-cost-capacity', 'Synthetic platform health', 'Synthetic report for authenticated browser coverage.', '# Synthetic platform health', '{"synthetic":true}'::jsonb, 'validated')
on conflict (id) do nothing;

insert into public.actions(id, user_id, run_id, action_type, title, description, risk_class)
values ('00000000-0000-4000-8000-000000000606', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000000303', 'synthetic-review', 'Review synthetic platform action', 'Synthetic browser-test approval.', 'medium')
on conflict (id) do nothing;

insert into public.approvals(id, user_id, action_id, payload_hash, expires_at)
values ('00000000-0000-4000-8000-000000000707', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000000606', repeat('a', 64), now() + interval '1 day')
on conflict (id) do nothing;

insert into public.trace_events(id, user_id, correlation_id, event_type, severity, redacted_payload)
values ('00000000-0000-4000-8000-000000000808', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000000404', 'workflow.completed', 'info', '{"synthetic":true}'::jsonb)
on conflict (id) do nothing;

insert into public.ai_calls(id, user_id, run_id, model_id, status, actual_input_tokens, actual_output_tokens, actual_cost, estimated_cost, created_at)
select '00000000-0000-4000-8000-000000000909', '00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000000303', id, 'succeeded', 100, 50, 0.0005, 0.0006, now() - interval '55 minutes'
from public.ai_model_catalog where model_id = 'gpt-5.6-luna'
on conflict (id) do nothing;

insert into public.spend_forecasts(user_id, month, actual_spend, expected_completed, original_month_end, remaining_estimate, variance_factor, adjusted_month_end, confidence)
values ('00000000-0000-0000-0000-000000000101', date_trunc('month', now())::date, 0.0005, 0.0006, 0.001, 0.0004, 1.0, 0.0009, 'medium')
on conflict do nothing;

insert into public.feedback(user_id, report_id, positive, categories, comment)
values ('00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000000505', true, array['usefulness'], 'Synthetic feedback for browser coverage.')
on conflict do nothing;

insert into public.mfa_reauthentication_events(user_id, method)
values ('00000000-0000-0000-0000-000000000101', 'totp')
on conflict do nothing;
