import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const bodySchema = z.object({ runId: z.string().uuid() });

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const url = new URL(
    '/functions/v1/workflow-cancel',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body.data),
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
