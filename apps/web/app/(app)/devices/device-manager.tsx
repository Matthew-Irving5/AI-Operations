'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Device = {
  id: string;
  label: string;
  state: string;
  paired_at: string | null;
  revoked_at: string | null;
  last_heartbeat_at: string | null;
};
type Scan = {
  id: string;
  device_id: string;
  scan_kind: string;
  status: string;
  progress: number;
  result_verified_at: string | null;
};

type ApiResult = {
  code?: string;
  requestId?: string;
  device?: { id: string; pairingExpiresAt: string };
  pairingCode?: string;
};

const registerKey = 'worker_device_register_intent';
const revokeKey = 'worker_device_revoke_intent';

function errorText(body: ApiResult | null, status: number, stage: string) {
  const code = body?.code ?? `http_${status}`;
  const request = body?.requestId ? ` Request ID: ${body.requestId}.` : '';
  return `${stage} failed (${code}).${request}`;
}

export function DeviceManager({
  devices,
  scans,
  currentTimeMs,
}: Readonly<{ devices: Device[]; scans: Scan[]; currentTimeMs: number }>) {
  const router = useRouter();
  const [label, setLabel] = useState('Windows PC');
  const [publicKey, setPublicKey] = useState('');
  const [message, setMessage] = useState('');
  const [pairing, setPairing] = useState<{
    deviceId: string;
    code: string;
    expiresAt: string;
  } | null>(null);
  const [pairingSeconds, setPairingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!pairing) {
      window.setTimeout(() => setPairingSeconds(null), 0);
      return;
    }
    const update = () =>
      setPairingSeconds(
        Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - Date.now()) / 1000)),
      );
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [pairing]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resume = params.get('resume');
    if (resume !== 'worker_register' && resume !== 'worker_revoke') return;
    const rawGate = sessionStorage.getItem('mfa_job_gate');
    sessionStorage.removeItem('mfa_job_gate');
    const rawIntent = sessionStorage.getItem(
      resume === 'worker_register' ? registerKey : revokeKey,
    );
    sessionStorage.removeItem(resume === 'worker_register' ? registerKey : revokeKey);
    if (!rawGate || !rawIntent) {
      window.setTimeout(
        () =>
          setMessage('MFA did not create a valid one-time device gate. Start the operation again.'),
        0,
      );
      return;
    }
    try {
      const gate = JSON.parse(rawGate) as { job?: string; id?: string };
      const intent = JSON.parse(rawIntent) as {
        label?: string;
        publicKeyB64?: string;
        deviceId?: string;
      };
      const expected =
        resume === 'worker_register' ? 'worker_device_register' : 'worker_device_revoke';
      if (gate.job !== expected || !gate.id) throw new Error('invalid_gate');
      void (async () => {
        const endpoint =
          resume === 'worker_register' ? '/api/devices/register' : '/api/devices/revoke';
        const body =
          resume === 'worker_register'
            ? { label: intent.label, publicKeyB64: intent.publicKeyB64, mfaGateId: gate.id }
            : { deviceId: intent.deviceId, mfaGateId: gate.id };
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = (await response.json().catch(() => null)) as ApiResult | null;
        if (!response.ok) {
          setMessage(
            errorText(
              result,
              response.status,
              resume === 'worker_register' ? 'Registration' : 'Revocation',
            ),
          );
          return;
        }
        if (resume === 'worker_register' && result?.device && result.pairingCode) {
          setPairing({
            deviceId: result.device.id,
            code: result.pairingCode,
            expiresAt: result.device.pairingExpiresAt,
          });
          setMessage(
            'Registration succeeded. Pair the worker locally before the code expires, then refresh this page.',
          );
        } else {
          setMessage('Device revoked. The worker will be rejected on its next request.');
          router.refresh();
        }
      })();
    } catch {
      window.setTimeout(
        () => setMessage('The saved device operation was invalid. Start again.'),
        0,
      );
    }
  }, [router]);

  function startRegistration() {
    if (!label.trim() || !publicKey.trim()) return;
    sessionStorage.setItem(registerKey, JSON.stringify({ label, publicKeyB64: publicKey.trim() }));
    window.location.assign(
      '/mfa?returnTo=%2Fdevices%3Fresume%3Dworker_register&job=worker_device_register',
    );
  }

  function startRevoke(deviceId: string) {
    sessionStorage.setItem(revokeKey, JSON.stringify({ deviceId }));
    window.location.assign(
      '/mfa?returnTo=%2Fdevices%3Fresume%3Dworker_revoke&job=worker_device_revoke',
    );
  }

  return (
    <section className="stack" aria-label="Windows worker management">
      <article className="card">
        <h2>Register Windows worker</h2>
        <p>
          Generate the key locally with the signed worker release. Paste only its public key here.
        </p>
        <label>
          Device label
          <input value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Ed25519 public key (base64)
          <textarea
            value={publicKey}
            rows={3}
            onChange={(event) => setPublicKey(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!label.trim() || !publicKey.trim()}
          onClick={startRegistration}
        >
          Register after fresh MFA
        </button>
        {pairing && (
          <div role="status">
            <p>
              <strong>One-time pairing code:</strong> <code>{pairing.code}</code>
            </p>
            <p>
              Device ID: <code>{pairing.deviceId}</code>
            </p>
            <p>
              Expires:{' '}
              {new Date(pairing.expiresAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}.
            </p>
            <p aria-live="polite">
              {pairingSeconds === null
                ? 'Calculating expiry…'
                : pairingSeconds > 0
                  ? `${Math.floor(pairingSeconds / 60)}m ${pairingSeconds % 60}s remaining.`
                  : 'Expired. Generate a new registration to pair.'}
            </p>
            <p role="status">Waiting for pairing. Enter the code in the local worker command.</p>
            <p>
              Enter this code with the worker&apos;s local pair command. It is not stored in the
              browser.
            </p>
          </div>
        )}
        <p aria-live="polite">{message}</p>
      </article>
      {devices.map((device) => (
        <article className="card" key={device.id}>
          <h2>{device.label}</h2>
          <p>
            {device.state !== 'revoked' &&
            device.last_heartbeat_at &&
            Date.parse(device.last_heartbeat_at) >= currentTimeMs - 30 * 60_000
              ? 'online'
              : device.state === 'revoked'
                ? 'revoked'
                : 'offline'}
            ; last heartbeat{' '}
            {device.last_heartbeat_at
              ? new Date(device.last_heartbeat_at).toLocaleString('en-GB', {
                  timeZone: 'Europe/London',
                })
              : 'not received'}
            .
          </p>
          {device.last_heartbeat_at &&
          Date.parse(device.last_heartbeat_at) >= currentTimeMs - 30 * 60_000 ? (
            <p role="status">Heartbeat received within the last 30 minutes.</p>
          ) : null}
          {scans.some(
            (scan) =>
              scan.device_id === device.id &&
              scan.scan_kind === 'lightweight' &&
              scan.status === 'complete' &&
              Boolean(scan.result_verified_at),
          ) ? (
            <p role="status">Verified smoke scan complete.</p>
          ) : (
            <p>
              <a href="/digital-estate">Run smoke scan</a> after the heartbeat is received.
            </p>
          )}
          {device.state !== 'revoked' && (
            <button type="button" onClick={() => startRevoke(device.id)}>
              Revoke after fresh MFA
            </button>
          )}
        </article>
      ))}
      <button type="button" onClick={() => router.refresh()}>
        Refresh worker status
      </button>
    </section>
  );
}
