-- AI provider costs are routinely below one cent.  Do not round reservations,
-- settlement, or monthly actuals to currency-display precision.

alter table public.cost_reservations
  alter column reserved_amount type numeric(12,6),
  alter column consumed_amount type numeric(12,6),
  alter column released_amount type numeric(12,6);

alter table public.monthly_budgets
  alter column recurring_target type numeric(12,6),
  alter column recurring_hard_cap type numeric(12,6),
  alter column actual_recurring type numeric(12,6),
  alter column actual_on_demand type numeric(12,6);

alter table public.on_demand_budgets
  alter column hard_cap type numeric(12,6),
  alter column reserved_amount type numeric(12,6),
  alter column actual_amount type numeric(12,6);
