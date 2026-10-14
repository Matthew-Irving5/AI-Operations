-- The canonical executor reads only the active run's bounded execution budget.
-- Keep that read column-scoped; budget creation and reservation remain behind
-- the existing authenticated launch and service-role reservation RPCs.
grant select (id, run_id, hard_cap, reserved_amount, model_ceiling, status, expires_at, search_ceiling)
  on table public.on_demand_budgets to service_role;

-- Idempotent report recovery and bounded feedback context need only these
-- fields; report content and feedback comments stay behind existing RPCs.
grant select (id, run_id, structured_metrics)
  on table public.reports to service_role;
grant select (id, user_id, positive, categories, created_at)
  on table public.feedback to service_role;
