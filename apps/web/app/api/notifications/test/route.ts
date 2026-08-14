import { NextResponse } from 'next/server';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';
import { clearMfaJob, readMfaJobToken } from '../../../../lib/mfa-job';

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const gateToken = await readMfaJobToken('gmail_test');
  const accessToken = gateToken ?? (await getAuthenticatedServerAccessToken());
  if (!accessToken) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const response = await fetch(
    new URL('/functions/v1/notification-test', process.env.NEXT_PUBLIC_SUPABASE_URL),
    { method: 'POST', headers: { authorization: `Bearer ${accessToken}` } },
  );
  const result = NextResponse.json(await response.json(), { status: response.status });
  return gateToken ? clearMfaJob(result) : result;
}
