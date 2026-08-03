import { expect, it } from 'vitest';
import { planPersonalDay, requireIdempotencyKey } from './index';
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
