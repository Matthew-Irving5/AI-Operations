'use client';

import { useMemo, useState } from 'react';

const steps = [
  ['supabase', 'Production Supabase secrets'],
  ['cloudflare_r2', 'Cloudflare and private R2 configuration'],
  ['openai', 'OpenAI project key and provider hard limit'],
  ['google_oauth', 'Google OAuth redirect and consent'],
  ['initial_login', 'Initial allowlisted login and password'],
  ['totp', 'Microsoft Authenticator TOTP'],
  ['gmail_test', 'Gmail test notification'],
  ['apple_bridge', 'Apple Shortcut bridge installation'],
  ['health_export', 'Health exporter and historical backfill'],
  ['source_permissions', 'Source app permissions'],
  ['windows_worker', 'Windows worker installation and pairing'],
  ['personal_profile', 'Personal Operating Profile'],
  ['finance_mapping', 'Finance source mapping'],
  ['github_connection', 'Personal GitHub connection'],
  ['schedule_review', 'Initial schedule review'],
  ['restore_test', 'Backup and staging restore test'],
  ['production_acceptance', 'Final production acceptance'],
] as const;

export function OnboardingForm({
  completedCodes,
  accepted,
}: Readonly<{ completedCodes: string[]; accepted: boolean }>) {
  const [completed, setCompleted] = useState(() => new Set(completedCodes));
  const [status, setStatus] = useState(accepted ? 'Production onboarding accepted.' : '');
  const completeCount = useMemo(() => completed.size, [completed]);
  async function toggle(code: string, complete: boolean) {
    setStatus('Saving checklist item...');
    const response = await fetch('/api/onboarding/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, complete }),
    });
    if (!response.ok)
      return setStatus('Checklist update was rejected. Complete fresh MFA and retry.');
    setCompleted((current) => {
      const next = new Set(current);
      complete ? next.add(code) : next.delete(code);
      return next;
    });
    setStatus('Checklist saved.');
  }
  async function accept() {
    setStatus('Recording final production acceptance...');
    const response = await fetch('/api/onboarding/accept', { method: 'POST' });
    setStatus(
      response.ok
        ? 'Production onboarding accepted. Schedules may now be reviewed individually.'
        : 'Acceptance was rejected: complete every checklist item with fresh MFA.',
    );
  }
  return (
    <section className="stack" aria-label="Production onboarding checklist">
      <p className="card">
        {completeCount}/{steps.length} required setup steps recorded. No spending or email schedule
        can be enabled before final acceptance.
      </p>
      {steps.map(([code, label]) => (
        <label className="card" key={code}>
          <input
            type="checkbox"
            checked={completed.has(code)}
            disabled={code === 'production_acceptance' || accepted}
            onChange={(event) => void toggle(code, event.target.checked)}
          />{' '}
          {label}
        </label>
      ))}
      <button
        type="button"
        disabled={accepted || completeCount !== steps.length - 1}
        onClick={() => void accept()}
      >
        Record final production acceptance
      </button>
      <p aria-live="polite">{status}</p>
    </section>
  );
}
