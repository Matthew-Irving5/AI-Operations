import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSupabaseAccessTokenClient,
  createSupabaseServerClient,
} from '../../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../../lib/request-security';

const bodySchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  job: z
    .enum(['apple_bridge', 'gmail_test', 'connection_revoke', 'connection_scope_change'])
    .optional(),
});

export async function POST(request: Request) {
  try {
    const rejected = requireSameOrigin(request);
    if (rejected) return rejected;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: parsed.data.factorId,
    });
    if (challengeError) return NextResponse.json({ code: 'challenge_failed' }, { status: 400 });
    const { data: verification, error } = await supabase.auth.mfa.verify({
      factorId: parsed.data.factorId,
      challengeId: challenge.id,
      code: parsed.data.code,
    });
    if (error || !verification) {
      return NextResponse.json({ code: 'verification_failed' }, { status: 401 });
    }

    // Persist the elevated session in the SSR cookie store. The verification
    // response contains a new AAL2 pair; without explicitly setting it, the
    // next request can continue presenting the pre-MFA AAL1 cookie.
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: verification.access_token,
      refresh_token: verification.refresh_token,
    });
    if (sessionError) {
      return NextResponse.json({ code: 'session_persist_failed' }, { status: 500 });
    }

    // Auth returns an AAL2 JWT. Use it explicitly for the audit insert; the
    // incoming cookie can still contain the pre-verification AAL1 JWT.
    const elevated = createSupabaseAccessTokenClient(verification.access_token);
    const { data: userData, error: userError } = await elevated.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
    }
    const { error: eventError } = await elevated
      .from('mfa_reauthentication_events')
      .insert({ user_id: userData.user.id, method: 'totp' });
    if (eventError)
      return NextResponse.json({ code: 'reauthentication_record_failed' }, { status: 500 });
    if (parsed.data.job) {
      const actionKey =
        parsed.data.job === 'apple_bridge'
          ? 'apple_bridge_create'
          : parsed.data.job === 'gmail_test'
            ? 'gmail_test_notification'
            : parsed.data.job === 'connection_revoke'
              ? 'connection_revoke'
              : 'connection_scope_change';
      const { data: mfaGateId, error: gateError } = await elevated.rpc('create_mfa_action_gate', {
        p_action_key: actionKey,
      });
      if (gateError || !mfaGateId)
        return NextResponse.json({ code: 'mfa_gate_create_failed' }, { status: 500 });
      return NextResponse.json({ aal: 'aal2', mfaGateId });
    }
    return NextResponse.json({ aal: 'aal2' });
  } catch {
    return NextResponse.json({ code: 'mfa_verification_failed' }, { status: 500 });
  }
}
