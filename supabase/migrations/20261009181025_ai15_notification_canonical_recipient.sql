alter table public.notifications
  drop constraint if exists notifications_recipient_check;

create or replace function public.enforce_notification_user_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_email text;
begin
  select email into canonical_email from public.app_users where id = new.user_id;
  if canonical_email is null then
    raise exception 'notification_user_email_unavailable';
  end if;
  if lower(new.recipient) <> lower(canonical_email) then
    raise exception 'notification_recipient_user_mismatch';
  end if;
  new.recipient := canonical_email;
  return new;
end;
$$;

create trigger notifications_user_recipient_guard
before insert or update of user_id, recipient on public.notifications
for each row execute function public.enforce_notification_user_recipient();

revoke all on function public.enforce_notification_user_recipient() from public;

-- Existing deterministic executors used a hard-coded communication inbox.
-- Resolve each recipient from the linked account so the database invariant
-- remains true without embedding personal email in executable source.
do $$
declare
  function_signature text;
  original_definition text;
  rewritten_definition text;
begin
  foreach function_signature in array array[
    'public.execute_systems_workflow(uuid)',
    'public.execute_personal_workflow(uuid)',
    'public.execute_health_finance_workflow(uuid)',
    'public.execute_career_travel_procurement_workflow(uuid)',
    'public.execute_digital_estate_workflow(uuid)'
  ] loop
    original_definition := pg_get_functiondef(function_signature::regprocedure);
    rewritten_definition := replace(
      original_definition,
      '''Matthew.irving.ai@gmail.com''',
      '(select email from public.app_users where id = run_row.user_id)'
    );
    if rewritten_definition = original_definition then
      raise exception 'expected hard-coded notification recipient missing from %', function_signature;
    end if;
    execute rewritten_definition;
  end loop;
end;
$$;
