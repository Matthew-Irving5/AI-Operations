'use client';

import { useState } from 'react';
import { z } from 'zod';

const enrollmentSchema = z.object({
  factorId: z.string().uuid(),
  friendlyName: z.string(),
  qrCode: z.string().startsWith('data:image/'),
  secret: z.string().min(16),
});
const codeSchema = z.object({ code: z.string().optional() });

export function StagingE2eFactorEnrollment({
  hasExistingFactor,
  pendingFactorIds,
}: {
  hasExistingFactor: boolean;
  pendingFactorIds: string[];
}) {
  const [enrollment, setEnrollment] = useState<z.infer<typeof enrollmentSchema>>();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [verified, setVerified] = useState(hasExistingFactor);

  async function startEnrollment() {
    setMessage('');
    const response = await fetch('/api/auth/mfa/staging-e2e-factor/enroll', { method: 'POST' });
    const result: unknown = await response.json().catch(() => null);
    const parsed = enrollmentSchema.safeParse(result);
    if (!response.ok || !parsed.success) {
      setMessage('Enrollment could not start. Check the factor list and try again.');
      return;
    }
    setEnrollment(parsed.data);
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    const response = await fetch('/api/auth/mfa/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ factorId: enrollment.factorId, code }),
    });
    const result: unknown = await response.json().catch(() => null);
    const parsed = codeSchema.safeParse(result);
    if (!response.ok || !parsed.success) {
      setMessage('Code verification failed. Keep the enrollment open and try a current code.');
      return;
    }
    setEnrollment(undefined);
    setCode('');
    setVerified(true);
    setMessage('The separate staging E2E factor is verified. Keep your existing login factor.');
  }

  async function cancel(factorId: string) {
    const response = await fetch('/api/auth/mfa/staging-e2e-factor/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ factorId }),
    });
    if (response.ok) window.location.reload();
    else
      setMessage('Pending enrollment could not be cancelled. Refresh the factor list and retry.');
  }

  return (
    <section className="card" aria-label="Staging E2E authenticator setup">
      <h2>Separate staging E2E authenticator</h2>
      <p>
        This adds a new factor without replacing your existing Microsoft Authenticator factor. Setup
        material appears once in this page and is not saved in browser storage.
      </p>
      {pendingFactorIds.map((factorId) => (
        <p key={factorId}>
          A pending E2E factor exists.{' '}
          <button onClick={() => void cancel(factorId)}>Cancel pending setup</button>
        </p>
      ))}
      {verified ? (
        <p>The staging E2E authenticator is verified.</p>
      ) : enrollment ? (
        <form onSubmit={verify}>
          <p>Scan this QR code using a separate authenticator entry.</p>
          <img
            src={enrollment.qrCode}
            alt="Staging E2E authenticator QR code"
            width={220}
            height={220}
          />
          <label>
            One-time setup key
            <input readOnly value={enrollment.secret} autoComplete="off" />
          </label>
          <p>
            Store the key directly in the protected GitHub staging secret LIVE_E2E_TOTP_SECRET.
            Store this factor ID as the protected staging variable LIVE_E2E_TOTP_FACTOR_ID:
            <code>{enrollment.factorId}</code>
          </p>
          <label>
            Current six-digit code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </label>
          <button type="submit">Verify new factor</button>
          <button type="button" onClick={() => void cancel(enrollment.factorId)}>
            Cancel setup
          </button>
        </form>
      ) : (
        <button onClick={() => void startEnrollment()}>Add staging E2E factor</button>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
