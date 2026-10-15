export const MFA_PAGE_JOBS = [
  'apple_bridge',
  'gmail_test',
  'connection_revoke',
  'connection_scope_change',
  'worker_device_register',
  'worker_device_revoke',
  'digital_scan_create',
  'finance_configure',
  'finance_import',
  'schedule_update',
] as const;

export type MfaPageJob = (typeof MFA_PAGE_JOBS)[number];

export function parseMfaPageJob(value: string | undefined): MfaPageJob | undefined {
  return MFA_PAGE_JOBS.find((job) => job === value);
}
