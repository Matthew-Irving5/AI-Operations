import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const connectionIdSchema = z.string().uuid();
const bodySchema = z.object({
  connectionId: connectionIdSchema,
  selectedCalendarIds: z.array(z.string().min(1).max(256)).max(100),
  selectedDriveFileIds: z.array(z.string().min(1).max(256)).max(100),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
  mfaGateId: z.string().uuid(),
});

async function accessTokenOrResponse() {
  const accessToken = await getAuthenticatedServerAccessToken();
  return accessToken
    ? { accessToken }
    : { response: NextResponse.json({ code: 'unauthorised' }, { status: 401 }) };
}

export async function GET(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const connectionId = new URL(request.url).searchParams.get('connectionId');
  const parsed = connectionIdSchema.safeParse(connectionId);
  if (!parsed.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  const auth = await accessTokenOrResponse();
  if ('response' in auth) return auth.response;
  const upstream = new URL(
    '/functions/v1/google-connection-sources',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  upstream.searchParams.set('connectionId', parsed.data);
  const response = await fetch(upstream, {
    headers: { authorization: `Bearer ${auth.accessToken}`, accept: 'application/json' },
    cache: 'no-store',
  });
  return NextResponse.json(
    await response.json().catch(() => ({ code: 'provider_empty_response' })),
    { status: response.status, headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  const auth = await accessTokenOrResponse();
  if ('response' in auth) return auth.response;
  const response = await fetch(
    new URL('/functions/v1/google-connection-sources', process.env.NEXT_PUBLIC_SUPABASE_URL),
    {
      method: 'POST',
      headers: { authorization: `Bearer ${auth.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        connectionId: body.data.connectionId,
        selected_calendar_ids: body.data.selectedCalendarIds,
        selected_drive_file_ids: body.data.selectedDriveFileIds,
        mfaGateId: body.data.mfaGateId,
      }),
    },
  );
  return NextResponse.json(
    await response.json().catch(() => ({ code: 'provider_empty_response' })),
    { status: response.status },
  );
}
