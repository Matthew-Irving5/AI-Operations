-- Hosted Edge Functions use a service-role JWT that still requires explicit
-- database privileges. Keep these grants limited to the two internal AI paths.

grant usage on schema public to service_role;

grant insert on public.webhook_events, public.trace_events to service_role;
grant select, update on public.ai_calls to service_role;
grant select on public.workflow_runs to service_role;

grant select on public.workflow_runs, public.ai_model_catalog,
  public.prompt_templates, public.prompt_versions to service_role;
grant update on public.workflow_runs to service_role;
grant insert on public.reports, public.report_sections, public.actions,
  public.trace_events to service_role;
