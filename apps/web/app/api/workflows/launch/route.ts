import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';
import { procurementLaunchRequestSchema } from '@ai-operations/contracts';

const sharedOnDemandSchema = {
  hardCapUsd: z.number().positive().max(1000),
  modelCeiling: z.enum(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']),
  searchCeiling: z.number().int().min(1).max(20),
  idempotencyKey: z.string().uuid(),
};
const onDemandSchema = z.union([
  z
    .object({
      ...sharedOnDemandSchema,
      workflowCode: z.literal('travel-on-demand-plan'),
      managerCode: z.literal('travel'),
      searchCeiling: z.number().int().min(0).max(20),
      request: z
        .object({
          purpose: z.string().trim().min(3).max(2000),
          constraints: z.string().trim().max(4000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...sharedOnDemandSchema,
      workflowCode: z.literal('procurement-on-demand-research'),
      managerCode: z.literal('procurement'),
      revisionOfResearchRunId: z.string().uuid().optional(),
      request: procurementLaunchRequestSchema,
    })
    .strict(),
]);

const systemsAcceptanceSchema = z.union([
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
  z
    .object({
      workflowCode: z.literal('systems-weekly-quality-platform'),
      managerCode: z.literal('systems'),
      hardCapUsd: z.literal(0.15),
      modelCeiling: z.literal('gpt-5.6-terra'),
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
