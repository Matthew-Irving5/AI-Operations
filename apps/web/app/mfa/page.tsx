import { MfaChallenge } from './mfa-challenge';
import { createSupabaseServerClient } from '../../lib/supabase-server';

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; job?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verifiedFactor = data?.totp?.find((factor) => factor.status === 'verified');
  const params = await searchParams;
  const requestedJob = params.job;
  const job =
    requestedJob === 'apple_bridge' ||
    requestedJob === 'gmail_test' ||
    requestedJob === 'connection_revoke' ||
    requestedJob === 'connection_scope_change' ||
    requestedJob === 'worker_device_register' ||
    requestedJob === 'worker_device_revoke'
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
      {verifiedFactor ? (
        <MfaChallenge factorId={verifiedFactor.id} returnTo={returnTo} {...(job ? { job } : {})} />
      ) : (
        <MfaChallenge returnTo={returnTo} {...(job ? { job } : {})} />
      )}
    </main>
  );
}
