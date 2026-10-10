'use client';

import { FormEvent, useEffect, useState, useSyncExternalStore } from 'react';

const mfaGateStorageKey = 'mfa_job_gate';
const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

/**
 * The MFA page and the resumed operation can be rendered in different tabs by
 * mobile Safari/embedded browsers. Keep the one-time gate in both stores so a
 * tab switch cannot silently drop a successfully-created server gate. The
 * gate is short-lived and is still consumed and authorised server-side.
 */
function storeMfaGate(value: string) {
  const stores: Storage[] = [];
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    try {
      stores.push(window[name]);
    } catch {
      // A storage backend can be unavailable in privacy/sandbox contexts.
    }
  }
  for (const storage of stores) {
    try {
      storage.setItem(mfaGateStorageKey, value);
    } catch {
      // The resumed page reports this as a structured handoff failure.
    }
  }
}

export function MfaChallenge({
  factorId,
  defaultFactorId,
  availableFactors = [],
  returnTo = '/overview',
  job,
  onVerified,
}: {
  factorId?: string;
  defaultFactorId?: string;
  availableFactors?: Array<{ id: string; friendlyName: string }>;
  returnTo?: string;
  job?:
    | 'apple_bridge'
    | 'gmail_test'
    | 'connection_revoke'
    | 'connection_scope_change'
    | 'worker_device_register'
    | 'worker_device_revoke'
    | 'digital_scan_create'
    | 'finance_configure'
    | 'finance_import'
    | 'github_sync'
    | 'schedule_update';
  onVerified?: (mfaGateId: string) => void;
}) {
  const [message, setMessage] = useState('');
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const [selectedFactorId, setSelectedFactorId] = useState(
    factorId ?? defaultFactorId ?? availableFactors[0]?.id,
  );
  const [enrolment, setEnrolment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  }>();

  useEffect(() => {
    if (factorId || availableFactors.length > 0) return;
    void fetch('/api/auth/mfa/enroll', { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) throw new Error('enrolment_failed');
        return response.json() as Promise<{ factorId: string; qrCode: string; secret: string }>;
      })
      .then(setEnrolment)
      .catch(() =>
        setMessage('We could not start authenticator enrolment. Refresh and try again.'),
      );
  }, [availableFactors.length, factorId]);

  const activeFactorId = factorId ?? selectedFactorId ?? enrolment?.factorId;
  const workerReturnTo =
    job === 'worker_device_register'
      ? '/devices?resume=worker_register'
      : job === 'worker_device_revoke'
        ? '/devices?resume=worker_revoke'
        : undefined;
  const scanReturnTo =
    job === 'digital_scan_create' ? '/digital-estate?resume=scan_create' : undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeFactorId) return;
    const submittedCode = new FormData(event.currentTarget).get('code');
    if (typeof submittedCode !== 'string' || !/^[0-9]{6}$/.test(submittedCode)) {
      setMessage('Enter the current six-digit authenticator code.');
      return;
    }
    const response = await fetch('/api/auth/mfa/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ factorId: activeFactorId, code: submittedCode, job }),
    });
    const result = (await response.json().catch(() => null)) as {
      code?: string;
      mfaGateId?: string;
      diagnostic?: {
        code?: string;
        stage?: string;
        httpStatus?: number;
        requestId?: string;
        detail?: string;
        remediation?: string;
      };
    } | null;
    if (!response.ok) {
      const diagnostic = result?.diagnostic;
      return setMessage(
        [
          `MFA failed: ${diagnostic?.code ?? result?.code ?? `http_${response.status}`}`,
          diagnostic?.stage ? `stage=${diagnostic.stage}` : undefined,
          `status=${diagnostic?.httpStatus ?? response.status}`,
          `requestId=${diagnostic?.requestId ?? response.headers.get('x-request-id') ?? 'unavailable'}`,
          diagnostic?.detail,
          diagnostic?.remediation,
        ]
          .filter(Boolean)
          .join(' | '),
      );
    }
    if (job && !result?.mfaGateId) {
      return setMessage(
        'MFA succeeded, but the server did not return the one-time operation gate (mfa_gate_not_returned). Start the operation again in this browser; no operation was submitted.',
      );
    }
    if (onVerified) {
      if (!result?.mfaGateId) {
        return setMessage(
          'MFA succeeded, but the in-page operation gate was not returned (mfa_gate_not_returned). No operation was submitted; start the Finance action again.',
        );
      }
      onVerified(result.mfaGateId);
      return;
    }
    if (job && result?.mfaGateId) {
      storeMfaGate(JSON.stringify({ job, id: result.mfaGateId }));
    }
    try {
      const channel = new BroadcastChannel('ai-operations-mfa');
      channel.postMessage({ type: 'mfa_verified' });
      channel.close();
    } catch {
      // Storage below is the fallback for browsers without BroadcastChannel.
    }
    try {
      localStorage.setItem('ai_operations_mfa_verified', String(Date.now()));
      localStorage.removeItem('ai_operations_mfa_verified');
    } catch {
      // The resumed finance page reports that the automatic handoff was unavailable.
    }
    window.location.assign(workerReturnTo ?? scanReturnTo ?? returnTo);
  }
  return (
    <form className="card" method="post" onSubmit={submit}>
      {!factorId && !enrolment && <p>Preparing secure authenticator enrolment…</p>}
      {availableFactors.length > 0 && !factorId && (
        <label>
          Authenticator factor
          <select
            aria-label="Authenticator factor"
            value={selectedFactorId ?? ''}
            onChange={(event) => setSelectedFactorId(event.target.value)}
          >
            {availableFactors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.friendlyName}
              </option>
            ))}
          </select>
        </label>
      )}
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
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
      </label>
      <p>
        <button type="submit" disabled={!activeFactorId || !hydrated}>
          Verify
        </button>
      </p>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
