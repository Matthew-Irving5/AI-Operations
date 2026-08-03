import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../../lib/request-security';

const bodySchema = z.object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: parsed.data.factorId,
  });
  if (challengeError) return NextResponse.json({ code: 'challenge_failed' }, { status: 400 });
  const { error } = await supabase.auth.mfa.verify({
    factorId: parsed.data.factorId,
    challengeId: challenge.id,
    code: parsed.data.code,
  });
  if (error) return NextResponse.json({ code: 'verification_failed' }, { status: 401 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const { error: eventError } = await supabase
    .from('mfa_reauthentication_events')
    .insert({ user_id: userData.user.id, method: 'totp' });
  return eventError
    ? NextResponse.json({ code: 'reauthentication_record_failed' }, { status: 500 })
    : NextResponse.json({ aal: 'aal2' });
}
