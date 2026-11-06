import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSupabaseAccessTokenClient,
  getAuthenticatedServerAccessToken,
} from '../../../../lib/supabase-server';
import { sha256Hex } from '../../../../lib/archive-gateway';

export const dynamic = 'force-dynamic';

const archivedReferenceSchema = z
  .object({
    objectKey: z.string().min(1).max(1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().nonnegative(),
    contentType: z.string().min(1).max(120),
  })
  .strict();

function diagnostic(
  requestId: string,
  code: string,
  status: number,
  detail: string,
  remediation: string,
) {
  return NextResponse.json(
    {
      code,
      requestId,
      diagnostic: {
        code,
        stage: 'archive.readback',
        httpStatus: status,
        requestId,
        detail,
        remediation,
      },
    },
    { status, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
  );
}

function archiveKey(parts: string[]): string | null {
  if (
    parts.length === 0 ||
    parts.some((part) => !/^[A-Za-z0-9._-]{1,180}$/.test(part) || part === '.' || part === '..')
  )
    return null;
  const key = parts.join('/');
  return key.length <= 1024 ? key : null;
}

export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const requestId = crypto.randomUUID();
  const key = archiveKey((await context.params).key);
  if (!key)
    return diagnostic(
      requestId,
      'archive_key_invalid',
      400,
      'The requested archive key is not a valid stored object path.',
      'Open the archive link from its owning trace or evidence record and retry.',
    );

  const accessToken = await getAuthenticatedServerAccessToken();
  if (!accessToken)
    return diagnostic(
      requestId,
      'unauthorised',
      401,
      'The server could not validate the signed-in archive reader.',
      'Sign in again, complete fresh MFA, and reopen the archived evidence.',
    );
  const mfaGateId = request.headers.get('x-mfa-gate-id') ?? '';
  if (!z.string().uuid().safeParse(mfaGateId).success) {
    return diagnostic(
      requestId,
      'fresh_mfa_required',
      403,
      'A one-time archive-read MFA gate is required before retrieving sensitive archived bytes.',
      'Complete a fresh authenticator challenge for this archive read.',
    );
  }

  const client = createSupabaseAccessTokenClient(accessToken);
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user)
    return diagnostic(
      requestId,
      'unauthorised',
      401,
      'Supabase could not validate the archive reader identity.',
      'Sign in again and retry from the authenticated trace page.',
    );

  let expected: z.infer<typeof archivedReferenceSchema> | null = null;
  const source = await client
    .from('source_objects')
    .select('r2_key,sha256,size_bytes,mime_type')
    .eq('user_id', identity.user.id)
    .eq('r2_key', key)
    .maybeSingle();
  if (source.error)
    return diagnostic(
      requestId,
      'archive_metadata_unavailable',
      503,
      'The owner-scoped source-object metadata lookup failed.',
      'Keep the request ID and retry when the authenticated database read path is healthy.',
    );
  if (source.data) {
    expected = {
      objectKey: source.data.r2_key,
      sha256: source.data.sha256,
      sizeBytes: source.data.size_bytes,
      contentType: source.data.mime_type,
    };
  } else {
    const trace = await client
      .from('trace_events')
      .select('archive_reference')
      .eq('user_id', identity.user.id)
      .eq('archive_reference->>objectKey', key)
      .not('archive_reference', 'is', null)
      .limit(1)
      .maybeSingle();
    if (trace.error)
      return diagnostic(
        requestId,
        'archive_metadata_unavailable',
        503,
        'The owner-scoped archived-trace metadata lookup failed.',
        'Keep the request ID and retry when the authenticated database read path is healthy.',
      );
    const parsed = archivedReferenceSchema.safeParse(trace.data?.archive_reference);
    if (parsed.success && parsed.data.objectKey === key) expected = parsed.data;
  }
  if (!expected)
    return diagnostic(
      requestId,
      'archive_not_found',
      404,
      'No archive record owned by the signed-in user references this object.',
      'Open an archive link from your own trace or evidence record.',
    );

  const consumed = await client.rpc('consume_mfa_action_gate', {
    p_gate_id: mfaGateId,
    p_action_key: 'archive_read',
  });
  if (consumed.error || consumed.data !== true)
    return diagnostic(
      requestId,
      'fresh_mfa_required',
      403,
      'The archive-read MFA gate was missing, expired, replayed, or bound to another user.',
      'Complete a new authenticator challenge for this archive read.',
    );

  let bucket: CloudflareEnv['ARCHIVE_BUCKET'] | undefined;
  try {
    ({
      env: { ARCHIVE_BUCKET: bucket },
    } = await getCloudflareContext({ async: true }));
  } catch {
    return diagnostic(
      requestId,
      'archive_storage_unavailable',
      503,
      'The private R2 runtime binding is unavailable.',
      'Restore the environment-specific private archive binding, then retry the read.',
    );
  }
  if (!bucket)
    return diagnostic(
      requestId,
      'archive_storage_unavailable',
      503,
      'The private R2 archive binding is not configured.',
      'Bind the environment-specific private archive bucket before reading evidence.',
    );

  try {
    const object = await bucket.get(key);
    if (!object)
      return diagnostic(
        requestId,
        'archive_object_missing',
        404,
        'The metadata record exists, but its private R2 object is missing.',
        'Preserve the request ID and use the verified backup restore procedure.',
      );
    const bytes = new Uint8Array(await object.arrayBuffer());
    const actualSha = await sha256Hex(bytes);
    const mismatches: string[] = [];
    if (bytes.byteLength !== expected.sizeBytes) mismatches.push('body_size');
    if (object.size !== expected.sizeBytes) mismatches.push('metadata_size');
    if (actualSha !== expected.sha256) mismatches.push('body_sha256');
    if (object.httpMetadata?.contentType !== expected.contentType) mismatches.push('content_type');
    if (object.customMetadata?.sha256 && object.customMetadata.sha256 !== expected.sha256)
      mismatches.push('metadata_sha256');
    if (mismatches.length) {
      return diagnostic(
        requestId,
        'archive_integrity_mismatch',
        502,
        `The archived object differs from its owner-scoped database reference (${mismatches.join(', ')}).`,
        'Do not use the downloaded object; preserve the request ID and restore it from a verified backup.',
      );
    }
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'content-type': expected.contentType,
        'content-disposition': 'attachment; filename="archived-evidence"',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'x-request-id': requestId,
      },
    });
  } catch {
    return diagnostic(
      requestId,
      'archive_storage_read_failed',
      502,
      'The private R2 object could not be read and checked against its database checksum.',
      'Preserve the request ID and retry after the archive read path is healthy.',
    );
  }
}
