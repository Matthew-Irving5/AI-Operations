import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const requestSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('create_fixture'),
      fixtureKey: z.string().regex(/^ai14-live-e2e:[0-9a-f-]{36}$/i),
    })
    .strict(),
  z.object({ operation: z.literal('read_fixture'), conversationId: z.string().uuid() }).strict(),
  z
    .object({
      operation: z.literal('transition_handoff'),
      handoffId: z.string().uuid(),
      status: z.enum(['accepted', 'requested']),
    })
    .strict(),
]);

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ code: 'invalid_contract_request' }, { status: 400 });
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });

  let response: Response;
  try {
    response = await fetch(
      new URL(
        '/functions/v1/agent-runtime-contracts',
        process.env.NEXT_PUBLIC_SUPABASE_URL,
      ).toString(),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body.data),
      },
    );
  } catch {
    return NextResponse.json({ code: 'agent_runtime_unavailable' }, { status: 502 });
  }
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    return NextResponse.json({ code: 'agent_runtime_invalid_response' }, { status: 502 });
  }
  return NextResponse.json(responseBody, { status: response.status });
}
