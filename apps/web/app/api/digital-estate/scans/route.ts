import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

const digitalScanGateCookie = 'aiops_mfa_gate_digital_scan_create';

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
  mfaGateId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const body = bodySchema.safeParse(await request.json());
  if (!body.success)
    return NextResponse.json(
      { code: 'invalid_scan_request', stage: 'scan_create', requestId },
      { status: 400, headers: { 'x-request-id': requestId } },
    );
  const cookieStore = await cookies();
  const cookieGateId = cookieStore.get(digitalScanGateCookie)?.value;
  const mfaGateId = body.data.mfaGateId ?? cookieGateId;
  if (!mfaGateId || !z.string().uuid().safeParse(mfaGateId).success) {
    return NextResponse.json(
      {
        code: 'handoff_missing',
        stage: 'mfa_handoff',
        requestId,
        diagnostic: {
          code: 'handoff_missing',
          stage: 'mfa_handoff',
          httpStatus: 400,
          requestId,
          route: '/api/digital-estate/scans',
          method: 'POST',
          detail: 'The scan intent resumed without a valid one-time MFA gate.',
          remediation: 'Start the scan again in this same browser and complete fresh MFA.',
        },
      },
      { status: 400, headers: { 'x-request-id': requestId } },
    );
  }
  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return NextResponse.json(
      { code: 'unauthorised', stage: 'scan_create', requestId },
      { status: 401, headers: { 'x-request-id': requestId } },
    );
  let response: Response;
  try {
    response = await fetch(
      new URL('/functions/v1/digital-scan-create', process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({ ...body.data, mfaGateId }),
      },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'scan_control_plane_unreachable',
        stage: 'control_plane_fetch',
        requestId,
        diagnostic: {
          code: 'scan_control_plane_unreachable',
          stage: 'control_plane_fetch',
          httpStatus: 502,
          requestId,
          route: '/api/digital-estate/scans',
          method: 'POST',
          detail: 'The web route could not reach the Supabase digital-scan-create function.',
          remediation:
            'Retry once; if it persists, use the request ID to inspect deployment health.',
        },
      },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }
  const payload = await response.json().catch(() => ({
    code: 'scan_control_plane_invalid_response',
    stage: 'control_plane_response',
    requestId,
    diagnostic: {
      code: 'scan_control_plane_invalid_response',
      stage: 'control_plane_response',
      httpStatus: response.status,
      requestId,
      route: '/api/digital-estate/scans',
      method: 'POST',
      detail: 'The Supabase digital-scan-create function returned a non-JSON response.',
      remediation: 'Use the request ID to inspect the Edge Function deployment logs.',
    },
  }));
  const result = NextResponse.json(payload, {
    status: response.status,
    headers: { 'x-request-id': requestId },
  });
  if (response.ok) result.cookies.delete(digitalScanGateCookie);
  return result;
}
