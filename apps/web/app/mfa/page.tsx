import { MfaChallenge } from './mfa-challenge';
import { createSupabaseServerClient } from '../../lib/supabase-server';

export default async function MfaPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verifiedFactor = data?.totp?.find((factor) => factor.status === 'verified');
  return (
    <main style={{ maxWidth: 480, paddingTop: '12vh' }}>
      <h1>Verify your identity</h1>
      <p className="label">
        Enter the current code from Microsoft Authenticator to unlock AI Operations.
      </p>
      {verifiedFactor ? <MfaChallenge factorId={verifiedFactor.id} /> : <MfaChallenge />}
    </main>
  );
}
