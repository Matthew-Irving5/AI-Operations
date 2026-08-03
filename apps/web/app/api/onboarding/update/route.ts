import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';

const schema = z.object({ code: z.string().min(1).max(64), complete: z.boolean() });

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  const client = await createSupabaseServerClient();
  const [{ data: user }, { data: session }] = await Promise.all([
    client.auth.getUser(),
    client.auth.getSession(),
  ]);
  if (!user.user || !session.session?.access_token)
    return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const response = await fetch(
    new URL('/functions/v1/onboarding-update', process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.session.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body.data),
    },
  );
  return NextResponse.json(await response.json(), { status: response.status });
}
