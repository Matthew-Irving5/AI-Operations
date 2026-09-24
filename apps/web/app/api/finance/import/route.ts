import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const bodySchema = z.object({
  accountId: z.string().uuid(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  statementName: z.string().trim().min(1).max(200),
  csv: z.string().min(1).max(1_000_000),
  openingBalance: z
    .string()
    .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
    .optional(),
  closingBalance: z
    .string()
    .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
    .optional(),
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
      'invalid_finance_import',
      400,
      'request.validation',
      'The statement import requires an account, matching currency, name, CSV, and optional decimal balances.',
      'Use the four-column CSV format shown on Finance and correct the highlighted fields.',
    );
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return diagnostic(
      requestId,
      'unauthorised',
      401,
      'authentication.web_session',
      'The web server could not validate or refresh the signed-in session before finance import.',
      'Sign in again, complete MFA, return to Finance, and retry.',
    );
  let response: Response;
  try {
    response = await fetch(
      new URL('/functions/v1/finance-import', process.env.NEXT_PUBLIC_SUPABASE_URL),
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
      'finance_import_control_plane_unreachable',
      502,
      'control_plane.network',
      'The web route could not reach the Finance import control plane.',
      'Retry once; if it repeats, provide the request ID. The statement was not submitted.',
    );
  }
  const payload = await response.json().catch(() => null);
  if (!payload)
    return diagnostic(
      requestId,
      'finance_import_control_plane_invalid_response',
      502,
      'control_plane.response',
      `The Finance import control plane returned HTTP ${response.status} without a JSON diagnostic.`,
      'Provide the request ID so the Edge Function deployment can be inspected.',
    );
  return NextResponse.json(payload, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
}
