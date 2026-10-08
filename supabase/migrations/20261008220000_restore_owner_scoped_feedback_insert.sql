-- feedback-submit forwards the authenticated user's JWT and inserts through
-- PostgREST. Restore only the INSERT privilege required by that caller; the
-- existing own_feedback policy still enforces auth.uid() ownership and AAL2.
grant insert on table public.feedback to authenticated;
