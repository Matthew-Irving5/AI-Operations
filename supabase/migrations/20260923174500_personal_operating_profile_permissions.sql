-- Weekly planning preferences are written only by the authenticated control plane.
revoke insert, update, delete on public.time_preferences from authenticated;
grant select on public.time_preferences to authenticated;
