import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const bodySchema = z.object({
  connectionId: z.string().uuid(),
  provider: z.enum(['google', 'apple']),
  mfaGateId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const isGoogle = body.data.provider === 'google';
  const endpoint = isGoogle
    ? '/functions/v1/google-connection-revoke'
    : '/functions/v1/apple-bridge-device';
  const url = new URL(endpoint, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!isGoogle) {
    url.searchParams.set('id', body.data.connectionId);
    if (body.data.mfaGateId) url.searchParams.set('mfaGateId', body.data.mfaGateId);
  }
  const response = await fetch(url, {
    method: isGoogle ? 'POST' : 'DELETE',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    ...(isGoogle
      ? {
          body: JSON.stringify({
            connectionId: body.data.connectionId,
            ...(body.data.mfaGateId ? { mfaGateId: body.data.mfaGateId } : {}),
          }),
        }
      : {}),
  });
  return response.status === 204
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json(await response.json().catch(() => ({ code: 'provider_empty_response' })), {
        status: response.status,
      });
}
