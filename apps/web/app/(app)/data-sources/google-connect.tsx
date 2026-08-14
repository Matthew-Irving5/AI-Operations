'use client';

import { useState } from 'react';

export function GoogleConnect({ label = 'Connect Google' }: Readonly<{ label?: string }>) {
  const [status, setStatus] = useState('');
  async function connect() {
    setStatus('Preparing secure Google consent...');
    const response = await fetch('/api/google/connect', { method: 'POST' });
    const body = (await response.json().catch(() => null)) as {
      authorizationUrl?: string;
      code?: string;
    } | null;
    if (!response.ok || !body?.authorizationUrl) {
      setStatus(`Google connection could not start (${body?.code ?? `http_${response.status}`}).`);
      return;
    }
    window.location.assign(body.authorizationUrl);
  }
  return (
    <div>
      <button type="button" onClick={() => void connect()}>
        {label}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
