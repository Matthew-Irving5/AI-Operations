import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAllowedEmail } from '../../../../../lib/auth';
import { requireSameOrigin } from '../../../../../lib/request-security';
import {
  fingerprintRecoverySession,
  passwordRecoveryCookieName,
} from '../../../../../lib/password-recovery';
import { createSupabaseServerClient } from '../../../../../lib/supabase-server';

const passwordSchema = z
  .object({
    password: z.string().min(12).max(1024),
    confirmPassword: z.string().min(12).max(1024),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword);

function noStore(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;

  const payload = await request.json().catch(() => null);
  const parsed = passwordSchema.safeParse(payload);
  if (!parsed.success) return noStore({ code: 'password_policy_failed' }, 400);

  const cookieStore = await cookies();
  const recoveryMarker = cookieStore.get(passwordRecoveryCookieName)?.value;
  if (!recoveryMarker) return noStore({ code: 'recovery_session_required' }, 403);

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return noStore({ code: 'recovery_session_required' }, 401);
  if (!isAllowedEmail(userData.user.email ?? '')) {
    await supabase.auth.signOut({ scope: 'global' });
    return noStore({ code: 'recovery_session_required' }, 403);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (
    sessionError ||
    !accessToken ||
    (await fingerprintRecoverySession(accessToken)) !== recoveryMarker
  ) {
    return noStore({ code: 'recovery_session_required' }, 403);
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) return noStore({ code: 'password_update_failed' }, 400);

  const { error: revokeError } = await supabase.auth.signOut({ scope: 'global' });
  if (revokeError) return noStore({ code: 'session_revoke_failed' }, 503);

  cookieStore.set(passwordRecoveryCookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return noStore({ updated: true }, 200);
}
