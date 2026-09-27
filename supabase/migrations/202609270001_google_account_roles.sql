-- Bind Google OAuth grants to an explicit account role and isolated runtime.
-- Historical combined grants are made unusable until the operator revokes the
-- broad Google consent and reconnects each account under its narrow role.

alter table public.connections
  drop constraint if exists connections_user_provider_unique;
alter table public.connections
  add column if not exists account_role text not null default 'default',
  add column if not exists environment text not null default 'production';

alter table public.oauth_states
  add column if not exists account_role text not null default 'legacy_combined',
  add column if not exists environment text not null default 'production';

alter table public.connections
  drop constraint if exists connections_google_scopes_check;

update public.oauth_states
set requested_scopes = '{}', consumed_at = coalesce(consumed_at, now())
where provider = 'google' and account_role = 'legacy_combined';

update public.connections
set account_role = 'legacy_combined',
    scopes = '{}',
    status = 'reauthentication_required',
    sync_enabled = false
where provider = 'google';

alter table public.connections
  add constraint connections_environment_check
    check (environment in ('staging', 'production')),
  add constraint connections_account_role_check
    check (account_role in ('default', 'personal_data_source', 'ai_operations_mailbox', 'ai_operations_mailbox_staging', 'legacy_combined')),
  add constraint connections_google_role_environment_check
    check (
      (provider <> 'google' and account_role = 'default')
      or (provider = 'google' and account_role = 'personal_data_source')
      or (provider = 'google' and account_role = 'ai_operations_mailbox' and environment = 'production')
      or (provider = 'google' and account_role = 'ai_operations_mailbox_staging' and environment = 'staging')
      or (provider = 'google' and account_role = 'legacy_combined')
    ),
  add constraint connections_google_role_scope_check
    check (
      (provider <> 'google' and account_role = 'default')
      or (provider = 'google' and account_role = 'legacy_combined'
        and scopes = '{}'::text[] and status in ('reauthentication_required', 'revoked')
        and not sync_enabled)
      or (provider = 'google' and account_role = 'personal_data_source'
        and cardinality(scopes) = 6
        and scopes @> array[
          'openid', 'email',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events.owned',
          'https://www.googleapis.com/auth/tasks'
        ]::text[])
      or (provider = 'google' and account_role = 'ai_operations_mailbox'
        and cardinality(scopes) = 4
        and scopes @> array[
          'openid', 'email',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send'
        ]::text[])
      or (provider = 'google' and account_role = 'ai_operations_mailbox_staging'
        and cardinality(scopes) = 4
        and scopes @> array[
          'openid', 'email',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send'
        ]::text[])
    );

alter table public.oauth_states
  add constraint oauth_states_environment_check
    check (environment in ('staging', 'production')),
  add constraint oauth_states_account_role_check
    check (account_role in ('personal_data_source', 'ai_operations_mailbox', 'ai_operations_mailbox_staging', 'legacy_combined')),
  add constraint oauth_states_google_role_environment_check
    check (
      (account_role = 'personal_data_source')
      or (account_role = 'ai_operations_mailbox' and environment = 'production')
      or (account_role = 'ai_operations_mailbox_staging' and environment = 'staging')
      or (account_role = 'legacy_combined' and consumed_at is not null)
    ),
  add constraint oauth_states_google_role_scope_check
    check (
      (account_role = 'legacy_combined' and consumed_at is not null
        and requested_scopes = '{}'::text[])
      or (account_role = 'personal_data_source'
        and cardinality(requested_scopes) = 6
        and requested_scopes @> array[
          'openid', 'email',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events.owned',
          'https://www.googleapis.com/auth/tasks'
        ]::text[])
      or (account_role = 'ai_operations_mailbox'
        and cardinality(requested_scopes) = 4
        and requested_scopes @> array[
          'openid', 'email',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send'
        ]::text[])
      or (account_role = 'ai_operations_mailbox_staging'
        and cardinality(requested_scopes) = 4
        and requested_scopes @> array[
          'openid', 'email',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send'
        ]::text[])
    );

alter table public.connections
  add constraint connections_user_provider_role_environment_unique
    unique (user_id, provider, account_role, environment);

create index connections_google_role_status_idx
  on public.connections(user_id, environment, account_role, status)
  where provider = 'google';

comment on column public.connections.account_role is
  'Server-enforced Google capability boundary: personal data source or communication mailbox.';
comment on column public.connections.environment is
  'Deployment environment that owns this credential; staging and production are isolated.';
comment on column public.oauth_states.account_role is
  'Role whose exact Google scope set and account identity are checked at callback.';
comment on column public.oauth_states.environment is
  'Server-derived environment; callback must match the deployment that created state.';
