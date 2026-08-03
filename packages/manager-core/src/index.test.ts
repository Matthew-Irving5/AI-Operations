import { expect, it } from 'vitest';
import {
  planPersonalDay,
  reconcileStatement,
  requireIdempotencyKey,
  summariseHealthDay,
} from './index';
it('requires a non-trivial idempotency key', () =>
  expect(() => requireIdempotencyKey('short')).toThrow('invalid_idempotency_key'));

it('detects buffered conflicts and deterministically ranks due reminders', () => {
  const plan = planPersonalDay({
    now: '2026-08-03T08:00:00Z',
    minimumBufferMinutes: 15,
    events: [
      {
        id: 'first',
        title: 'First',
        startsAt: '2026-08-03T09:00:00Z',
        endsAt: '2026-08-03T10:00:00Z',
      },
      {
        id: 'conflict',
        title: 'Conflict',
        startsAt: '2026-08-03T10:10:00Z',
        endsAt: '2026-08-03T11:00:00Z',
      },
    ],
    reminders: [
      { id: 'later', title: 'Later', dueAt: '2026-08-04T08:00:00Z', priority: 9, completed: false },
      { id: 'due', title: 'Due', dueAt: '2026-08-03T07:00:00Z', priority: 1, completed: false },
    ],
  });
  expect(plan.conflicts).toEqual(['conflict']);
  expect(plan.rankedReminderIds).toEqual(['due', 'later']);
  expect(plan.materialChange).toBe(true);
});

it('keeps the midday exception workflow silent when the fixed input has no exception', () => {
  const plan = planPersonalDay({
    now: '2026-08-03T12:00:00Z',
    minimumBufferMinutes: 15,
    events: [
      {
        id: 'focus',
        title: 'Focus',
        startsAt: '2026-08-03T13:00:00Z',
        endsAt: '2026-08-03T14:00:00Z',
      },
    ],
    reminders: [
      { id: 'later', title: 'Later', dueAt: '2026-08-04T12:00:00Z', priority: 9, completed: false },
    ],
  });
  expect(plan.materialChange).toBe(false);
  expect(plan.rankedReminderIds).toEqual(['later']);
});

it('summarises a fixed Health day without AI interpretation', () => {
  expect(
    summariseHealthDay('2026-08-03', [
      { metric: 'weight_kg', observedAt: '2026-08-03T07:00:00Z', value: 80.2, unit: 'kg' },
      { metric: 'steps', observedAt: '2026-08-03T12:00:00Z', value: 4000, unit: 'count' },
      { metric: 'steps', observedAt: '2026-08-03T18:00:00Z', value: 5000, unit: 'count' },
      { metric: 'sleep_hours', observedAt: '2026-08-03T08:00:00Z', value: 7.5, unit: 'h' },
      { metric: 'running_distance_km', observedAt: '2026-08-03T17:00:00Z', value: 5, unit: 'km' },
    ]),
  ).toEqual({
    date: '2026-08-03',
    weightKg: 80.2,
    steps: 9000,
    sleepHours: 7.5,
    runningDistanceKm: 5,
    confidence: 'high',
  });
});

it('flags a deliberately unbalanced finance statement and currency mismatch', () => {
  expect(
    reconcileStatement(10_000, 11_500, 'GBP', [
      { date: '2026-08-01', amountMinor: 1_000, currency: 'GBP' },
      { date: '2026-08-02', amountMinor: -200, currency: 'USD' },
    ]),
  ).toEqual({
    balanced: false,
    expectedClosingMinor: 10_800,
    reasons: ['currency_mismatch', 'balance_mismatch'],
  });
});
