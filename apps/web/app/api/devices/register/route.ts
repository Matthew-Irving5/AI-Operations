import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const schema = z.object({
  label: z.string().trim().min(1).max(100),
  publicKeyB64: z.string().regex(/^[A-Za-z0-9+/=]{40,100}$/),
  mfaGateId: z.string().uuid(),
});

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ code: 'invalid_device', stage: 'registration' }, { status: 400 });
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return NextResponse.json({ code: 'unauthorised', stage: 'registration' }, { status: 401 });
  const requestId = crypto.randomUUID();
  const response = await fetch(
    new URL('/functions/v1/device-register', process.env.NEXT_PUBLIC_SUPABASE_URL),
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
  const body = await response.json().catch(() => ({ code: 'registration_response_invalid' }));
  return NextResponse.json(body, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
}
