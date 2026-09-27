import { NextResponse } from 'next/server';
import {
  aal2ProbeRequestSchema,
  isStagingAal2ProbeTarget,
  parseAal2ProbeEdgeResponse,
} from '../../../../../lib/aal2-edge-probe';
import { requireSameOrigin } from '../../../../../lib/request-security';
import { getAuthenticatedServerAccessToken } from '../../../../../lib/supabase-server';
import { stagingTarget } from '../../../../../lib/live-e2e-safety';

const noStoreHeaders = { 'cache-control': 'no-store' };

function response(status: number, code: string, probeId?: string, httpStatus = 200) {
  return NextResponse.json(
    { ...(probeId ? { probeId } : {}), status, code },
    { status: httpStatus, headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;

  if (
    !isStagingAal2ProbeTarget(
      request.headers.get('origin'),
      process.env.PUBLIC_APP_ORIGIN,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    )
  ) {
    return response(404, 'not_found', undefined, 404);
  }

  const body = aal2ProbeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return response(400, 'invalid_probe_request', undefined, 400);

  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken) return response(401, 'unauthorised', undefined, 401);

  const probeId = crypto.randomUUID();
  try {
    const edgeResponse = await fetch(
      `${stagingTarget.supabaseUrl}/functions/v1/digital-plan-approve`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: '{}',
        cache: 'no-store',
        redirect: 'error',
      },
    );
    const edgeBody = await edgeResponse.json().catch(() => null);
    const result = parseAal2ProbeEdgeResponse(edgeResponse.status, edgeBody);
    return response(result.status, result.code, probeId);
  } catch {
    return response(502, 'edge_probe_unavailable', probeId, 502);
  }
}
