'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkerDevice } from '../../../lib/platform-data';

type Device = WorkerDevice;
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
  stage?: string;
  requestId?: string;
  diagnostic?: {
    code?: string;
    stage?: string;
    httpStatus?: number;
    requestId?: string;
    detail?: string;
    remediation?: string;
  };
  device?: { id: string; pairingExpiresAt: string };
  pairingCode?: string;
};

const registerKey = 'worker_device_register_intent';
const revokeKey = 'worker_device_revoke_intent';
const gateKey = 'mfa_job_gate';

function storageStores(): Storage[] {
  const stores: Storage[] = [];
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    try {
      stores.push(window[name]);
    } catch {
      // Try the other storage backend.
    }
  }
  return stores;
}

function setHandoff(key: string, value: string) {
  for (const storage of storageStores()) {
    try {
      storage.setItem(key, value);
    } catch {
      // The resumed page below reports a precise handoff error if storage is
      // unavailable. Never put the pairing code or private key in storage.
    }
  }
}

function readHandoff(key: string): string | null {
  for (const storage of storageStores()) {
    try {
      const value = storage.getItem(key);
      if (value) return value;
    } catch {
      // Try the other storage backend.
    }
  }
  return null;
}

function clearHandoff(key: string) {
  for (const storage of storageStores()) {
    try {
      storage.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
  }
}

function errorText(body: ApiResult | null, status: number, stage: string) {
  const diagnostic = body?.diagnostic;
  const code = diagnostic?.code ?? body?.code ?? `http_${status}`;
  const boundary = diagnostic?.stage ?? body?.stage ?? stage.toLowerCase();
  const requestId = diagnostic?.requestId ?? body?.requestId ?? 'unavailable';
  return [
    `${stage} failed: ${code}`,
    `stage=${boundary}`,
    `status=${diagnostic?.httpStatus ?? status}`,
    `requestId=${requestId}`,
    diagnostic?.detail,
    diagnostic?.remediation,
  ]
    .filter(Boolean)
    .join(' | ');
}

function workerConnected(device: Device, currentTimeMs: number): boolean {
  return (
    device.state !== 'revoked' &&
    Boolean(device.last_heartbeat_at) &&
    Date.parse(device.last_heartbeat_at ?? '') >= currentTimeMs - 30 * 60_000 &&
    device.health?.status.compatibility?.compatible === true
  );
}

type WorkerMode = 'active' | 'online' | 'offline' | 'revoked';

function workerMode(device: Device, currentTimeMs: number): WorkerMode {
  if (device.state === 'revoked') return 'revoked';
  if (!device.last_heartbeat_at || Date.parse(device.last_heartbeat_at) < currentTimeMs - 2 * 60_000) {
    return 'offline';
  }
  return device.state === 'active' ? 'active' : 'online';
}

export function DeviceManager({
  devices,
  scans,
  currentTimeMs,
  workerStartCommand,
}: Readonly<{
  devices: Device[];
  scans: Scan[];
  currentTimeMs: number;
  workerStartCommand: string;
}>) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [label, setLabel] = useState('Windows PC');
  const [publicKey, setPublicKey] = useState('');
  const [message, setMessage] = useState('');
  const [connectionCheckMessage, setConnectionCheckMessage] = useState('');
  const [controlState, setControlState] = useState<Record<string, string>>({});
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
    const intentKey = resume === 'worker_register' ? registerKey : revokeKey;
    const rawGate = readHandoff(gateKey);
    const rawIntent = readHandoff(intentKey);
    if (!rawGate || !rawIntent) {
      window.setTimeout(
        () =>
          setMessage(
            `MFA succeeded, but the ${!rawGate ? 'one-time gate' : 'device registration intent'} was not available when Devices resumed (handoff_missing). The registration request was not sent. Start registration again in this same browser.`,
          ),
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
        const clientRequestId = crypto.randomUUID();
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-client-request-id': clientRequestId,
            },
            body: JSON.stringify(body),
          });
          const result = (await response.json().catch(() => null)) as ApiResult | null;
          if (!response.ok) {
            const requestId =
              result?.requestId ?? response.headers.get('x-request-id') ?? undefined;
            setMessage(
              errorText(
                requestId ? { ...(result ?? {}), requestId } : result,
                response.status,
                resume === 'worker_register' ? 'Registration' : 'Revocation',
              ),
            );
            return;
          }
          clearHandoff(gateKey);
          clearHandoff(intentKey);
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
        } catch {
          setMessage(
            `${resume === 'worker_register' ? 'Registration' : 'Revocation'} request failed (network_error). Request ID: ${clientRequestId}. The one-time gate was preserved; refresh this page once to retry.`,
          );
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
    setHandoff(registerKey, JSON.stringify({ label, publicKeyB64: publicKey.trim() }));
    window.location.assign(
      '/mfa?returnTo=%2Fdevices%3Fresume%3Dworker_register&job=worker_device_register',
    );
  }

  function startRevoke(deviceId: string) {
    setHandoff(revokeKey, JSON.stringify({ deviceId }));
    window.location.assign(
      '/mfa?returnTo=%2Fdevices%3Fresume%3Dworker_revoke&job=worker_device_revoke',
    );
  }

  function checkConnection() {
    setConnectionCheckMessage('Refreshing worker heartbeat status…');
    startRefresh(() => {
      router.refresh();
      setConnectionCheckMessage('Worker status refresh requested.');
    });
  }

  async function controlWorker(deviceId: string, action: 'online' | 'active' | 'offline') {
    const pending = action === 'active' ? 'resuming…' : action === 'online' ? 'pausing…' : 'stopping…';
    setControlState((current) => ({ ...current, [deviceId]: pending }));
    try {
      const response = await fetch('/api/devices/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, desiredState: action }),
      });
      if (!response.ok) throw new Error('control_request_failed');
      setControlState((current) => ({ ...current, [deviceId]: `${action === 'active' ? 'resumed' : action === 'online' ? 'paused' : 'stopped'}` }));
      window.setTimeout(() => setControlState((current) => ({ ...current, [deviceId]: '' })), 3000);
      router.refresh();
    } catch {
      setControlState((current) => ({ ...current, [deviceId]: 'Unable to update worker state.' }));
    }
  }

  async function startWorker(deviceId: string) {
    setControlState((current) => ({ ...current, [deviceId]: 'starting…' }));
    try {
      const response = await fetch('/api/devices/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, desiredState: 'active' }),
      });
      if (!response.ok) throw new Error('control_request_failed');
      await navigator.clipboard.writeText(workerStartCommand);
      setControlState((current) => ({ ...current, [deviceId]: 'Start command copied.' }));
      window.setTimeout(() => setControlState((current) => ({ ...current, [deviceId]: '' })), 3000);
    } catch {
      setControlState((current) => ({ ...current, [deviceId]: 'Could not copy the start command.' }));
    }
  }

  return (
    <section className="stack" aria-label="Windows worker management">
      <article className="card">
        <h2>Start your Windows worker</h2>
        <p>
          The website can queue a scan only while the paired worker process is running on your PC.
          Use Start when it is offline; the launcher is copied to your clipboard for PowerShell.
        </p>
        <p>Start, pause, resume, or stop the paired worker without changing its identity.</p>
        <p aria-live="polite">{connectionCheckMessage}</p>
      </article>
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
      {devices.filter((device) => device.state !== 'revoked').map((device) => (
        <article className="card" key={device.id}>
          <h2>{device.label}</h2>
          {(() => {
            const mode = workerMode(device, currentTimeMs);
            return <>
            <p className={`worker-status worker-status-${mode}`}><strong>{mode}</strong>; last heartbeat{' '}
            {device.last_heartbeat_at
              ? new Date(device.last_heartbeat_at).toLocaleString('en-GB', {
                  timeZone: 'Europe/London',
                })
              : 'not received'}
            .</p>
            <div className="button-row" aria-label={`${mode} worker controls`}>
              {mode === 'offline' && <button type="button" onClick={() => void startWorker(device.id)} disabled={Boolean(controlState[device.id]?.endsWith('…'))}>Start</button>}
              {mode === 'active' && <><button type="button" onClick={() => void controlWorker(device.id, 'online')} disabled={Boolean(controlState[device.id]?.endsWith('…'))}>Pause</button><button type="button" onClick={() => void controlWorker(device.id, 'offline')} disabled={Boolean(controlState[device.id]?.endsWith('…'))}>Stop</button></>}
              {mode === 'online' && <button type="button" onClick={() => void controlWorker(device.id, 'active')} disabled={Boolean(controlState[device.id]?.endsWith('…'))}>Resume</button>}
            </div>
            {controlState[device.id] ? <p aria-live="polite">{controlState[device.id]}</p> : null}
            </>;
          })()}
          {workerConnected(device, currentTimeMs) ? (
            <p role="status">Connection verified by a heartbeat within the last 30 minutes.</p>
          ) : null}
          {device.health_error ? (
            <p role="alert">Worker version and capability status could not be loaded.</p>
          ) : !device.health ? (
            <p role="status">
              Worker version and capabilities will appear after its next heartbeat.
            </p>
          ) : (
            <>
              <p>
                Worker version: <code>{device.health.worker_version ?? 'not reported'}</code>.
              </p>
              <p>
                Compatibility:{' '}
                {device.health.status.compatibility?.compatible
                  ? 'supported'
                  : device.health.status.compatibility?.code === 'worker_upgrade_required'
                    ? `upgrade required; minimum ${device.health.status.compatibility.minimumVersion}, reported ${device.health.status.compatibility.actualVersion ?? 'unknown'}`
                    : device.health.status.compatibility?.code === 'worker_capability_missing'
                      ? 'required inventory capability missing; polling is blocked'
                      : device.health.status.compatibility?.code === 'worker_capability_unsupported'
                        ? 'worker reports an unsupported capability; polling is blocked'
                        : device.health.status.compatibility?.code === 'worker_version_required'
                          ? 'version reporting required; polling is blocked'
                          : 'compatibility has not been reported'}
                .
              </p>
              <p>
                Capabilities:{' '}
                {device.health.status.capabilities?.length
                  ? device.health.status.capabilities.join(', ')
                  : 'none reported'}
                .
              </p>
            </>
          )}
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
      <button
        type="button"
        onClick={checkConnection}
        disabled={isRefreshing}
        aria-busy={isRefreshing}
      >
        {isRefreshing ? 'Checking…' : 'Refresh worker status'}
      </button>
    </section>
  );
}
