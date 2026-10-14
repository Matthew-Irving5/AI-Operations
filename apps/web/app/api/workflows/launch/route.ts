import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const onDemandSchema = z.object({
  workflowCode: z.enum(['travel-on-demand-plan', 'procurement-on-demand-research']),
  managerCode: z.enum(['travel', 'procurement']),
  hardCapUsd: z.number().positive().max(1000),
  modelCeiling: z.enum(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']),
  searchCeiling: z.number().int().min(0).max(20),
  idempotencyKey: z.string().uuid(),
  request: z.object({
    purpose: z.string().trim().min(3).max(2000),
    constraints: z.string().trim().max(4000),
  }),
});

const systemsAcceptanceSchema = z.discriminatedUnion('workflowCode', [
  z
    .object({
      workflowCode: z.literal('systems-daily-cost-capacity'),
      managerCode: z.literal('systems'),
      hardCapUsd: z.literal(0.01),
      modelCeiling: z.literal('gpt-5.6-luna'),
      searchCeiling: z.literal(0),
      idempotencyKey: z.string().uuid(),
      request: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      workflowCode: z.literal('systems-weekly-quality-platform'),
      managerCode: z.literal('systems'),
      hardCapUsd: z.literal(0.05),
      modelCeiling: z.literal('gpt-5.6-luna'),
      searchCeiling: z.literal(0),
      idempotencyKey: z.string().uuid(),
      request: z.object({}).strict(),
    })
    .strict(),
]);

const schema = z.union([onDemandSchema, systemsAcceptanceSchema]);

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ code: 'invalid_launch_request' }, { status: 400 });
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) return NextResponse.json({ code: 'unauthorised' }, { status: 401 });
  const response = await fetch(
    new URL('/functions/v1/workflow-launch', process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body.data),
    },
  );
  return NextResponse.json(await response.json(), { status: response.status });
}
