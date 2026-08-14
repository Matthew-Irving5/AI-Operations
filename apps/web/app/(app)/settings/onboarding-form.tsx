'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const steps = [
  {
    code: 'supabase',
    label: 'Production Supabase secrets',
    instructions: [
      'In GitHub, open Settings → Environments → production and confirm the production Supabase release secrets exist: PRODUCTION_SUPABASE_ACCESS_TOKEN, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_DB_PASSWORD, PRODUCTION_SUPABASE_URL, and PRODUCTION_SUPABASE_ANON_KEY.',
      'In the production Supabase project, confirm the URL and anon key belong to this project. Never put the service-role key in the browser, a NEXT_PUBLIC variable, or this checklist.',
      'Run a fresh production login and MFA test, then confirm /overview loads. The successful deployment and login prove this item; tick the checkbox to record that evidence.',
    ],
  },
  {
    code: 'cloudflare_r2',
    label: 'Cloudflare and private R2 configuration',
    instructions: [
      'Confirm the production Cloudflare account, Worker, and private R2 bucket are separate from staging.',
      'Confirm R2 access keys and bucket identifiers are stored only in GitHub production secrets or Edge Function secrets. Verify the bucket is not public.',
    ],
  },
  {
    code: 'openai',
    label: 'OpenAI project key and provider hard limit',
    instructions: [
      'In the production OpenAI project, configure the approved API key, billing limit, and webhook secret. Store them only in the production secret store.',
      'Confirm the application and provider ceilings are lower than the approved initial rollout limit. Do not enable live calls until the deterministic checks pass.',
    ],
  },
  {
    code: 'google_oauth',
    label: 'Google OAuth redirect and consent',
    instructions: [
      'In Google Cloud Console, configure the production OAuth client with the exact callback URL documented by the deployment.',
      'Grant only the documented Gmail, Calendar, and Drive scopes, complete consent as the allowlisted account, and verify the connection appears in Data Sources.',
    ],
  },
  {
    code: 'initial_login',
    label: 'Initial allowlisted login and password',
    instructions: [
      'Create or confirm the single production Auth account for matthewirving99@gmail.com in the production Supabase project.',
      'Use a unique password stored in your password manager. Public sign-up must remain disabled.',
    ],
  },
  {
    code: 'totp',
    label: 'Microsoft Authenticator TOTP',
    instructions: [
      'On the production MFA page, enrol the factor and scan the QR code with Microsoft Authenticator.',
      'Enter the current six-digit code immediately after it changes, confirm /overview loads, and keep recovery access secure.',
    ],
  },
  {
    code: 'gmail_test',
    label: 'Gmail test notification',
    instructions: [
      'After Google/Gmail setup, run the documented notification test and confirm delivery to Matthew.irving.ai@gmail.com.',
      'Verify the message contains no secrets and that a notification trace/audit record exists.',
    ],
  },
  {
    code: 'apple_bridge',
    label: 'Apple Shortcut bridge installation',
    instructions: [
      'Open Data Sources → Apple Shortcut bridge, click Set up Apple Shortcut bridge, complete the six-digit MFA page when prompted, and copy the one-time token into the Shortcut.',
      'Confirm Calendar and Reminders data arrive with stable IDs and that revocation is understood.',
    ],
  },
  {
    code: 'health_export',
    label: 'Health exporter and historical backfill',
    instructions: [
      'Configure the supported Health export route and archive gateway using production-only secrets.',
      'Import a controlled historical export, review rejected records and completeness, and confirm the Health page shows summaries.',
    ],
  },
  {
    code: 'source_permissions',
    label: 'Source app permissions',
    instructions: [
      'Review every connected source in Data Sources. Keep scopes read-only where possible and revoke anything unnecessary.',
      'Confirm freshness and failure recovery for each source before enabling schedules.',
    ],
  },
  {
    code: 'windows_worker',
    label: 'Windows worker installation and pairing',
    instructions: [
      'Install the signed Windows worker from the repository release instructions. Configure only the HTTPS control-plane URL, device ID, and worker secret.',
      'Pair it with fresh MFA, confirm a heartbeat, and verify the private key is protected by Windows DPAPI/Credential Manager.',
    ],
  },
  {
    code: 'personal_profile',
    label: 'Personal Operating Profile',
    instructions: [
      'Configure timezone Europe/London, quiet hours, recurring commitments, travel buffers, planning preferences, and approved locations in the Personal page.',
      'Review the resulting daily-plan context before enabling a schedule.',
    ],
  },
  {
    code: 'finance_mapping',
    label: 'Finance source mapping',
    instructions: [
      'Configure the approved finance source and category mapping. Import a controlled statement or fixture without entering credentials into the app.',
      'Confirm transaction deduplication, balances, currency, and close readiness on the Finance page.',
    ],
  },
  {
    code: 'github_connection',
    label: 'Personal GitHub connection',
    instructions: [
      'Connect GitHub read-only using the Matthew-Irving5 owner account. Never connect or query BrightSG.',
      'Confirm repository evidence and provenance appear on Career, with no outreach enabled.',
    ],
  },
  {
    code: 'schedule_review',
    label: 'Initial schedule review',
    instructions: [
      'Review every schedule in Automations: workflow, timezone, cadence, notification behaviour, data sources, and budget.',
      'Keep schedules disabled until final acceptance, then enable one at a time and verify its first trace and notification.',
    ],
  },
  {
    code: 'restore_test',
    label: 'Backup and staging restore test',
    instructions: [
      'Run an encrypted backup and a staging-only restore drill using synthetic data. Record checksum, manifest count, representative read-back, and date in the operations log.',
      'Never perform a production restore from the dashboard; it requires the separate incident procedure and fresh MFA.',
    ],
  },
  {
    code: 'production_acceptance',
    label: 'Final production acceptance',
    instructions: [
      'After all previous items are evidenced, complete fresh MFA and click Record final production acceptance.',
      'This immutable acceptance unlocks individual schedule review; it does not bypass any budget, approval, or MFA control.',
    ],
  },
] as const;

