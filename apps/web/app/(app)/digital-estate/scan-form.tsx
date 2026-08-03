'use client';

import { useState } from 'react';

export function DigitalScanForm({ deviceId }: Readonly<{ deviceId: string }>) {
  const [roots, setRoots] = useState('C:\\Users\\Matthew\\Documents');
  const [scanKind, setScanKind] = useState<'lightweight' | 'deep'>('lightweight');
  const [status, setStatus] = useState('');
  async function submit() {
    setStatus('Submitting bounded scan...');
    const response = await fetch('/api/digital-estate/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        roots: roots
          .split('\n')
          .map((root) => root.trim())
          .filter(Boolean),
        scanKind,
        hardCapUsd: scanKind === 'deep' ? 1 : 0.25,
        searchCeiling: scanKind === 'deep' ? 3 : 0,
        idempotencyKey: `digital-scan:${deviceId}:${Date.now()}`,
      }),
    });
    setStatus(
      response.ok
        ? 'Scan queued. The worker will collect it when online.'
        : 'Scan request was rejected. Complete fresh MFA and review the selected roots.',
    );
  }
  return (
    <section className="card">
      <h2>Launch scan</h2>
      <label>
        Approved roots
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
      <button type="button" onClick={submit}>
        Queue bounded scan
      </button>
      <p aria-live="polite">{status}</p>
    </section>
  );
}
