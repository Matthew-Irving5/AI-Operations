import { describe, expect, it } from 'vitest';
import { parseMfaPageJob } from './mfa-page-job';

describe('MFA page action query', () => {
  it('allows the existing schedule update gate job', () => {
    expect(parseMfaPageJob('schedule_update')).toBe('schedule_update');
  });

  it('does not turn an unknown query value into an MFA action', () => {
    expect(parseMfaPageJob('unknown_action')).toBeUndefined();
    expect(parseMfaPageJob(undefined)).toBeUndefined();
  });
});
