-- PostgreSQL privileges are required before RLS policies can evaluate.  These
-- grants expose no rows by themselves: every listed table has RLS enabled and
-- policies constrain reads to the authenticated allowlisted identity.
grant usage on schema public to authenticated;
grant select on public.app_users, public.personal_profiles, public.managers,
  public.workflow_definitions, public.workflow_schedules, public.workflow_runs,
  public.actions, public.approvals, public.reports, public.monthly_budgets,
  public.audit_events, public.trace_events, public.connections,
  public.source_objects, public.data_freshness, public.ai_model_catalog,
  public.model_pricing, public.prompt_templates, public.prompt_versions,
  public.ai_calls, public.cost_reservations, public.notifications,
  public.feedback, public.ingestion_batches to authenticated;

grant insert on public.feedback to authenticated;
