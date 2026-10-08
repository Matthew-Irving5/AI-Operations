begin;
create temporary table expected_authenticated_access (
  table_name name primary key,
  select_grant boolean not null,
  policy_name name not null
) on commit drop;

insert into expected_authenticated_access(table_name, select_grant, policy_name) values
  ('reports', true, 'own_reports'),
  ('feedback_categories', true, 'allowed_feedback_categories'),
  ('managers', true, 'allowed_manager_read'),
  ('approvals', true, 'own_approvals'),
  ('actions', true, 'own_actions'),
  ('trace_events', true, 'own_traces'),
  ('feedback', true, 'own_feedback'),
  ('workflow_schedules', true, 'own_schedules'),
  ('workflow_definitions', true, 'allowed_definition_read'),
  ('spend_forecasts', true, 'own_forecasts'),
  ('ai_calls', true, 'own_ai_calls'),
  ('workflow_runs', true, 'own_runs'),
  ('job_queue', true, 'own_jobs'),
  ('data_freshness', true, 'own_freshness'),
  ('calendar_events', true, 'own_calendar_events'),
  ('reminders', true, 'own_reminders'),
  ('routines', true, 'own_routines'),
  ('connections', true, 'own_connections'),
  ('apple_bridge_devices', true, 'own_bridge_devices'),
  ('health_daily_summaries', true, 'own_health_summaries'),
  ('health_imports', true, 'own_health_imports'),
  ('health_samples', true, 'own_health_samples'),
  ('health_rejected_records', true, 'own_health_rejections'),
  ('finance_close_periods', true, 'own_finance_close_periods'),
  ('finance_transactions', true, 'own_finance_transactions'),
  ('finance_accounts', true, 'own_finance_accounts'),
  ('finance_categories', true, 'own_finance_categories'),
  ('finance_sheet_adapters', true, 'own_finance_sheet_adapters'),
  ('finance_statements', true, 'own_finance_statements'),
  ('career_github_evidence', true, 'own_career_github_evidence'),
  ('research_sources', true, 'own_research_sources'),
  ('on_demand_research_runs', true, 'own_on_demand_research_runs'),
  ('travel_watches', true, 'own_travel_watches'),
  ('digital_scans', true, 'own_digital_scans'),
  ('onboarding_checklist_items', true, 'own_onboarding_items'),
  ('production_acceptances', true, 'own_production_acceptance'),
  ('personal_profiles', true, 'own_profiles'),
  ('personal_locations', true, 'own_personal_locations'),
  ('time_preferences', true, 'own_time_preferences'),
  ('worker_devices', false, 'own_worker_devices');

select plan(25);

select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    where schema.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  ),
  'every exposed public table enables row level security'
);

select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    left join pg_policies policy
      on policy.schemaname = schema.nspname
      and policy.tablename = relation.relname
    where schema.nspname = 'public'
      and relation.relkind in ('r', 'p')
    group by relation.oid
    having count(policy.policyname) = 0
  ),
  'every exposed public table has at least one explicit row policy'
);

select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    where schema.nspname = 'public'
      and relation.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege(
        'anon', relation.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
  ),
  'anonymous Data API sessions have no direct public table or view privileges'
);

select ok(
  not exists (
    select 1
    from pg_default_acl defaults
    join pg_namespace schema on schema.oid = defaults.defaclnamespace
    cross join lateral aclexplode(defaults.defaclacl) acl
    where defaults.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and schema.nspname = 'public'
      and defaults.defaclobjtype in ('r', 'S')
      and acl.grantee = (select oid from pg_roles where rolname = 'anon')
  ),
  'future public tables and sequences do not inherit anonymous grants'
);

select ok(
  not exists (
    with public_sequences as materialized (
      select relation.oid
      from pg_class relation
      join pg_namespace schema on schema.oid = relation.relnamespace
      where schema.nspname = 'public'
        and relation.relkind = 'S'
    )
    select 1
    from public_sequences sequence
    where has_sequence_privilege('anon', sequence.oid, 'USAGE,SELECT,UPDATE')
  ),
  'anonymous Data API sessions have no public sequence privileges'
);

select is(
  (
    select count(*)
    from expected_authenticated_access expected
    where expected.select_grant
      and has_table_privilege('authenticated', format('public.%I', expected.table_name), 'SELECT')
  ),
  (select count(*) from expected_authenticated_access where select_grant)::bigint,
  'authenticated table-level SELECT grants match the explicit UI read allowlist'
);

select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    where schema.nspname = 'public'
      and relation.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege('authenticated', relation.oid, 'SELECT')
      and not exists (
        select 1
        from expected_authenticated_access expected
        where expected.table_name = relation.relname
          and expected.select_grant
      )
  ),
  'authenticated has no table-level SELECT outside the explicit UI read allowlist'
);

