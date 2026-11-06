import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';
import {
  buildArchiveObjectKey,
  constantTimeEqual,
  MAX_ARCHIVE_BYTES,
  sha256Hex,
  verifyArchiveReadback,
} from '../../../../lib/archive-gateway';

export const dynamic = 'force-dynamic';

type Diagnostic = {
  code: string;
  stage: string;
  httpStatus: number;
  requestId: string;
  detail: string;
  remediation: string;
};

function requestIdFor(request: Request): string {
  const supplied = request.headers.get('x-request-id') ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

function failure(
  requestId: string,
  code: string,
  status: number,
  stage: string,
  detail: string,
  remediation: string,
) {
  const diagnostic: Diagnostic = {
    code,
    stage,
    httpStatus: status,
    requestId,
    detail,
    remediation,
  };
  return NextResponse.json(
    { code, requestId, diagnostic },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  if (request.method !== 'POST') {
    return failure(
      requestId,
      'method_not_allowed',
      405,
      'request.method',
      'The private finance archive gateway accepts POST requests only.',
      'Submit the controlled statement through the Finance import flow.',
    );
  }
  let env: CloudflareEnv;
  try {
    ({ env } = await getCloudflareContext({ async: true }));
  } catch {
    return failure(
      requestId,
      'archive_runtime_context_unavailable',
      503,
      'archive.runtime_context',
      'The Worker runtime could not provide the configured Cloudflare bindings to the finance archive route.',
      'Redeploy the Worker with the private ARCHIVE_BUCKET binding and gateway secret, then retry the import.',
    );
  }
  const secret = env.FINANCE_ARCHIVE_GATEWAY_SECRET;
  if (!secret) {
    return failure(
      requestId,
      'archive_gateway_unconfigured',
      503,
      'archive.configuration',
      'The finance archive gateway secret is not configured on the Cloudflare Worker.',
      'Configure the environment-specific FINANCE_ARCHIVE_GATEWAY_SECRET Worker secret before importing statements.',
    );
  }
  if (env.APP_ENV !== 'production' && env.APP_ENV !== 'staging') {
    return failure(
      requestId,
      'archive_environment_unconfigured',
      503,
      'archive.configuration',
      'The finance archive gateway has no valid APP_ENV deployment marker.',
      'Deploy the Worker with APP_ENV set to exactly production or staging before importing statements.',
    );
  }
  const suppliedSecret = request.headers.get('x-archive-secret') ?? '';
  if (!constantTimeEqual(suppliedSecret, secret)) {
    return failure(
      requestId,
      'archive_gateway_unauthorised',
      401,
      'archive.authentication',
      'The finance archive gateway secret was missing or did not match.',
      'Retry through the deployed Finance Edge Function; do not put the gateway secret in the browser.',
    );
  }
  const bucket = env.ARCHIVE_BUCKET;
  if (!bucket) {
    return failure(
      requestId,
      'archive_gateway_storage_unavailable',
      503,
      'archive.storage_binding',
      'The Cloudflare Worker has no private ARCHIVE_BUCKET binding.',
      'Bind the environment-specific private R2 bucket before importing statements.',
    );
  }
  const digest = request.headers.get('x-content-sha256') ?? '';
  if (!/^[0-9a-f]{64}$/i.test(digest)) {
    return failure(
      requestId,
      'archive_checksum_missing',
      400,
      'archive.request_headers',
      'The finance archive request did not include a valid SHA-256 content digest.',
      'Retry the controlled import so the Edge Function can send its verified content digest.',
    );
  }
  const userId = request.headers.get('x-user-id') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return failure(
      requestId,
      'archive_user_identity_missing',
      400,
      'archive.request_headers',
      'The finance archive request did not include the authenticated user identity.',
      'Retry the import through the authenticated Finance page; no object was written.',
    );
  }
  const fileName = request.headers.get('x-file-name') ?? 'statement.csv';
  let content: Uint8Array;
  try {
    content = new Uint8Array(await request.arrayBuffer());
  } catch {
    return failure(
      requestId,
      'archive_body_read_failed',
      400,
      'archive.request_body',
      'The finance archive gateway could not read the statement body.',
      'Retry the import with the controlled CSV still held in the Finance form.',
    );
  }
  if (content.length === 0 || content.length > MAX_ARCHIVE_BYTES) {
    return failure(
      requestId,
      'archive_body_size_invalid',
      content.length > MAX_ARCHIVE_BYTES ? 413 : 400,
      'archive.request_body',
      `The finance archive body must be between 1 byte and ${MAX_ARCHIVE_BYTES} bytes.`,
      'Use a non-empty controlled CSV under the 1 MB safety limit.',
    );
  }
  const computedDigest = await sha256Hex(content);
  if (!constantTimeEqual(computedDigest, digest.toLowerCase())) {
    return failure(
      requestId,
      'archive_checksum_mismatch',
      422,
      'archive.integrity',
      'The finance archive body did not match the SHA-256 digest supplied by the control plane.',
      'Retry the import; no object was written because content integrity could not be proven.',
    );
  }
  const objectKey = buildArchiveObjectKey(
    env.APP_ENV,
    userId,
    computedDigest,
    fileName,
    crypto.randomUUID(),
  );
  try {
    const stored = await bucket.put(objectKey, content, {
      httpMetadata: { contentType: 'text/csv' },
      customMetadata: {
        sha256: computedDigest,
        userId,
        requestId,
        source: 'finance_upload',
      },
      sha256: computedDigest,
    });
    if (!stored || stored.size !== content.byteLength) {
      return failure(
        requestId,
        'archive_write_metadata_mismatch',
        502,
        'archive.integrity',
        `The R2 write reported ${stored?.size ?? 'no'} bytes; expected ${content.byteLength}.`,
        'Keep the request ID and do not index or retry this object until its stored bytes are verified.',
      );
    }
    const readback = await bucket.get(objectKey);
    if (!readback) {
      return failure(
        requestId,
        'archive_readback_missing',
        502,
        'archive.integrity',
        `The private R2 object was written as ${content.byteLength} bytes but could not be read back.`,
        'Keep the request ID and do not index or retry this object until the archive read path is healthy.',
      );
    }
    const actual = new Uint8Array(await readback.arrayBuffer());
    const verification = await verifyArchiveReadback(
      { sizeBytes: content.byteLength, contentType: 'text/csv', sha256: computedDigest },
      {
        sizeBytes: readback.size,
        contentType: readback.httpMetadata?.contentType,
        sha256: readback.customMetadata?.sha256,
        bytes: actual,
      },
    );
    if (verification.mismatches.length > 0) {
      return failure(
        requestId,
        'archive_readback_mismatch',
        502,
        'archive.integrity',
        `The stored R2 object failed read-back verification: ${verification.mismatches.join('; ')}.`,
        'Do not create database references to this object; preserve the request ID and retry only after storage integrity is restored.',
      );
    }
  } catch {
    return failure(
      requestId,
      'archive_storage_verification_failed',
      502,
      'archive.integrity',
      'The private R2 write or read-back verification failed before archive metadata could be returned.',
      'Do not create database references to this object; preserve the request ID and investigate the storage boundary before retrying.',
    );
  }
  return NextResponse.json(
    { key: objectKey, bytes: content.length, sha256: computedDigest, verified: true },
    { status: 201, headers: { 'x-request-id': requestId } },
  );
}
