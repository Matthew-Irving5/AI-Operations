import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../lib/supabase-server';

const candidateSchema = z
  .object({
    operation: z.literal('create_candidate'),
    templateId: z.string().uuid(),
    systemText: z.string().trim().min(1).max(20_000),
    developerText: z.string().trim().min(1).max(20_000),
    schema: z.unknown(),
    modelRoute: z.enum(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']),
    schemaVersion: z.number().int().positive(),
    toolPolicyVersion: z.number().int().positive(),
    toolPolicy: z
      .object({ version: z.number().int().positive(), tools: z.array(z.unknown()) })
      .strict(),
  })
  .strict();

const transitionSchema = z
  .object({
    operation: z.enum(['promote', 'rollback']),
    templateId: z.string().uuid(),
    targetVersion: z.number().int().positive(),
    expectedActiveVersion: z.number().int().positive(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
  })
  .strict();

const requestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('get_current') }).strict(),
  candidateSchema,
  z.object({ operation: z.literal('evaluate'), candidateId: z.string().uuid() }).strict(),
  transitionSchema,
]);

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ code: 'invalid_prompt_governance_request' }, { status: 400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body.data)).byteLength > 100_000) {
    return NextResponse.json({ code: 'prompt_governance_request_too_large' }, { status: 413 });
  }
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });

  let response: Response;
  try {
    response = await fetch(
      new URL('/functions/v1/prompt-governance', process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
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
    return NextResponse.json({ code: 'prompt_governance_unavailable' }, { status: 502 });
  }
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    return NextResponse.json({ code: 'prompt_governance_invalid_response' }, { status: 502 });
  }
  return NextResponse.json(responseBody, { status: response.status });
}
