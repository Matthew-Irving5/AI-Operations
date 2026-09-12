-- Worker polling and result submission also read/update the action-plan
-- tables through the service role. These grants never apply to browser roles.
grant select, update on public.worker_action_manifests, public.digital_plans
  to service_role;
grant select, insert, update on public.onboarding_checklist_items
  to service_role;
