begin;
select plan(8);

alter table public.app_users drop constraint if exists app_users_email_check;

insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000141', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai41-retention@example.test', now(), now())
on conflict (id) do nothing;
insert into public.app_users(id, email, is_allowed)
values ('00000000-0000-0000-0000-000000000141', 'ai41-retention@example.test', true)
on conflict (id) do update set is_allowed = true;
insert into public.worker_devices(id, user_id, label, public_key_b64, state, paired_at, worker_secret_hash)
values ('41000000-0000-4000-8000-000000000141', '00000000-0000-0000-0000-000000000141', 'AI-41 retention fixture', 'ai41-retention-key', 'offline', now(), repeat('c', 64))
on conflict (id) do nothing;
insert into public.digital_scans(id, user_id, device_id, scan_kind, approved_roots, status, created_at)
values
 ('41000000-0000-4000-8000-000000000141', '00000000-0000-0000-0000-000000000141', '41000000-0000-4000-8000-000000000141', 'lightweight', '["C:\\synthetic"]', 'queued', now() - interval '31 days'),
 ('41000000-0000-4000-8000-000000000142', '00000000-0000-0000-0000-000000000141', '41000000-0000-4000-8000-000000000141', 'lightweight', '["C:\\synthetic"]', 'complete', now() - interval '31 days'),
 ('41000000-0000-4000-8000-000000000143', '00000000-0000-0000-0000-000000000141', '41000000-0000-4000-8000-000000000141', 'lightweight', '["C:\\synthetic"]', 'queued', now() - interval '2 days');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000141","role":"authenticated","aal":"aal2"}', true);
select is(public.expire_stale_digital_scans(now()), 1, 'only stale incomplete scan is terminalised');
select is((select status::text from public.digital_scans where id = '41000000-0000-4000-8000-000000000141'), 'cancelled', 'stale queued scan is cancelled');
select ok((select completed_at is not null from public.digital_scans where id = '41000000-0000-4000-8000-000000000141'), 'cancelled scan has terminal timestamp');
select is((select status::text from public.digital_scans where id = '41000000-0000-4000-8000-000000000142'), 'complete', 'completed history remains intact');
select is((select status::text from public.digital_scans where id = '41000000-0000-4000-8000-000000000143'), 'queued', 'recent queued scan remains queued');
select is((select count(*)::integer from public.digital_scans where id in ('41000000-0000-4000-8000-000000000141', '41000000-0000-4000-8000-000000000142')), 2, 'scan rows remain for audit');
select ok(has_function_privilege('authenticated', 'public.expire_stale_digital_scans(timestamptz)', 'EXECUTE'), 'authenticated can run own retention cleanup');
select ok(not has_function_privilege('anon', 'public.expire_stale_digital_scans(timestamptz)', 'EXECUTE'), 'anonymous cannot run retention cleanup');
select * from finish();
rollback;
