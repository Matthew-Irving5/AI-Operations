import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const schema = z.object({
  label: z.string().trim().min(1).max(100),
  publicKeyB64: z.string().regex(/^[A-Za-z0-9+/=]{40,100}$/),
  mfaGateId: z.string().uuid(),
});

const route = '/api/devices/register';
const remediationByCode: Record<string, string> = {
  invalid_device: 'Check the label, public key, and MFA gate before starting registration again.',
  unauthorised: 'Sign in again and complete fresh MFA before returning to Devices.',
  fresh_mfa_required: 'Complete fresh MFA immediately before registering the worker.',
  invalid_mfa_gate: 'Start a new worker registration; the previous one-time gate is not usable.',
  mfa_gate_expired: 'Start a new worker registration and pair before the code expires.',
  mfa_gate_replayed: 'Start a new worker registration; one-time gates cannot be reused.',
};

function errorResponse(
  requestId: string,
  code: string,
  status: number,
  stage: string,
  detail: string,
) {
  return NextResponse.json(
    {
      code,
      stage,
      requestId,
      diagnostic: {
        code,
        stage,
        httpStatus: status,
        requestId,
        route,
        method: 'POST',
        detail,
        remediation:
          remediationByCode[code] ??
          'Use the request ID to inspect the registration boundary before retrying.',
      },
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
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return errorResponse(
      requestId,
      'invalid_device',
      400,
      'request_validation',
      'The registration payload did not match the required label, public key, and MFA gate shape.',
    );
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return errorResponse(
      requestId,
      'unauthorised',
      401,
      'authenticated_session',
      'The registration route could not obtain an authenticated AAL2 session from the browser cookies.',
    );
  let response: Response;
  try {
    response = await fetch(
      new URL('/functions/v1/device-register', process.env.NEXT_PUBLIC_SUPABASE_URL),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify(parsed.data),
      },
    );
  } catch {
    return errorResponse(
      requestId,
      'control_plane_unreachable',
      502,
      'supabase_device_register_request',
      'The web route could not reach the Supabase device-register control-plane function.',
    );
  }
  const body = (await response
    .json()
    .catch(() => ({ code: 'registration_response_invalid' }))) as Record<string, unknown> | null;
  const responseBody = {
    ...(body ?? { code: 'registration_response_invalid' }),
    requestId:
      typeof body?.requestId === 'string' && body.requestId.length > 0 ? body.requestId : requestId,
    diagnostic: body?.diagnostic ?? {
      code: typeof body?.code === 'string' ? body.code : 'registration_response_invalid',
      stage: typeof body?.stage === 'string' ? body.stage : 'supabase_device_register_response',
      httpStatus: response.status,
      requestId,
      route,
      method: 'POST',
      detail: 'The Supabase control-plane response was returned without a structured diagnostic.',
      remediation: 'Use the request ID to inspect the Supabase device-register boundary.',
    },
  };
  return NextResponse.json(responseBody, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
}
