import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSupabaseAccessTokenClient,
  createSupabaseServerClient,
} from '../../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../../lib/request-security';

const bodySchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  job: z
    .enum([
      'apple_bridge',
      'gmail_test',
      'connection_revoke',
      'connection_scope_change',
      'worker_device_register',
      'worker_device_revoke',
    ])
    .optional(),
});

const route = '/api/auth/mfa/verify';

function diagnosticResponse(
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
      diagnostic: {
        code,
        stage,
        httpStatus: status,
        requestId,
        route,
        method: 'POST',
        detail,
        remediation,
      },
    },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export async function POST(request: Request) {
  const requestId = request.headers.get('x-client-request-id') ?? crypto.randomUUID();
  try {
    const rejected = requireSameOrigin(request);
    if (rejected) {
      rejected.headers.set('x-request-id', requestId);
      return rejected;
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return diagnosticResponse(
        requestId,
        'invalid_request',
        400,
        'request_validation',
        'The MFA request did not match the required factor, code, and job shape.',
        'Start the worker registration again and submit the current six-digit code.',
      );

    const supabase = await createSupabaseServerClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: parsed.data.factorId,
    });
    if (challengeError)
      return diagnosticResponse(
        requestId,
        'challenge_failed',
        400,
        'supabase_mfa_challenge',
        'Supabase did not create an MFA challenge for the selected authenticator factor.',
        'Refresh the page so the verified factor can be loaded again, then retry once.',
      );

    const { data: verification, error } = await supabase.auth.mfa.verify({
      factorId: parsed.data.factorId,
      challengeId: challenge.id,
      code: parsed.data.code,
    });
    if (error || !verification)
      return diagnosticResponse(
        requestId,
        'verification_failed',
        401,
        'supabase_mfa_verify',
        'Supabase rejected the submitted TOTP code; no elevated session was issued.',
        'Use the current Microsoft Authenticator code and submit it before it rolls over.',
      );

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: verification.access_token,
      refresh_token: verification.refresh_token,
    });
    if (sessionError)
      return diagnosticResponse(
        requestId,
        'session_persist_failed',
        500,
        'session_persist',
        'MFA was accepted, but the elevated Supabase session could not be persisted to the browser response.',
        'Do not retry the code repeatedly; refresh the page once and start the registration again.',
      );

    const elevated = createSupabaseAccessTokenClient(verification.access_token);
    const { data: userData, error: userError } = await elevated.auth.getUser();
    if (userError || !userData.user)
      return diagnosticResponse(
        requestId,
        'unauthorised',
        401,
        'elevated_user_lookup',
        'Supabase issued an MFA response but the elevated access token could not identify the user.',
        'Sign in again so the MFA challenge is tied to the active account.',
      );

    const { error: eventError } = await elevated
      .from('mfa_reauthentication_events')
      .insert({ user_id: userData.user.id, method: 'totp' });
    if (eventError)
      return diagnosticResponse(
        requestId,
        'reauthentication_record_failed',
        500,
        'reauthentication_audit_insert',
        'The elevated MFA session was issued, but the required reauthentication evidence could not be recorded.',
        'Do not continue the worker operation until the audit boundary succeeds; try again after refreshing.',
      );

    if (parsed.data.job) {
      const actionKey =
        parsed.data.job === 'apple_bridge'
          ? 'apple_bridge_create'
          : parsed.data.job === 'gmail_test'
            ? 'gmail_test_notification'
            : parsed.data.job === 'connection_revoke'
              ? 'connection_revoke'
              : parsed.data.job === 'connection_scope_change'
                ? 'connection_scope_change'
                : parsed.data.job;
      const { data: mfaGateId, error: gateError } = await elevated.rpc('create_mfa_action_gate', {
        p_action_key: actionKey,
      });
      if (gateError || !mfaGateId)
        return diagnosticResponse(
          requestId,
          'mfa_gate_create_failed',
          500,
          'mfa_action_gate_insert',
          'MFA succeeded, but the one-time worker action gate was not created.',
          'Do not retry repeatedly; the server did not authorise the worker operation. Refresh and start a new registration once.',
        );
      return NextResponse.json(
        {
          aal: 'aal2',
          mfaGateId,
          diagnostic: {
            code: 'mfa_verified',
            stage: 'complete',
            httpStatus: 200,
            requestId,
            route,
            method: 'POST',
            detail:
              'MFA, session persistence, audit recording, and one-time gate creation completed.',
            remediation: 'Continue to the worker Devices resume screen.',
          },
        },
        { headers: { 'x-request-id': requestId } },
      );
    }

    return NextResponse.json(
      {
        aal: 'aal2',
        diagnostic: {
          code: 'mfa_verified',
          stage: 'complete',
          httpStatus: 200,
          requestId,
          route,
          method: 'POST',
          detail: 'MFA and session persistence completed.',
          remediation: 'Continue to the requested operation.',
        },
      },
      { headers: { 'x-request-id': requestId } },
    );
  } catch {
    return diagnosticResponse(
      requestId,
      'mfa_verification_failed',
      500,
      'unexpected_server_exception',
      'The MFA route failed before it could report a more specific boundary.',
      'Use the request ID with the operator diagnostics; do not repeat the action blindly.',
    );
  }
}
