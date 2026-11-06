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

export function ArchivedPayload({
  objectKey,
  factorId,
}: Readonly<{ objectKey: string; factorId?: string }>) {
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const retrieve = useCallback(
    async (mfaGateId: string) => {
      setBusy(true);
      setMessage('MFA verified. Checking the archived bytes against the saved evidence checksum…');
      try {
        const path = objectKey.split('/').map(encodeURIComponent).join('/');
        const response = await fetch(`/api/archive/${path}`, {
          headers: { 'x-mfa-gate-id': mfaGateId },
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as DiagnosticPayload | null;
          const diagnostic = payload?.diagnostic;
          setMessage(
            [
              `${diagnostic?.code ?? payload?.code ?? `http_${response.status}`} · ${diagnostic?.stage ?? 'archive.readback'} · request ${diagnostic?.requestId ?? payload?.requestId ?? response.headers.get('x-request-id') ?? 'unavailable'}`,
              diagnostic?.detail,
              diagnostic?.remediation,
            ]
              .filter(Boolean)
              .join(' — '),
          );
          return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'archived-evidence';
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage('Archived evidence was verified and downloaded.');
      } catch {
        setMessage(
          'archive_network_failed · The verified archive could not be retrieved. Retry after the storage path is available.',
        );
      } finally {
        setBusy(false);
        setMfaRequired(false);
      }
    },
    [objectKey],
  );

  return (
    <section className="stack" aria-label="Archived trace evidence">
      {mfaRequired ? (
        <article className="stack" aria-label="Fresh MFA for archived evidence">
          <p>
            Verify with Microsoft Authenticator. The archive is downloaded only after its ownership
            and checksum are verified.
          </p>
          <MfaChallenge
            job="archive_read"
            onVerified={(mfaGateId) => void retrieve(mfaGateId)}
            {...(factorId ? { factorId } : {})}
          />
          <button type="button" onClick={() => setMfaRequired(false)} disabled={busy}>
            Cancel archive read
          </button>
        </article>
      ) : (
        <button type="button" onClick={() => setMfaRequired(true)} disabled={busy}>
          Download verified archived evidence (fresh MFA required)
        </button>
      )}
      <p aria-live="polite" role={message.includes('failed') ? 'alert' : 'status'}>
        {message}
      </p>
    </section>
  );
}
