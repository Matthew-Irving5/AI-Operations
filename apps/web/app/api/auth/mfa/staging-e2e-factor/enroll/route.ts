import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../../lib/supabase-server';
import { isAllowedEmail } from '../../../../../../lib/auth';
import { requireSameOrigin } from '../../../../../../lib/request-security';
import {
  isStagingE2eMfaTarget,
  stagingE2eTotpFactorName,
} from '../../../../../../lib/live-e2e-safety';

const noStore = { 'cache-control': 'no-store', pragma: 'no-cache' };

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;

  if (
    !isStagingE2eMfaTarget(
      request.headers.get('origin'),
      process.env.APP_ENV,
      process.env.PUBLIC_APP_ORIGIN,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    )
  ) {
    return NextResponse.json({ code: 'not_found' }, { status: 404, headers: noStore });
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: userData, error: userError }, { data: assurance, error: assuranceError }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

  if (userError || !userData.user)
    return NextResponse.json({ code: 'unauthorised' }, { status: 401, headers: noStore });
  if (!isAllowedEmail(userData.user.email ?? ''))
    return NextResponse.json({ code: 'forbidden' }, { status: 403, headers: noStore });
  if (assuranceError || assurance?.currentLevel !== 'aal2')
    return NextResponse.json({ code: 'aal2_required' }, { status: 403, headers: noStore });

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError || !factors)
    return NextResponse.json(
      { code: 'factor_list_unavailable' },
      { status: 503, headers: noStore },
    );

  const existingE2eFactor = factors.all.find(
    (factor) => factor.factor_type === 'totp' && factor.friendly_name === stagingE2eTotpFactorName,
  );
  if (existingE2eFactor) {
    return NextResponse.json(
      {
        code:
          existingE2eFactor.status === 'verified'
            ? 'factor_already_verified'
            : 'pending_factor_exists',
      },
      { status: 409, headers: noStore },
    );
  }
  if (factors.all.length >= 10)
    return NextResponse.json({ code: 'factor_limit_reached' }, { status: 409, headers: noStore });

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: stagingE2eTotpFactorName,
  });
  if (error || !data)
    return NextResponse.json(
      { code: 'factor_enrollment_failed' },
      { status: 502, headers: noStore },
    );

  return NextResponse.json(
    {
      factorId: data.id,
      friendlyName: stagingE2eTotpFactorName,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
    { headers: { ...noStore, 'referrer-policy': 'no-referrer' } },
  );
}
