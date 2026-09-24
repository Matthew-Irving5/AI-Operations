'use client';

import { useCallback, useState } from 'react';
import { MfaChallenge } from '../../mfa/mfa-challenge';

type DiagnosticPayload = {
  code?: string;
  requestId?: string;
  diagnostic?: {
    code?: string;
    stage?: string;
    httpStatus?: number;
    requestId?: string;
    detail?: string;
    remediation?: string;
  };
};

function errorText(payload: DiagnosticPayload | null, status: number, fallback: string) {
  const diagnostic = payload?.diagnostic;
  return [
    `${diagnostic?.code ?? payload?.code ?? fallback} · ${diagnostic?.stage ?? 'unknown'} · HTTP ${diagnostic?.httpStatus ?? status} · request ${diagnostic?.requestId ?? payload?.requestId ?? 'unknown'}`,
    diagnostic?.detail ?? 'No diagnostic detail was returned.',
    diagnostic?.remediation ?? 'Retry only after correcting the named boundary.',
  ].join(' — ');
}

export function GithubSyncControl({ factorId }: Readonly<{ factorId?: string }>) {
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const sync = useCallback(async (mfaGateId: string) => {
    setBusy(true);
    setMessage('MFA verified. Fetching personal repository metadata and storing evidence…');
    try {
      const response = await fetch('/api/career/github-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mfaGateId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (DiagnosticPayload & { repositories?: number; retrievedAt?: string })
        | null;
      if (!response.ok) {
        setMessage(errorText(payload, response.status, 'github_sync_failed'));
        return;
      }
      setMessage(
        `GitHub sync complete: ${payload?.repositories ?? 0} personal repositories recorded with provenance.`,
      );
      window.location.reload();
    } catch {
      setMessage(
        'github_sync_network_failed · browser_to_control_plane · HTTP 502 · request unavailable — The sync request could not reach AI Operations; no repository evidence was confirmed. Retry once.',
      );
    } finally {
      setBusy(false);
      setMfaRequired(false);
    }
  }, []);

  return (
    <section className="card stack" aria-label="Personal GitHub connection">
      <h2>Read-only GitHub connection</h2>
      <p>
        This imports repository metadata only from <strong>Matthew-Irving5</strong>. It never writes
        to GitHub and never sends outreach. A fresh MFA check is required before each sync.
      </p>
      {mfaRequired ? (
        <article className="stack" aria-label="GitHub fresh MFA">
          <p>
            Verify below. Your sync request is held in this page and submits automatically after
            Microsoft Authenticator verification.
          </p>
          <MfaChallenge
            job="github_sync"
            onVerified={(mfaGateId) => void sync(mfaGateId)}
            {...(factorId ? { factorId } : {})}
          />
          <button type="button" onClick={() => setMfaRequired(false)} disabled={busy}>
            Cancel MFA and return to Career
          </button>
        </article>
      ) : (
        <button type="button" onClick={() => setMfaRequired(true)} disabled={busy}>
          Connect and sync personal GitHub (fresh MFA required)
        </button>
      )}
      <p aria-live="polite" role={message.includes('failed') ? 'alert' : 'status'}>
        {message}
      </p>
    </section>
  );
}
