import { NextResponse } from 'next/server';
import { z } from 'zod';

const ReleaseMetadataSchema = z
  .object({ releaseSha: z.string().regex(/^[a-f0-9]{40}$/i) })
  .strict();

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  const metadata = ReleaseMetadataSchema.safeParse({ releaseSha: process.env.RELEASE_SHA });
  if (!metadata.success)
    return NextResponse.json(
      { schemaVersion: 1, code: 'release_metadata_unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );

  return NextResponse.json(
    { schemaVersion: 1, releaseSha: metadata.data.releaseSha.toLowerCase() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
