-- Durable per-user mutation limits; functions enforce these before mutating state.
create table public.edge_request_windows (
  user_id uuid not null references public.app_users(id) on delete cascade,
  operation text not null check (operation ~ '^[a-z_]{1,80}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, operation, window_started_at)
);
alter table public.edge_request_windows enable row level security;
create policy deny_edge_rate_limit_reads on public.edge_request_windows for select using (false);

create or replace function public.consume_edge_request_quota(p_user_id uuid, p_operation text, p_limit integer default 20)
returns boolean language plpgsql security definer set search_path = public as $$
declare accepted boolean;
begin
  if p_limit < 1 or p_limit > 120 or p_operation !~ '^[a-z_]{1,80}$' then raise exception 'invalid_rate_limit'; end if;
  insert into public.edge_request_windows(user_id, operation, window_started_at, request_count)
    values (p_user_id, p_operation, date_trunc('minute', now()), 1)
  on conflict (user_id, operation, window_started_at) do update
    set request_count = edge_request_windows.request_count + 1
    where edge_request_windows.request_count < p_limit
  returning true into accepted;
  return coalesce(accepted, false);
end; $$;
