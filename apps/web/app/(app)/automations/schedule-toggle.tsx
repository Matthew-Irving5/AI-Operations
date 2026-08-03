'use client';

import { useState } from 'react';

export function ScheduleToggle({
  scheduleId,
  enabled,
}: Readonly<{ scheduleId: string; enabled: boolean }>) {
  const [current, setCurrent] = useState(enabled);
  const [message, setMessage] = useState('');
  async function update() {
    setMessage('Saving schedule...');
    const response = await fetch('/api/schedules/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduleId, enabled: !current }),
    });
    if (!response.ok)
      return setMessage(
        'Schedule change was rejected. Complete production onboarding and fresh MFA first.',
      );
    setCurrent(!current);
    setMessage(!current ? 'Schedule enabled.' : 'Schedule disabled.');
  }
  return (
    <>
      <button type="button" onClick={() => void update()}>
        {current ? 'Disable schedule' : 'Enable schedule'}
      </button>
      <span aria-live="polite"> {message}</span>
    </>
  );
}
