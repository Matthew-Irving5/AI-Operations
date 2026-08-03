'use client';

import { useState } from 'react';

export function ApprovalDecisionForm({ approvalId }: Readonly<{ approvalId: string }>) {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  async function decide(decision: 'approved' | 'rejected') {
    setStatus('Submitting decision…');
    const response = await fetch('/api/approvals/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId, decision, note }),
    });
    setStatus(
      response.ok
        ? `${decision === 'approved' ? 'Approved' : 'Rejected'}. Refresh to update the list.`
        : 'Decision was rejected. Complete fresh MFA and try again.',
    );
  }
  return (
    <section className="approval-decision">
      <label>
        Decision note (optional)
        <textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div>
        <button type="button" onClick={() => decide('approved')}>
          Approve
        </button>
        <button type="button" onClick={() => decide('rejected')}>
          Reject
        </button>
      </div>
      <p aria-live="polite">{status}</p>
    </section>
  );
}
