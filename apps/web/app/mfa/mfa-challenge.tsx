'use client';

import { FormEvent, useEffect, useState } from 'react';

export function MfaChallenge({
  factorId,
  returnTo = '/overview',
  job,
}: {
  factorId?: string;
  returnTo?: string;
  job?: 'apple_bridge' | 'gmail_test';
}) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [enrolment, setEnrolment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  }>();

  useEffect(() => {
    if (factorId) return;
    void fetch('/api/auth/mfa/enroll', { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) throw new Error('enrolment_failed');
        return response.json() as Promise<{ factorId: string; qrCode: string; secret: string }>;
      })
      .then(setEnrolment)
      .catch(() =>
        setMessage('We could not start authenticator enrolment. Refresh and try again.'),
      );
  }, [factorId]);

  const activeFactorId = factorId ?? enrolment?.factorId;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeFactorId) return;
    const intentKey = job === 'apple_bridge' ? 'apple_bridge_setup_intent' : 'gmail_test_intent';
    const rawIntent = job ? sessionStorage.getItem(intentKey) : null;
    let jobPayload: { label: string; enabledLists: string[] } | undefined;
    if (rawIntent && job === 'apple_bridge') {
      try {
        jobPayload = JSON.parse(rawIntent) as { label: string; enabledLists: string[] };
      } catch {
        return setMessage(
          'The pending setup request is invalid. Return and start the setup again.',
        );
      }
    }
    const response = await fetch('/api/auth/mfa/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ factorId: activeFactorId, code, job, jobPayload }),
    });
    const result = (await response.json().catch(() => null)) as {
      code?: string;
      reason?: { code?: string };
      jobCompleted?: boolean;
      jobResult?: unknown;
    } | null;
    if (!response.ok) {
      if (result?.code === 'job_failed') {
        return setMessage(
          `MFA verified, but the requested job failed (${result.reason?.code ?? 'unknown'}).`,
        );
      }
      return setMessage(
        result?.code === 'verification_failed'
          ? 'Verification failed. Check the current code and try again.'
          : `MFA request failed (${result?.code ?? `http_${response.status}`}).`,
      );
    }
    if (job && result?.jobCompleted) {
      sessionStorage.removeItem(intentKey);
      sessionStorage.setItem('mfa_job_result', JSON.stringify({ job, result: result.jobResult }));
    }
    window.location.assign(returnTo);
  }
  return (
    <form className="card" onSubmit={submit}>
      {!factorId && !enrolment && <p>Preparing secure authenticator enrolment…</p>}
      {enrolment && (
        <section aria-label="Authenticator enrolment">
          <p>Scan this QR code in Microsoft Authenticator, then enter its current code.</p>
          {/* Supabase returns a data URL; no third-party image host is used. */}
          <img
            src={enrolment.qrCode}
            alt="Authenticator enrolment QR code"
            width={220}
            height={220}
          />
          <p className="label">Can’t scan it? Enter this secret manually: {enrolment.secret}</p>
        </section>
      )}
      <label>
        Six-digit code
        <input
          aria-label="Six-digit code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
      </label>
      <p>
        <button type="submit" disabled={!activeFactorId}>
          Verify
        </button>
      </p>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
