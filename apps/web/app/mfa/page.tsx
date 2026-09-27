import { MfaChallenge } from './mfa-challenge';
import { createSupabaseServerClient } from '../../lib/supabase-server';
import { stagingE2eTotpFactorName } from '../../lib/live-e2e-safety';

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; job?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verifiedFactors = (data?.totp ?? [])
    .filter((factor) => factor.status === 'verified')
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name || 'Authenticator',
    }));
  const params = await searchParams;
  const defaultFactorId =
    verifiedFactors.find((factor) => factor.friendlyName !== stagingE2eTotpFactorName)?.id ??
    verifiedFactors[0]?.id;
  const requestedJob = params.job;
  const job =
    requestedJob === 'apple_bridge' ||
    requestedJob === 'gmail_test' ||
    requestedJob === 'connection_revoke' ||
    requestedJob === 'connection_scope_change' ||
    requestedJob === 'worker_device_register' ||
    requestedJob === 'worker_device_revoke' ||
    requestedJob === 'digital_scan_create' ||
    requestedJob === 'finance_configure' ||
    requestedJob === 'finance_import'
      ? requestedJob
      : undefined;
  const requestedReturnTo = params.returnTo;
  const workerReturnTo =
    job === 'worker_device_register'
      ? '/devices?resume=worker_register'
      : job === 'worker_device_revoke'
        ? '/devices?resume=worker_revoke'
        : undefined;
  const returnTo =
    workerReturnTo ??
    (requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
      ? requestedReturnTo
      : '/overview');
  return (
    <main style={{ maxWidth: 480, paddingTop: '12vh' }}>
      <h1>Verify your identity</h1>
      <p className="label">
        Enter the current code from Microsoft Authenticator to unlock AI Operations.
      </p>
      {verifiedFactors.length > 0 ? (
        <MfaChallenge
          availableFactors={verifiedFactors}
          {...(defaultFactorId ? { defaultFactorId } : {})}
          returnTo={returnTo}
          {...(job ? { job } : {})}
        />
      ) : (
        <MfaChallenge returnTo={returnTo} {...(job ? { job } : {})} />
      )}
    </main>
  );
}
