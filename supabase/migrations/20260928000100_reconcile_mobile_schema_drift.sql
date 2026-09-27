-- Reconcile unversioned staging-only DDL with the canonical mobile source migration.
-- AI-9 live parity on 2026-09-27 found no violating rows in either environment.
-- These constraints were absent from 202608200002_mobile_source_adapters.sql and
-- conflict with its bounded-string contract (including optional empty strings).
alter table public.mobile_calendar_event_items
  drop constraint if exists mobile_calendar_event_items_calendar_name_check;
alter table public.mobile_calendar_event_items
  drop constraint if exists mobile_calendar_event_items_title_check;
alter table public.mobile_health_sample_items
  drop constraint if exists mobile_health_sample_items_reported_type_check;
alter table public.mobile_reminder_items
  drop constraint if exists mobile_reminder_items_title_check;
alter table public.mobile_screen_time_activity_items
  drop constraint if exists mobile_screen_time_activity_items_raw_text_check;

-- The versioned adapter explicitly declares STABLE; retain that conservative
-- volatility for text-to-timestamptz parsing and restore it if staging drifted.
alter function public.mobile_parse_offset_timestamp(text, boolean) stable;