select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    where schema.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and has_table_privilege(
        'authenticated', relation.oid,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
      and relation.relname not in ('feedback', 'mfa_reauthentication_events')
  )
  and has_table_privilege('authenticated', 'public.feedback', 'INSERT')
  and not has_table_privilege(
    'authenticated', 'public.feedback',
    'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )
  and has_table_privilege('authenticated', 'public.mfa_reauthentication_events', 'INSERT')
  and not has_table_privilege(
    'authenticated', 'public.mfa_reauthentication_events',
    'SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ),
  'direct table writes are limited to feedback and MFA event inserts'
);

-- Application migrations create future public objects as postgres. The
-- supabase_admin default ACL is provider-managed and cannot be changed by the
-- migration role; current objects owned by either role are explicitly revoked.
select ok(
  not exists (
    select 1
    from pg_default_acl defaults
    join pg_namespace schema on schema.oid = defaults.defaclnamespace
    cross join lateral aclexplode(defaults.defaclacl) acl
    where defaults.defaclnamespace <> 0
      and schema.nspname = 'public'
      and defaults.defaclobjtype in ('r', 'S')
      and defaults.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and acl.grantee = (select oid from pg_roles where rolname = 'authenticated')
  ),
  'future public tables and sequences do not inherit authenticated grants'
);

select ok(
  not exists (
    with public_sequences as materialized (
      select relation.oid
      from pg_class relation
      join pg_namespace schema on schema.oid = relation.relnamespace
      where schema.nspname = 'public'
        and relation.relkind = 'S'
    )
    select 1
    from public_sequences sequence
    where has_sequence_privilege('authenticated', sequence.oid, 'USAGE,SELECT,UPDATE')
  ),
  'authenticated has no direct public sequence privileges'
);

select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    join pg_attribute column_info on column_info.attrelid = relation.oid
    cross join lateral aclexplode(column_info.attacl) acl
    where schema.nspname = 'public'
      and relation.relkind in ('r', 'p', 'v', 'm')
      and column_info.attnum > 0
      and not column_info.attisdropped
      and acl.grantee = (select oid from pg_roles where rolname = 'authenticated')
      and acl.privilege_type = 'SELECT'
      and not (
        relation.relname = 'worker_devices'
        and column_info.attname = any(array[
          'id', 'user_id', 'label', 'public_key_b64', 'pairing_expires_at',
          'paired_at', 'revoked_at', 'last_heartbeat_at', 'state', 'created_at'
        ])
      )
  ),
  'authenticated has no column-level SELECT grants outside the worker projection'
);

select ok(
  not exists (
    select 1
    from expected_authenticated_access expected
    join pg_class relation
      on relation.relname = expected.table_name
     and relation.relnamespace = 'public'::regnamespace
    left join pg_policies policy
      on policy.schemaname = 'public'
     and policy.tablename = expected.table_name
     and policy.policyname = expected.policy_name
    where not relation.relrowsecurity
       or policy.policyname is null
       or policy.cmd not in ('SELECT', 'ALL')
       or not ('authenticated' = any(policy.roles) or 'public' = any(policy.roles))
       or (
        expected.table_name not in ('feedback_categories', 'workflow_definitions', 'managers')
         and coalesce(policy.qual, '') not like '%auth.uid()%'
       )
       or (
        expected.table_name in ('feedback_categories', 'workflow_definitions', 'managers')
         and coalesce(policy.qual, '') not like '%is_allowed_aal2%'
       )
  ),
  'every allowlisted read has its expected owner or gated reference policy'
);

select ok(
  not has_table_privilege('authenticated', 'public.worker_devices', 'SELECT')
    and has_column_privilege('authenticated', 'public.worker_devices', 'id', 'SELECT')
    and has_column_privilege('authenticated', 'public.worker_devices', 'public_key_b64', 'SELECT')
    and not has_column_privilege('authenticated', 'public.worker_devices', 'pairing_hash', 'SELECT')
    and not has_column_privilege('authenticated', 'public.worker_devices', 'worker_secret_hash', 'SELECT'),
  'worker UI reads only its approved projection and cannot read secret hashes'
);

select ok(
  has_table_privilege('authenticated', 'public.mfa_reauthentication_events', 'INSERT')
    and not has_table_privilege('authenticated', 'public.mfa_reauthentication_events', 'SELECT')
    and exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'mfa_reauthentication_events'
        and policyname = 'own_mfa_reauthentication_events'
        and cmd = 'INSERT'
        and with_check::text like '%auth.uid()%'
        and with_check::text like '%is_allowed_aal2%'
    ),
  'MFA event inserts are user-bound and require the allowed AAL2 session'
);

select ok(
  has_table_privilege('authenticated', 'public.feedback', 'INSERT')
    and exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'feedback'
        and policyname = 'own_feedback'
        and cmd = 'ALL'
        and with_check::text like '%auth.uid()%'
        and with_check::text like '%is_allowed_aal2%'
    ),
  'feedback-submit has INSERT privilege while owner and AAL2 checks remain enforced'
);

