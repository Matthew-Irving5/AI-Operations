import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const bodySchema = z.object({
  connectionId: z.string().uuid(),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  provider: z.literal('google').optional(),
});

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const response = await fetch(
    new URL('/functions/v1/google-connection-sync', process.env.NEXT_PUBLIC_SUPABASE_URL),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        connectionId: body.data.connectionId,
        idempotencyKey: body.data.idempotencyKey,
      }),
    },
  );
  return NextResponse.json(
    await response.json().catch(() => ({ code: 'provider_empty_response' })),
    {
      status: response.status,
    },
  );
}
