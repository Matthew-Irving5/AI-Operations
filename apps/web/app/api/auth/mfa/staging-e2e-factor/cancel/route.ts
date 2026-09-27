import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../../../../../lib/supabase-server';
import { isAllowedEmail } from '../../../../../../lib/auth';
import { requireSameOrigin } from '../../../../../../lib/request-security';
import {
  isStagingE2eMfaTarget,
  stagingE2eTotpFactorName,
} from '../../../../../../lib/live-e2e-safety';

const noStore = { 'cache-control': 'no-store' };
const bodySchema = z.object({ factorId: z.string().uuid() }).strict();

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

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ code: 'invalid_request' }, { status: 400, headers: noStore });

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
  const pending = factors.all.find(
    (factor) =>
      factor.id === body.data.factorId &&
      factor.factor_type === 'totp' &&
      factor.friendly_name === stagingE2eTotpFactorName &&
      factor.status === 'unverified',
  );
  if (!pending)
    return NextResponse.json(
      { code: 'pending_factor_not_found' },
      { status: 404, headers: noStore },
    );

  const { error } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
  if (error)
    return NextResponse.json(
      { code: 'pending_factor_cancel_failed' },
      { status: 502, headers: noStore },
    );
  return NextResponse.json({ status: 'cancelled' }, { headers: noStore });
}