alter table public.app_users drop constraint app_users_email_check;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000202',
  'authenticated', 'authenticated', 'second-user@example.test',
  crypt('synthetic-only', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
) on conflict (id) do nothing;
insert into public.app_users(id, email, is_allowed)
values ('00000000-0000-0000-0000-000000000202', 'second-user@example.test', true)
on conflict (id) do update set email = excluded.email, is_allowed = true;
insert into public.finance_accounts(user_id, institution_name, account_label, account_type, currency)
values ('00000000-0000-0000-0000-000000000101', 'Synthetic bank', 'Synthetic account', 'bank', 'GBP');
insert into public.health_samples(user_id, source, external_id, metric, observed_at, value, unit)
values ('00000000-0000-0000-0000-000000000101', 'synthetic', 'access-contract-row', 'steps', now(), 1, 'count');
insert into public.personal_locations(user_id, label, encrypted_address, location_kind)
values ('00000000-0000-0000-0000-000000000101', 'Synthetic home', 'synthetic-ciphertext', 'home');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000202","aal":"aal2"}', true);
select throws_ok($$
  insert into public.feedback(user_id, report_id, positive, categories, comment)
  values (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-4000-8000-000000000505', true, array['ownership'],
    'Synthetic cross-user feedback must be denied.'
  )
$$, 'new row violates row-level security policy for table "feedback"',
  'feedback INSERT grant cannot write for another user');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","aal":"aal1"}', true);
select throws_ok($$
  insert into public.feedback(user_id, report_id, positive, categories, comment)
  values (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-4000-8000-000000000505', true, array['aal'],
    'Synthetic AAL1 feedback must be denied.'
  )
$$, 'new row violates row-level security policy for table "feedback"',
  'feedback INSERT remains denied to an AAL1 session');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","aal":"aal2"}', true);
select lives_ok($$
  insert into public.feedback(user_id, report_id, positive, categories, comment)
  values (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-4000-8000-000000000505', true, array['access-contract'],
    'Synthetic owner feedback is allowed at AAL2.'
  )
$$, 'the owner can insert feedback with an AAL2 JWT');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000202","aal":"aal2"}', true);
select is(
  (
    select count(*)
    from (
      select id from public.reports where user_id = '00000000-0000-0000-0000-000000000101'
      union all
      select id from public.finance_accounts where user_id = '00000000-0000-0000-0000-000000000101'
      union all
      select id from public.health_samples where user_id = '00000000-0000-0000-0000-000000000101'
      union all
      select id from public.personal_locations where user_id = '00000000-0000-0000-0000-000000000101'
    ) private_rows
  ),
  0::bigint,
  'a synthetic second user cannot read another user report, finance, health, or location rows'
);
reset role;

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'mfa_action_gates',
        'prompt_templates',
        'prompt_versions',
        'mobile_snapshots',
        'mobile_snapshot_sources',
        'mobile_ingestion_records',
        'mobile_ingestion_attachments',
        'mobile_record_adaptations',
        'mobile_typed_deduplication_keys'
      ])
      and policyname = 'deny_data_api_clients'
      and permissive = 'RESTRICTIVE'
      and cmd = 'ALL'
      and roles @> array['anon'::name, 'authenticated'::name]
      and regexp_replace(coalesce(qual, ''), '[()]', '', 'g') = 'false'
      and regexp_replace(coalesce(with_check, ''), '[()]', '', 'g') = 'false'
  ),
  9::bigint,
  'all nine intentional service-only tables have a restrictive deny-all client policy'
);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    where schema.nspname = 'public'
      and relation.relname = any(array[
        'mfa_action_gates',
        'prompt_templates',
        'prompt_versions',
        'mobile_snapshots',
        'mobile_snapshot_sources',
        'mobile_ingestion_records',
        'mobile_ingestion_attachments',
        'mobile_record_adaptations',
        'mobile_typed_deduplication_keys'
      ])
      and has_table_privilege(
        'anon', relation.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
  ),
  0::bigint,
  'service-only tables grant no direct privileges to anon'
);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    where schema.nspname = 'public'
      and relation.relname = any(array[
        'mfa_action_gates',
        'prompt_templates',
        'prompt_versions',
        'mobile_snapshots',
        'mobile_snapshot_sources',
        'mobile_ingestion_records',
        'mobile_ingestion_attachments',
        'mobile_record_adaptations',
        'mobile_typed_deduplication_keys'
      ])
      and has_table_privilege(
        'authenticated', relation.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
  ),
  0::bigint,
  'service-only tables grant no direct privileges to authenticated'
);

select ok(
  not has_table_privilege('authenticated', 'public.prompt_templates', 'SELECT')
    and not has_table_privilege('authenticated', 'public.prompt_versions', 'SELECT'),
  'browser sessions cannot read confidential prompt templates or versions'
);

select ok(
  has_table_privilege('service_role', 'public.prompt_templates', 'SELECT')
    and has_table_privilege('service_role', 'public.prompt_versions', 'SELECT'),
  'trusted AI execution retains service-role prompt reads'
);

select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace schema on schema.oid = relation.relnamespace
    where schema.nspname = 'public'
      and relation.relkind = 'v'
      and not coalesce(relation.reloptions @> array['security_invoker=true'], false)
  ),
  'all exposed views execute with caller privileges'
);

rollback;
