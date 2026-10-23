import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const cloudflare = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }));
const session = vi.hoisted(() => ({
  getAuthenticatedServerAccessToken: vi.fn(),
  createSupabaseAccessTokenClient: vi.fn(),
  sourceResult: null as unknown,
  traceResult: null as unknown,
  gateResult: { data: true, error: null } as unknown,
}));
vi.mock('@opennextjs/cloudflare', () => cloudflare);
vi.mock('../../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: session.getAuthenticatedServerAccessToken,
  createSupabaseAccessTokenClient: session.createSupabaseAccessTokenClient,
}));

import { GET } from './route';

const userId = '11111111-1111-4111-8111-111111111111';
const gateId = '22222222-2222-4222-8222-222222222222';

function setup(
  sourceResult: unknown,
  traceResult: unknown,
  bytes: Uint8Array,
  expectedSha?: string,
) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockImplementation(() =>
        queryTable === 'source_objects'
          ? { data: sourceResult, error: null }
          : { data: traceResult, error: null },
      ),
  };
  let queryTable = '';
  const bucket = {
    get: vi.fn().mockResolvedValue({
      size: bytes.byteLength,
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { sha256: expectedSha ?? createHash('sha256').update(bytes).digest('hex') },
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }),
  };
  session.sourceResult = sourceResult;
  session.traceResult = traceResult;
  session.createSupabaseAccessTokenClient.mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
    from: vi.fn((table: string) => {
      queryTable = table;
      return query;
    }),
    rpc: vi.fn().mockImplementation(() => Promise.resolve(session.gateResult)),
  });
  cloudflare.getCloudflareContext.mockResolvedValue({ env: { ARCHIVE_BUCKET: bucket } });
  return { bucket };
}

function request() {
  return new Request('https://example.test/api/archive/staging/user/trace.json', {
    headers: { 'x-mfa-gate-id': gateId },
  });
}

function context() {
  return { params: Promise.resolve({ key: ['staging', 'user', 'trace.json'] }) };
}

describe('owner-scoped archived evidence retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.getAuthenticatedServerAccessToken.mockResolvedValue('verified-access-token');
    session.sourceResult = null;
    session.traceResult = null;
    session.gateResult = { data: true, error: null };
  });

  it('consumes a fresh MFA gate and returns the exact owner-scoped R2 bytes after SHA/size/MIME verification', async () => {
    const bytes = new TextEncoder().encode('{"trace":"synthetic"}');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { bucket } = setup(
      {
        r2_key: 'staging/user/trace.json',
        sha256,
        size_bytes: bytes.byteLength,
        mime_type: 'application/json',
      },
      null,
      bytes,
    );

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="archived-evidence"',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(bucket.get).toHaveBeenCalledWith('staging/user/trace.json');
  });

  it('finds trace-only archive references through the user JWT and fails closed for corrupted bytes', async () => {
    const wanted = new TextEncoder().encode('{"trace":"expected"}');
    const corrupted = new TextEncoder().encode('{"trace":"corrupt"}');
    const reference = {
      objectKey: 'staging/user/trace.json',
      sha256: createHash('sha256').update(wanted).digest('hex'),
      sizeBytes: wanted.byteLength,
      contentType: 'application/json',
    };
    const { bucket } = setup(null, { archive_reference: reference }, corrupted, reference.sha256);

    const response = await GET(request(), context());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'archive_integrity_mismatch' });
    expect(bucket.get).toHaveBeenCalledOnce();
  });

  it('requires the one-time gate before reading R2', async () => {
    const bytes = new TextEncoder().encode('synthetic');
    setup(
      {
        r2_key: 'staging/user/trace.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size_bytes: bytes.byteLength,
        mime_type: 'application/json',
      },
      null,
      bytes,
    );
    session.gateResult = { data: false, error: null };

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'fresh_mfa_required' });
  });

  it('does not expose objects without an owner-scoped database reference', async () => {
    const { bucket } = setup(null, null, new TextEncoder().encode('private'));

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'archive_not_found' });
    expect(bucket.get).not.toHaveBeenCalled();
  });
});
