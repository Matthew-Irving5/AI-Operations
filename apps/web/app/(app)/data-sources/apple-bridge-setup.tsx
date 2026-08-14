'use client';

import { useCallback, useEffect, useState } from 'react';

const lists = ['Fitness Plan', 'Household & Personal', 'AI Actions'];
const resumeKey = 'apple_bridge_setup_intent';

type DeviceResponse = {
  code?: string;
  token?: string;
};

export function AppleBridgeSetup() {
  const [label, setLabel] = useState('Matthew iPhone');
  const [enabledLists, setEnabledLists] = useState(['Fitness Plan', 'Household & Personal']);
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const createDevice = useCallback(async (intent = { label, enabledLists }) => {
    setBusy(true);
    setMessage('Creating secure Apple bridge…');
    const response = await fetch('/api/apple-bridge/device', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(intent),
    });
    const body = (await response.json().catch(() => null)) as DeviceResponse | null;
    if (response.status === 403 && body?.code === 'fresh_mfa_required') {
      sessionStorage.setItem(resumeKey, JSON.stringify(intent));
      window.location.assign('/mfa?returnTo=%2Fdata-sources%3Fresume%3Dapple_bridge');
      return;
    }
    setBusy(false);
    if (!response.ok || !body?.token) {
      setMessage(`Bridge setup failed (${body?.code ?? `http_${response.status}`}).`);
      return;
    }
    setToken(body.token);
    setMessage('Device created. Copy this token into the Shortcut now; it is shown only once.');
  }, [enabledLists, label]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('resume') !== 'apple_bridge') return;
    const raw = sessionStorage.getItem(resumeKey);
    sessionStorage.removeItem(resumeKey);
    if (!raw) return;
    try {
      const intent = JSON.parse(raw) as { label?: string; enabledLists?: string[] };
      if (intent.label && intent.enabledLists?.length) {
        window.setTimeout(() => void createDevice({ label: intent.label!, enabledLists: intent.enabledLists! }), 0);
      }
    } catch {
      window.setTimeout(() => setMessage('The saved setup request was invalid. Start bridge setup again.'), 0);
    }
  }, [createDevice]);

  return (
    <div className="stack">
      <label>
        Device name
        <input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <fieldset>
        <legend>Reminder lists to sync</legend>
        {lists.map((list) => (
          <label key={list}>
            <input
              type="checkbox"
              checked={enabledLists.includes(list)}
              onChange={(event) => setEnabledLists((current) => event.target.checked ? [...current, list] : current.filter((item) => item !== list))}
            />{' '}{list}
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={busy || !label.trim() || !enabledLists.length} onClick={() => void createDevice()}>
        {busy ? 'Setting up…' : 'Set up Apple Shortcut bridge'}
      </button>
      {token && <p><strong>One-time device token:</strong> <code>{token}</code></p>}
      <p aria-live="polite">{message}</p>
    </div>
  );
}
