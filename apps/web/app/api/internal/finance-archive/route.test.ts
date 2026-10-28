import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../../../lib/archive-gateway';

const cloudflare = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => cloudflare);

import { POST } from './route';

const userId = '11111111-1111-4111-8111-111111111111';

function bucketFor(bytes: Uint8Array, metadataSha?: string) {
  return {
    put: vi.fn().mockResolvedValue({ size: bytes.byteLength }),
    get: vi.fn().mockResolvedValue({
      size: bytes.byteLength,
      httpMetadata: { contentType: 'text/csv' },
      customMetadata: { sha256: metadataSha },
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }),
  };
}

function request(body: Uint8Array, digest: string) {
  return new Request('https://example.test/api/internal/finance-archive', {
    method: 'POST',
    headers: {
      'x-archive-secret': 'test-secret',
      'x-content-sha256': digest,
      'x-user-id': userId,
      'x-file-name': 'statement.csv',
    },
    body,
  });
}

describe('private finance archive read-back', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a verified object only after R2 bytes and metadata match the uploaded digest', async () => {
    const bytes = new TextEncoder().encode('synthetic statement');
    const digest = await sha256Hex(bytes);
    const bucket = bucketFor(bytes, digest);
    cloudflare.getCloudflareContext.mockResolvedValue({
      env: {
        APP_ENV: 'staging',
        FINANCE_ARCHIVE_GATEWAY_SECRET: 'test-secret',
        ARCHIVE_BUCKET: bucket as unknown as NonNullable<CloudflareEnv['ARCHIVE_BUCKET']>,
      },
    });

    const response = await POST(request(bytes, digest));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      bytes: bytes.byteLength,
      sha256: digest,
      verified: true,
    });
    expect(bucket.put).toHaveBeenCalledWith(
      expect.stringMatching(/^staging\//),
      bytes,
      expect.objectContaining({ sha256: digest }),
    );
    expect(bucket.get).toHaveBeenCalledOnce();
  });

  it('does not claim success when R2 returns different bytes', async () => {
    const bytes = new TextEncoder().encode('synthetic statement');
    const digest = await sha256Hex(bytes);
    const bucket = bucketFor(new TextEncoder().encode('corrupted statement'), digest);
    cloudflare.getCloudflareContext.mockResolvedValue({
      env: {
        APP_ENV: 'staging',
        FINANCE_ARCHIVE_GATEWAY_SECRET: 'test-secret',
        ARCHIVE_BUCKET: bucket as unknown as NonNullable<CloudflareEnv['ARCHIVE_BUCKET']>,
      },
    });

    const response = await POST(request(bytes, digest));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: 'archive_readback_mismatch',
      diagnostic: { stage: 'archive.integrity' },
    });
  });

  it('fails closed when R2 cannot read back the object it accepted', async () => {
    const bytes = new TextEncoder().encode('synthetic statement');
    const digest = await sha256Hex(bytes);
    const bucket = bucketFor(bytes, digest);
    bucket.get.mockResolvedValue(null);
    cloudflare.getCloudflareContext.mockResolvedValue({
      env: {
        APP_ENV: 'staging',
        FINANCE_ARCHIVE_GATEWAY_SECRET: 'test-secret',
        ARCHIVE_BUCKET: bucket as unknown as NonNullable<CloudflareEnv['ARCHIVE_BUCKET']>,
      },
    });

    const response = await POST(request(bytes, digest));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'archive_readback_missing' });
  });
});
