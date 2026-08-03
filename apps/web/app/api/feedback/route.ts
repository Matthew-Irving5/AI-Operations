import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

const requestSchema = z.object({
  reportId: z.string().uuid(),
  positive: z.boolean(),
  categories: z.array(z.string().min(1).max(100)).max(20),
  comment: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const payload = requestSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ code: 'invalid_feedback' }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data: session } = await client.auth.getSession();
  if (!session.session?.access_token)
    return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const url = new URL(
    '/functions/v1/feedback-submit',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.session.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload.data),
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
