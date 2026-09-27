import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAal2 } from '../../../lib/auth';
import {
  isStagingE2eMfaTarget,
  stagingE2eTotpFactorName,
  stagingTarget,
} from '../../../lib/live-e2e-safety';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { StagingE2eFactorEnrollment } from './staging-e2e-factor-enrollment';

export default async function StagingE2eFactorPage() {
  const requestHeaders = await headers();
  const requestOrigin = `https://${requestHeaders.get('host') ?? ''}`;
  if (
    !isStagingE2eMfaTarget(
      requestOrigin,
      process.env.APP_ENV,
      process.env.PUBLIC_APP_ORIGIN,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    )
  ) {
    notFound();
  }

  await requireAal2();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    return (
      <main className="stack">
        <h1>Staging E2E authenticator</h1>
        <p role="alert">Authenticator factors could not be loaded. Refresh once to retry.</p>
      </main>
    );
  }

  const existingFactor = data.all.some(
    (factor) => factor.factor_type === 'totp' && factor.friendly_name === stagingE2eTotpFactorName,
  );
  const pendingFactorIds = data.all
    .filter(
      (factor) =>
        factor.factor_type === 'totp' &&
        factor.status === 'unverified' &&
        factor.friendly_name === stagingE2eTotpFactorName,
    )
    .map((factor) => factor.id);

  return (
    <main className="stack" style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1>Staging E2E authenticator</h1>
      <p>
        Add a separate authenticator for protected staging browser tests. Your existing verified
        authenticator remains enrolled and unchanged. This page requires the locked account and a
        fresh AAL2 session.
      </p>
      <StagingE2eFactorEnrollment
        hasExistingFactor={existingFactor}
        pendingFactorIds={pendingFactorIds}
      />
    </main>
  );
}
