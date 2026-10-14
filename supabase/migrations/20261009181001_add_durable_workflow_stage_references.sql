alter table public.run_steps
  add column input_reference text,
  add column output_reference text,
  add column trace_id uuid;

alter table public.workflow_definitions
  add column default_model_route text,
  add column default_reasoning text,
  add column budget_category text,
  add column required_sources text[] not null default '{}',
  add column notification_policy text,
  add column approval_policy text;

update public.workflow_definitions definition
set default_model_route = case
      when definition.code ~ '(weekly|monthly|quarterly)' then 'gpt-5.6-terra'
      else 'gpt-5.6-luna'
    end,
    default_reasoning = case
      when definition.code ~ '(weekly|monthly|quarterly)' then 'medium'
      else 'low'
    end,
    budget_category = case
      when definition.code like 'travel-%' or definition.code like 'procurement-%' then 'on_demand'
      else 'recurring'
    end,
    notification_policy = case
      when definition.code like '%midday-exception' or definition.code like '%daily-cost-capacity' then 'exception'
      when definition.code like '%daily-%' then 'silent'
      else 'report'
    end,
    approval_policy = 'require_for_actions';

alter table public.workflow_definitions
  alter column default_model_route set not null,
  alter column default_reasoning set not null,
  alter column budget_category set not null,
  alter column notification_policy set not null,
  alter column approval_policy set not null,
  add constraint workflow_default_model_route_check check
    (default_model_route in ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol')),
  add constraint workflow_default_reasoning_check check
    (default_reasoning in ('low', 'medium', 'high')),
  add constraint workflow_budget_category_check check
    (budget_category in ('recurring', 'on_demand')),
  add constraint workflow_notification_policy_check check
    (notification_policy in ('silent', 'report', 'exception')),
  add constraint workflow_approval_policy_check check
    (approval_policy in ('none', 'require_for_actions'));

comment on column public.run_steps.input_reference is
  'Protected object reference for this stage input; never store raw sensitive input here.';
comment on column public.run_steps.output_reference is
  'Protected object reference for this stage output; never store raw sensitive output here.';
comment on column public.run_steps.trace_id is
  'Correlation to the redacted trace event for this execution stage.';

create unique index run_steps_run_step_code_uidx
  on public.run_steps(run_id, step_code);

-- Manager execution functions produce reports and evidence. Queue completion
-- owns the workflow_runs lifecycle transition in the same transaction as the
-- leased job completion.
do $$
declare
  function_signature text;
  original_definition text;
  rewritten_definition text;
begin
  foreach function_signature in array array[
    'public.execute_personal_workflow(uuid)',
    'public.execute_health_finance_workflow(uuid)',
    'public.execute_career_travel_procurement_workflow(uuid)',
    'public.execute_digital_estate_workflow(uuid)'
  ] loop
    original_definition := pg_get_functiondef(function_signature::regprocedure);
    rewritten_definition := regexp_replace(
      original_definition,
      'update public\.workflow_runs[[:space:]]+set status[^;]*;',
      'perform 1;',
      'gi'
    );
    if rewritten_definition = original_definition then
      raise exception 'expected workflow lifecycle update missing from %', function_signature;
    end if;
    execute rewritten_definition;
  end loop;
end;
$$;

revoke all on function public.execute_personal_workflow(uuid),
  public.execute_health_finance_workflow(uuid),
  public.execute_career_travel_procurement_workflow(uuid),
  public.execute_digital_estate_workflow(uuid) from public, anon, authenticated;
