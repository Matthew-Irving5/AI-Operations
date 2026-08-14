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
  const requestedReturnTo = (await searchParams).returnTo;
  const returnTo =
    requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
      ? requestedReturnTo
      : '/overview';
  const requestedJob = (await searchParams).job;
  const job =
    requestedJob === 'apple_bridge' || requestedJob === 'gmail_test' ? requestedJob : undefined;
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
