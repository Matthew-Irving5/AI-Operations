import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../../lib/request-security';

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'AI Operations',
  });
  if (error) return NextResponse.json({ code: 'mfa_enrolment_failed' }, { status: 400 });
  return NextResponse.json({
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  });
}
