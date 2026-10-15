begin;
select plan(3);

select ok(
  has_column_privilege('service_role', 'public.workflow_schedules', 'id', 'select')
    and has_column_privilege('service_role', 'public.workflow_schedules', 'user_id', 'select')
    and has_column_privilege('service_role', 'public.workflow_schedules', 'enabled', 'select')
    and not has_column_privilege('service_role', 'public.workflow_schedules', 'cron_expression', 'select')
    and not has_table_privilege('service_role', 'public.workflow_schedules', 'select'),
  'schedule Edge read access is limited to its filter and return columns'
);

select ok(
  has_column_privilege('service_role', 'public.workflow_schedules', 'enabled', 'update')
    and not has_column_privilege('service_role', 'public.workflow_schedules', 'id', 'update')
    and not has_column_privilege('service_role', 'public.workflow_schedules', 'user_id', 'update')
    and not has_table_privilege('service_role', 'public.workflow_schedules', 'update'),
  'schedule Edge update access is limited to the enabled state'
);

select ok(
  has_column_privilege('authenticated', 'public.workflow_schedules', 'id', 'select')
    and not has_table_privilege('authenticated', 'public.workflow_schedules', 'update'),
  'browser roles remain read-only for schedule changes'
);

select * from finish();
rollback;
