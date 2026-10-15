'use client';

import { FormEvent, useState } from 'react';

export function PasswordResetForm() {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    if (typeof password !== 'string' || typeof confirmPassword !== 'string') {
      setMessage('Enter and confirm your new password.');
      setSaving(false);
      return;
    }
    if (password !== confirmPassword) {
      setMessage('The passwords do not match.');
      setSaving(false);
      return;
    }

    const response = await fetch('/api/auth/password-reset/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, confirmPassword }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { code?: string } | null;
    if (response?.ok) {
      window.location.assign('/login?password=updated');
      return;
    }

    const errorMessages: Record<string, string> = {
      password_policy_failed: 'Use a password with at least 12 characters and confirm it exactly.',
      recovery_session_required:
        'This recovery link has expired. Request a new password reset link.',
      password_update_failed:
        'The password did not meet the security requirements. Choose another and retry.',
      session_revoke_failed:
        'The password changed, but existing sessions could not be revoked. Refresh this page and sign in again.',
    };
    setMessage(
      result?.code
        ? (errorMessages[result.code] ??
            'We could not update the password. Request a new link and retry.')
        : 'We could not reach the security service. Check the connection and retry.',
    );
    setSaving(false);
  }

  return (
    <form className="card" onSubmit={submit}>
      <label>
        New password
        <input
          aria-label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={1024}
          required
        />
      </label>
      <label>
        Confirm new password
        <input
          aria-label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={1024}
          required
        />
      </label>
      <p>
        <button type="submit" disabled={saving}>
          {saving ? 'Updating password…' : 'Update password'}
        </button>
      </p>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
