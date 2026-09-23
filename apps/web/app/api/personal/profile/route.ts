import { NextResponse } from 'next/server';
import { personalProfileSchema } from '../../../../lib/personal-profile-schema';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const controlPlaneUrl = () =>
  new URL('/functions/v1/personal-profile', process.env.NEXT_PUBLIC_SUPABASE_URL).toString();

async function proxy(request: Request, method: 'GET' | 'PUT') {
  const requestId = crypto.randomUUID();
  if (method === 'PUT') {
    const rejected = requireSameOrigin(request);
    if (rejected) return rejected;
  }
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return NextResponse.json(
      {
        code: 'unauthorised',
        requestId,
        diagnostic: {
          code: 'unauthorised',
          stage: 'authentication',
          httpStatus: 401,
          requestId,
          detail:
            'Supabase could not validate the request cookie session and could not rotate it with the refresh token. The request stopped at the web server session boundary; it did not reach the Personal Profile Edge Function or database.',
          remediation:
            'Click Save once more to use the automatic server-side refresh. If this remains 401, the refresh token has expired or was revoked: open a new sign-in tab, complete MFA, then return to this page; the form draft is preserved in this tab.',
        },
      },
      { status: 401, headers: { 'x-request-id': requestId } },
    );
  let body: string | undefined;
  if (method === 'PUT') {
    const parsed = personalProfileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        {
          code: 'invalid_profile_request',
          requestId,
          diagnostic: {
            code: 'invalid_profile_request',
            stage: 'request.validation',
            httpStatus: 400,
            requestId,
            detail: parsed.error.issues
              .slice(0, 8)
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; '),
            remediation: 'Correct the highlighted Personal Profile fields and try again.',
          },
        },
        { status: 400, headers: { 'x-request-id': requestId } },
      );
    body = JSON.stringify(parsed.data);
  }
  let response: Response;
  try {
    response = await fetch(controlPlaneUrl(), {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body
          ? {
              'content-type': 'application/json',
            }
          : {}),
        'x-request-id': requestId,
      },
      ...(body ? { body } : {}),
    });
  } catch {
    return NextResponse.json(
      {
        code: 'profile_control_plane_unreachable',
        requestId,
        diagnostic: {
          code: 'profile_control_plane_unreachable',
          stage: 'control_plane.network',
          httpStatus: 503,
          requestId,
          detail: 'The Personal Profile control-plane request could not be completed.',
          remediation: 'Check connectivity and retry once; if it repeats, provide the request ID.',
        },
      },
      { status: 503, headers: { 'x-request-id': requestId } },
    );
  }
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as unknown;
    return NextResponse.json(payload, {
      status: response.status,
      headers: { 'x-request-id': requestId },
    });
  } catch {
    return NextResponse.json(
      {
        code: 'profile_control_plane_invalid_response',
        requestId,
        diagnostic: {
          code: 'profile_control_plane_invalid_response',
          stage: 'control_plane.response',
          httpStatus: 502,
          requestId,
          detail: `The control plane returned HTTP ${response.status} with a non-JSON response.`,
          remediation: 'Retry once; inspect the request ID in Supabase function logs.',
        },
      },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }
}

export async function GET(request: Request) {
  return proxy(request, 'GET');
}
export async function PUT(request: Request) {
  return proxy(request, 'PUT');
}
