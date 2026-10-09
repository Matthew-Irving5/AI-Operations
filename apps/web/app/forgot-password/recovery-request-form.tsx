'use client';

import { FormEvent, useState } from 'react';

export function RecoveryRequestForm() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSending(true);
    const response = await fetch('/api/auth/password-reset', {
      method: 'POST',
      body: new FormData(event.currentTarget),
    }).catch(() => null);
    if (response?.ok) {
      setMessage('If the address is eligible, a recovery link will arrive shortly.');
    } else {
      setMessage('We could not process the request. Reload the page and try again.');
    }
    setSending(false);
  }

  return (
    <form className="card" onSubmit={submit}>
      <label>
        Email
        <input aria-label="Email" name="email" type="email" required autoComplete="email" />
      </label>
      <p>
        <button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send recovery link'}
        </button>
      </p>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
