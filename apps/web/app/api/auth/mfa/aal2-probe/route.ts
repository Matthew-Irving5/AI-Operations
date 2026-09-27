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

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) return response(503, 'probe_configuration_unavailable', undefined, 503);

  const probeId = crypto.randomUUID();
  try {
    const edgeResponse = await fetch(
      `${stagingTarget.supabaseUrl}/functions/v1/digital-plan-approve`,
      {
        method: 'POST',
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: '{}',
        cache: 'no-store',
        // Do not follow redirects from the fixed provider endpoint. Manual mode
        // lets us return a safe status/code diagnostic instead of collapsing a
        // 3xx into an opaque fetch exception.
        redirect: 'manual',
      },
    );
    const edgeBody = await edgeResponse.json().catch(() => null);
    const result = parseAal2ProbeEdgeResponse(edgeResponse.status, edgeBody);
    return response(result.status, result.code, probeId);
  } catch (error) {
    // Keep provider credentials and raw exception text out of logs. The
    // correlation ID and error class are enough to distinguish a transport
    // failure from an HTTP response without exposing request data.
    console.error('staging_aal2_probe_fetch_failed', {
      probeId,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return response(502, 'edge_probe_unavailable', probeId, 502);
  }
}
