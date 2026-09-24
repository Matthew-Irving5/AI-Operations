import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const bodySchema = z.object({
  account: z.object({
    institutionName: z.string().trim().min(1).max(120),
    accountLabel: z.string().trim().min(1).max(120),
    accountType: z.enum(['bank', 'credit', 'cash', 'savings', 'investment', 'other']),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  categories: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  source: z.object({
    kind: z.enum(['upload', 'google_sheet']),
    spreadsheetExternalId: z.string().trim().min(1).max(256).optional(),
  }),
});

function diagnostic(
  requestId: string,
  code: string,
  status: number,
  stage: string,
  detail: string,
  remediation: string,
) {
  return NextResponse.json(
    {
      code,
      requestId,
      diagnostic: { code, stage, httpStatus: status, requestId, detail, remediation },
    },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return diagnostic(
      requestId,
      'invalid_finance_configuration',
      400,
      'request.validation',
      'The finance configuration did not match the required account, source, and category shape.',
      'Correct the highlighted fields and submit again; do not enter provider credentials.',
    );
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return diagnostic(
      requestId,
      'unauthorised',
      401,
      'authentication.web_session',
      'The web server could not validate or refresh the signed-in session before finance configuration.',
      'Sign in again, complete MFA, return to Finance, and retry.',
    );
  let response: Response;
  try {
    response = await fetch(
      new URL('/functions/v1/finance-control', process.env.NEXT_PUBLIC_SUPABASE_URL),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify(body.data),
      },
    );
  } catch {
    return diagnostic(
      requestId,
      'finance_control_plane_unreachable',
      502,
      'control_plane.network',
      'The web route could not reach the Finance control-plane function.',
      'Retry once; if it repeats, provide the request ID. No finance data was changed.',
    );
  }
  const payload = await response.json().catch(() => null);
  if (!payload)
    return diagnostic(
      requestId,
      'finance_control_plane_invalid_response',
      502,
      'control_plane.response',
      `The Finance control plane returned HTTP ${response.status} without a JSON diagnostic.`,
      'Provide the request ID so the Edge Function deployment can be inspected.',
    );
  return NextResponse.json(payload, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
}
