import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const bodySchema = z.object({
  deviceId: z.string().uuid(),
  desiredState: z.enum(['active', 'online', 'offline']),
});

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });

  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });

  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(
      new URL('/rest/v1/rpc/set_worker_desired_state', process.env.NEXT_PUBLIC_SUPABASE_URL),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
          'content-type': 'application/json',
          'x-request-id': requestId,
          prefer: 'return=representation',
        },
        body: JSON.stringify({
          p_device_id: parsed.data.deviceId,
          p_desired_state: parsed.data.desiredState,
        }),
      },
    );
  } catch {
    return NextResponse.json(
      { code: 'worker_control_unavailable', requestId },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }

  const payload = await response.json().catch(() => ({ code: 'worker_control_invalid_response' }));
  return NextResponse.json(payload, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
}
