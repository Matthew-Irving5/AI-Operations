import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const schema = z.object({ deviceId: z.string().uuid(), mfaGateId: z.string().uuid() });

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ code: 'invalid_request', stage: 'revocation' }, { status: 400 });
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return NextResponse.json({ code: 'unauthorised', stage: 'revocation' }, { status: 401 });
  const requestId = crypto.randomUUID();
  const response = await fetch(
    new URL('/functions/v1/device-revoke', process.env.NEXT_PUBLIC_SUPABASE_URL),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'x-request-id': requestId,
      },
      body: JSON.stringify(parsed.data),
    },
  );
  const body = await response.json().catch(() => ({ code: 'revocation_response_invalid' }));
  return NextResponse.json(body, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
}
