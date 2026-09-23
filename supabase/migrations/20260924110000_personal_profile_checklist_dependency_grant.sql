-- The onboarding validator checks the allowlisted operator's timezone through
-- app_users after validating the personal profile tables. Keep this grant
-- limited to the authenticated control-plane role; browser RLS remains intact.
grant select on public.app_users to service_role;
