-- Device registration and revocation are security-definer, fresh-MFA RPCs;
-- browser sessions must not be able to forge or rotate device credentials.
revoke insert, update on public.worker_devices from authenticated;
