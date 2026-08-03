import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';

const bodySchema = z.object({
  deviceId: z.string().uuid(),
  roots: z
    .array(
      z
        .string()
        .min(1)
        .max(500)
        .refine((value) => !value.includes('..')),
    )
    .min(1)
    .max(20),
  scanKind: z.enum(['lightweight', 'deep']),
  hardCapUsd: z.number().positive().max(1000),
  searchCeiling: z.number().int().min(0).max(20),
  idempotencyKey: z.string().regex(/^[a-z0-9][a-z0-9:_-]{7,127}$/i),
});

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ code: 'invalid_scan_request' }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data: session } = await client.auth.getSession();
  if (!session.session?.access_token)
    return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const response = await fetch(
    new URL('/functions/v1/digital-scan-create', process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
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
