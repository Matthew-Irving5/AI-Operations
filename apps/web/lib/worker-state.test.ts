import { describe, expect, it } from 'vitest';
import { titleCase, workerDisplayState } from './worker-state';

describe('worker display state', () => {
  const now = Date.parse('2026-10-29T12:00:00.000Z');

  it('maps fresh active, paused and stale workers to the public states', () => {
    expect(
      workerDisplayState({ state: 'active', last_heartbeat_at: '2026-10-29T11:59:30.000Z' }, now),
    ).toBe('active');
    expect(
      workerDisplayState({ state: 'online', last_heartbeat_at: '2026-10-29T11:59:30.000Z' }, now),
    ).toBe('online');
    expect(workerDisplayState({ state: 'active', last_heartbeat_at: null }, now)).toBe('offline');
    expect(
      workerDisplayState({ state: 'active', last_heartbeat_at: '2026-10-29T11:57:59.000Z' }, now),
    ).toBe('offline');
  });

  it('retains revoked as an audit-only state', () => {
    expect(workerDisplayState({ state: 'revoked', last_heartbeat_at: null }, now)).toBe('revoked');
  });
});

it('capitalises scan labels and statuses', () => {
  expect(titleCase('lightweight')).toBe('Lightweight');
  expect(titleCase('waiting_for_device')).toBe('Waiting For Device');
});
