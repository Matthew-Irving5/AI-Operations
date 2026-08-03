'use client';

import { useState } from 'react';

export function OnDemandLaunchForm({ manager }: Readonly<{ manager: 'travel' | 'procurement' }>) {
  const [status, setStatus] = useState('');
  async function submit(formData: FormData) {
    setStatus('Submitting bounded research request...');
    const response = await fetch('/api/workflows/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workflowCode:
          manager === 'travel' ? 'travel-on-demand-plan' : 'procurement-on-demand-research',
        managerCode: manager,
        hardCapUsd: Number(formData.get('hardCapUsd')),
        searchCeiling: Number(formData.get('searchCeiling')),
        modelCeiling: 'gpt-5.6-terra',
        idempotencyKey: crypto.randomUUID(),
        request: { purpose: formData.get('purpose'), constraints: formData.get('constraints') },
      }),
    });
    setStatus(
      response.ok
        ? 'Request queued. Its approved cap and brief are retained with the run.'
        : 'Request was rejected. Confirm fresh MFA and bounded inputs.',
    );
  }
  return (
    <form className="stack card" action={submit}>
      <h2>Launch bounded research</h2>
      <label>
        Purpose <textarea name="purpose" required minLength={3} maxLength={2000} />
      </label>
      <label>
        Constraints <textarea name="constraints" maxLength={4000} />
      </label>
      <label>
        Hard cap (USD){' '}
        <input name="hardCapUsd" type="number" min="0.01" max="1000" step="0.01" required />
      </label>
      <label>
        Search ceiling{' '}
        <input name="searchCeiling" type="number" min="0" max="20" defaultValue="10" required />
      </label>
      <button type="submit">Queue research</button>
      <p aria-live="polite">{status}</p>
    </form>
  );
}
