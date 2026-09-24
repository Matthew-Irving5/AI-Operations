import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const bodySchema = z.object({ mfaGateId: z.string().uuid() }).strict();

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
  const requestId = request.headers.get('x-client-request-id') ?? crypto.randomUUID();
  const rejected = requireSameOrigin(request);
  if (rejected) {
    rejected.headers.set('x-request-id', requestId);
    return rejected;
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return diagnostic(
      requestId,
      'invalid_request',
      400,
      'request.validation',
      'The GitHub sync request must contain the UUID of its one-time fresh-MFA gate.',
      'Start the sync again from Career and complete the in-page Microsoft Authenticator challenge.',
    );
  }
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) {
    return diagnostic(
      requestId,
      'unauthorised',
      401,
      'authentication.web_session',
      'The web server could not validate or refresh the signed-in session before GitHub sync.',
      'Sign in again, complete MFA, return to Career, and retry.',
    );
  }
  let response: Response;
  try {
    response = await fetch(
      new URL('/functions/v1/github-career-sync', process.env.NEXT_PUBLIC_SUPABASE_URL),
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
      'github_control_plane_unreachable',
      502,
      'control_plane.network',
      'The web route could not reach the GitHub sync Edge Function; no provider request was made.',
      'Retry once; if it repeats, provide the request ID. No repository evidence was changed.',
    );
  }
  const payload = await response.json().catch(() => null);
  if (!payload) {
    return diagnostic(
      requestId,
      'github_control_plane_invalid_response',
      502,
      'control_plane.response',
      `The GitHub sync Edge Function returned HTTP ${response.status} without a JSON diagnostic.`,
      'Provide the request ID so the Edge Function deployment can be inspected.',
    );
  }
  return NextResponse.json(payload, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
}
