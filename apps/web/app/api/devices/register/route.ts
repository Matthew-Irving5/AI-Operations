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
  const requestId = request.headers.get('x-client-request-id') ?? crypto.randomUUID();
  const rejected = requireSameOrigin(request);
  if (rejected) {
    rejected.headers.set('x-request-id', requestId);
    return rejected;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { code: 'invalid_device', stage: 'registration', requestId },
      { status: 400, headers: { 'x-request-id': requestId } },
    );
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return NextResponse.json(
      { code: 'unauthorised', stage: 'registration', requestId },
      { status: 401, headers: { 'x-request-id': requestId } },
    );
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
  const body = (await response
    .json()
    .catch(() => ({ code: 'registration_response_invalid' }))) as Record<string, unknown> | null;
  const responseBody = {
    ...(body ?? { code: 'registration_response_invalid' }),
    requestId:
      typeof body?.requestId === 'string' && body.requestId.length > 0 ? body.requestId : requestId,
  };
  return NextResponse.json(responseBody, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
}
