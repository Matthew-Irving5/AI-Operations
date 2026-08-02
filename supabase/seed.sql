-- Synthetic development-only data; never run against production.
insert into public.managers(code,name,description,risk_class) values ('finance','Finance Operations','Synthetic seed','high') on conflict(code) do nothing;
