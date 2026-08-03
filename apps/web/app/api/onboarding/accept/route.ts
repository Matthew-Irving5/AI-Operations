import { NextResponse } from 'next/server';
import { requireSameOrigin } from '../../../../lib/request-security';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const client = await createSupabaseServerClient();
  const [{ data: user }, { data: session }] = await Promise.all([
    client.auth.getUser(),
    client.auth.getSession(),
  ]);
  if (!user.user || !session.session?.access_token)
    return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const response = await fetch(
    new URL('/functions/v1/onboarding-accept', process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
    { method: 'POST', headers: { authorization: `Bearer ${session.session.access_token}` } },
  );
  return NextResponse.json(await response.json(), { status: response.status });
}
