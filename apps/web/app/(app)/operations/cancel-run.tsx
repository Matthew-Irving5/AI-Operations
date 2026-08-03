'use client';

import { useState } from 'react';

export function CancelRun({ runId }: Readonly<{ runId: string }>) {
  const [status, setStatus] = useState('');
  async function cancel() {
    setStatus('Cancelling…');
    const response = await fetch('/api/workflows/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId }),
    });
    setStatus(
      response.ok ? 'Cancelled. Refresh to update the queue.' : 'This run could not be cancelled.',
    );
  }
  return (
    <span>
      <button type="button" onClick={cancel}>
        Cancel run
      </button>
      <span aria-live="polite"> {status}</span>
    </span>
  );
}
