'use client';

import { useEffect, useState } from 'react';

const intentKey = 'digital_scan_create_intent';
const gateKey = 'mfa_job_gate';

type ScanIntent = {
  deviceId: string;
  roots: string[];
  scanKind: 'lightweight' | 'deep';
  hardCapUsd: number;
  searchCeiling: number;
  idempotencyKey: string;
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
  replay?: boolean;
};

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
      // The resumed page reports a precise handoff failure.
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

function errorText(body: ApiResult | null, status: number, requestId: string) {
  const diagnostic = body?.diagnostic;
  return [
    `Scan request failed: ${diagnostic?.code ?? body?.code ?? `http_${status}`}`,
    `stage=${diagnostic?.stage ?? body?.stage ?? 'scan_create'}`,
    `status=${diagnostic?.httpStatus ?? status}`,
    `requestId=${diagnostic?.requestId ?? body?.requestId ?? requestId}`,
    diagnostic?.detail,
    diagnostic?.remediation,
  ]
    .filter(Boolean)
    .join(' | ');
}

export function DigitalScanForm({ deviceId }: Readonly<{ deviceId: string }>) {
  const [roots, setRoots] = useState('');
  const [scanKind, setScanKind] = useState<'lightweight' | 'deep'>('lightweight');
  const [status, setStatus] = useState('');

  async function submitWithGate(intent: ScanIntent, mfaGateId?: string) {
    const requestId = crypto.randomUUID();
    try {
      const response = await fetch('/api/digital-estate/scans', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-request-id': requestId,
        },
        body: JSON.stringify(mfaGateId ? { ...intent, mfaGateId } : intent),
      });
      const result = (await response.json().catch(() => null)) as ApiResult | null;
      if (response.ok) {
        clearHandoff(intentKey);
        clearHandoff(gateKey);
        setStatus(
          result?.replay
            ? 'This scan request was already queued; no duplicate was created.'
            : 'Scan queued. The worker will collect it when online.',
        );
        return;
      }
      setStatus(errorText(result, response.status, requestId));
    } catch {
      setStatus(
        `Scan request failed: network_error | stage=browser_to_control_plane | requestId=${requestId} | The request did not reach the control plane. Refresh once to retry; the one-time MFA gate was not intentionally consumed.`,
      );
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('resume') !== 'scan_create') return;
    const rawIntent = readHandoff(intentKey);
    if (!rawIntent) {
      window.setTimeout(
        () =>
          setStatus(
            'Scan MFA succeeded, but the scan request was not available when Digital Estate resumed (handoff_missing). Start the scan again in this same browser.',
          ),
        0,
      );
      return;
    }
    try {
      const intent = JSON.parse(rawIntent) as ScanIntent;
      const rawGate = readHandoff(gateKey);
      let gateId: string | undefined;
      if (rawGate) {
        const gate = JSON.parse(rawGate) as { job?: string; id?: string };
        if (gate.job !== 'digital_scan_create' || !gate.id) throw new Error('invalid_gate');
        gateId = gate.id;
      }
      window.setTimeout(() => void submitWithGate(intent, gateId), 0);
    } catch {
      window.setTimeout(
        () => setStatus('The saved scan operation was invalid. Start the scan again.'),
        0,
      );
    }
  }, []);

  function submit() {
    const trimmedRoots = roots
      .split('\n')
      .map((root) => root.trim())
      .filter(Boolean);
    const intent: ScanIntent = {
      deviceId,
      roots: trimmedRoots,
      scanKind,
      hardCapUsd: scanKind === 'deep' ? 1 : 0.25,
      searchCeiling: scanKind === 'deep' ? 3 : 0,
      idempotencyKey: `digital-scan:${deviceId}:${Date.now()}`,
    };
    setHandoff(intentKey, JSON.stringify(intent));
    setStatus('Redirecting to fresh MFA before queuing the read-only scan...');
    window.location.assign(
      '/mfa?returnTo=%2Fdigital-estate%3Fresume%3Dscan_create&job=digital_scan_create',
    );
  }

  return (
    <section className="card">
      <h2>Launch scan</h2>
      <p className="label">
        Fresh MFA is required to queue a local scan. The request is read-only and bounded to the
        approved roots.
      </p>
      <label>
        Approved roots
        <span className="label">
          Use a safe synthetic onboarding folder; sensitive paths are excluded.
        </span>
        <textarea value={roots} onChange={(event) => setRoots(event.target.value)} rows={3} />
      </label>
      <label>
        Scan type
        <select
          value={scanKind}
          onChange={(event) => setScanKind(event.target.value as 'lightweight' | 'deep')}
        >
          <option value="lightweight">Lightweight inventory</option>
          <option value="deep">Deep organisation analysis</option>
        </select>
      </label>
      <button type="button" disabled={!roots.trim()} onClick={submit}>
        Queue bounded scan (fresh MFA required)
      </button>
      <p aria-live="polite">{status}</p>
    </section>
  );
}
