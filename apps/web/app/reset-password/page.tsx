import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '../../lib/supabase-server';
import { isAllowedEmail } from '../../lib/auth';
import {
  fingerprintRecoverySession,
  passwordRecoveryCookieName,
} from '../../lib/password-recovery';
import { PasswordResetForm } from './password-reset-form';

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const recoveryMarker = (await cookies()).get(passwordRecoveryCookieName)?.value;
  const accessToken = sessionData.session?.access_token;

  if (
    userError ||
    !userData.user ||
    !isAllowedEmail(userData.user.email ?? '') ||
    sessionError ||
    !accessToken ||
    !recoveryMarker ||
    (await fingerprintRecoverySession(accessToken)) !== recoveryMarker
  ) {
    redirect('/login?error=recovery');
  }

  return (
    <main style={{ maxWidth: 480, paddingTop: '12vh' }}>
      <h1>Choose a new password</h1>
      <p className="label">Use at least 12 characters. Your other sessions will be signed out.</p>
      <PasswordResetForm />
    </main>
  );
}
