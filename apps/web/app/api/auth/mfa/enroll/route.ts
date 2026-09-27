import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../../lib/request-security';

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError || !factors) {
    return NextResponse.json(
      { code: 'factor_list_unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  if ((factors?.all.length ?? 0) > 0) {
    const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || assurance?.currentLevel !== 'aal2') {
      return NextResponse.json({ code: 'aal2_required' }, { status: 403 });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'AI Operations',
  });
  if (error || !data)
    return NextResponse.json(
      { code: 'mfa_enrolment_failed' },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    );
  return NextResponse.json(
    {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
    {
      headers: {
        'cache-control': 'no-store',
        pragma: 'no-cache',
        'referrer-policy': 'no-referrer',
      },
    },
  );
}
