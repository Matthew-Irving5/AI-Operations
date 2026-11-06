import { MfaChallenge } from './mfa-challenge';
import { createSupabaseServerClient } from '../../lib/supabase-server';
import { parseMfaPageJob } from '../../lib/mfa-page-job';
import { selectMfaFactors } from '../../lib/mfa-factor-selection';

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; job?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const { availableFactors, defaultFactorId } = selectMfaFactors(data?.totp);
  const params = await searchParams;
  const job = parseMfaPageJob(params.job);
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
      {availableFactors.length > 0 ? (
        <MfaChallenge
          availableFactors={availableFactors}
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
