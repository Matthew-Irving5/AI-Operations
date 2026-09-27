alter table public.notifications
  drop constraint if exists notifications_recipient_check;

alter table public.notifications
  add constraint notifications_recipient_check
  check (
    lower(recipient) = 'matthew.irving.ai@gmail.com'
    or (
      type = 'test'
      and lower(recipient) = 'matthewirving99@gmail.com'
    )
  );
