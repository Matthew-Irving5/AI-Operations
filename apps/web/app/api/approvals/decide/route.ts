import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';

const bodySchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ code: 'invalid_decision' }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data: session } = await client.auth.getSession();
  if (!session.session?.access_token)
    return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const url = new URL(
    '/functions/v1/approval-decide',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.session.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body.data),
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
