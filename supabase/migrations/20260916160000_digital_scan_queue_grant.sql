-- digital-scan-create cancels the generic queued job before handing the run
-- to the paired Windows worker. Keep this narrow service-role grant explicit;
-- browser roles retain no direct queue mutation privilege.
grant select, update on public.job_queue to service_role;