export function OnboardingForm({
  completedCodes,
  accepted,
}: Readonly<{ completedCodes: string[]; accepted: boolean }>) {
  const [completed, setCompleted] = useState(() => new Set(completedCodes));
  const [status, setStatus] = useState(accepted ? 'Production onboarding accepted.' : '');
  const [testStatus, setTestStatus] = useState('');
  const completeCount = useMemo(() => completed.size, [completed]);
  async function toggle(code: string, complete: boolean) {
    setStatus('Saving checklist item...');
    const response = await fetch('/api/onboarding/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, complete }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        reason?: string;
      } | null;
      const reason =
        [body?.code, body?.reason].filter(Boolean).join(':') || `http_${response.status}`;
      return setStatus(
        `Checklist update rejected (${reason}). Sign in again if your session has expired.`,
      );
    }
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
  const sendGmailTest = useCallback(async () => {
    setTestStatus('Sending test notification...');
    const response = await fetch('/api/notifications/test', { method: 'POST' });
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    if (response.status === 403 && body?.code === 'fresh_mfa_required') {
      sessionStorage.setItem('gmail_test_intent', '1');
      window.location.assign('/mfa?returnTo=%2Fsettings%3Fresume%3Dgmail_test&job=gmail_test');
      return;
    }
    setTestStatus(
      response.ok
        ? 'Test sent. Check Matthew.irving.ai@gmail.com.'
        : `Test failed (${body?.code ?? `http_${response.status}`}).`,
    );
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('resume') !== 'gmail_test' ||
      sessionStorage.getItem('gmail_test_intent') !== '1'
    )
      return;
    sessionStorage.removeItem('gmail_test_intent');
    window.setTimeout(() => void sendGmailTest(), 0);
  }, [sendGmailTest]);
  return (
    <section className="stack" aria-label="Production onboarding checklist">
      <p className="card">
        {completeCount}/{steps.length} required setup steps recorded. No spending or email schedule
        can be enabled before final acceptance.
      </p>
      {steps.map(({ code, label, instructions }) => (
        <article className="card onboarding-item" key={code}>
          <div className="onboarding-item-header">
            <label>
              <input
                type="checkbox"
                checked={completed.has(code)}
                disabled={code === 'production_acceptance' || accepted}
                onChange={(event) => void toggle(code, event.target.checked)}
              />{' '}
              Complete
            </label>
            <details>
              <summary>{label}</summary>
              <div className="onboarding-instructions">
                {instructions.map((instruction) => (
                  <p key={instruction}>{instruction}</p>
                ))}
                {code === 'gmail_test' && (
                  <div className="stack">
                    <button type="button" onClick={() => void sendGmailTest()}>
                      Send test notification
                    </button>
                    <p aria-live="polite">{testStatus}</p>
                  </div>
                )}
              </div>
            </details>
          </div>
        </article>
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
