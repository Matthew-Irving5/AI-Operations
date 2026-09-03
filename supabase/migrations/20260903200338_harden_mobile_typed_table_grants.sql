-- Typed mobile tables are populated only by the privileged adapter functions.
-- Keep browser roles read-only even if an environment has broader default
-- privileges for tables created in the public schema.
revoke insert, update, delete, truncate, references, trigger
  on public.mobile_reminder_items,
    public.mobile_calendar_event_items,
    public.mobile_health_sample_items,
    public.mobile_health_sample_normalizations,
    public.mobile_location_observation_items,
    public.mobile_screen_time_activity_items
  from anon, authenticated;

grant select
  on public.mobile_reminder_items,
    public.mobile_calendar_event_items,
    public.mobile_health_sample_items,
    public.mobile_health_sample_normalizations,
    public.mobile_location_observation_items,
    public.mobile_screen_time_activity_items
  to authenticated;
