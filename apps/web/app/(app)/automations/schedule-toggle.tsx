'use client';

import { useState } from 'react';
import { MfaChallenge } from '../../mfa/mfa-challenge';

export function ScheduleToggle({
  scheduleId,
  enabled,
  factorId,
}: Readonly<{ scheduleId: string; enabled: boolean; factorId?: string }>) {
  const [current, setCurrent] = useState(enabled);
  const [message, setMessage] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState(false);
  async function update(nextEnabled: boolean, mfaGateId?: string) {
    setBusy(true);
    setMessage('Saving schedule...');
    try {
      const response = await fetch('/api/schedules/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          enabled: nextEnabled,
          ...(mfaGateId ? { mfaGateId } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        setMessage(
          response.status === 403 && payload?.code === 'fresh_mfa_required'
            ? 'Fresh MFA is required before changing this schedule.'
            : `Schedule change was rejected (${payload?.code ?? `http_${response.status}`}).`,
        );
        return;
      }
      setCurrent(nextEnabled);
      setMfaRequired(false);
      setMessage(nextEnabled ? 'Schedule enabled.' : 'Schedule disabled.');
    } catch {
      setMessage('Schedule change could not reach the server. No change was confirmed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {mfaRequired ? (
        <article className="stack" aria-label="Schedule fresh MFA">
          <p>
            Verify with Microsoft Authenticator to {pendingEnabled ? 'enable' : 'disable'} this
            schedule.
          </p>
          <MfaChallenge
            job="schedule_update"
            onVerified={(mfaGateId) => void update(pendingEnabled, mfaGateId)}
            {...(factorId ? { factorId } : {})}
          />
          <button type="button" onClick={() => setMfaRequired(false)} disabled={busy}>
            Cancel MFA
          </button>
        </article>
      ) : (
        <button
          type="button"
          onClick={() => {
            setPendingEnabled(!current);
            setMfaRequired(true);
          }}
          disabled={busy}
        >
          {current
            ? 'Disable schedule (fresh MFA required)'
            : 'Enable schedule (fresh MFA required)'}
        </button>
      )}
      <span aria-live="polite"> {message}</span>
    </>
  );
}
