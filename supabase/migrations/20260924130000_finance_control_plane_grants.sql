-- Finance configuration and archive-first import run through authenticated
-- Edge Functions. Browser roles remain constrained by the existing RLS
-- policies; the service role receives only the operations those functions use.
grant select, insert, update on public.finance_accounts to service_role;
grant select, insert, update on public.finance_categories to service_role;
grant select, insert, update on public.finance_statements to service_role;
grant select, insert, update on public.finance_transactions to service_role;
grant select, insert, update on public.finance_close_periods to service_role;
grant select, insert, update on public.finance_sheet_adapters to service_role;
grant select, insert on public.source_objects to service_role;
