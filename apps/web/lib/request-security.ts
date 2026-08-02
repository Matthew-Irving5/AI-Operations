import { NextResponse } from 'next/server';

/** Reject cross-site state-changing requests before they reach Supabase. */
export function requireSameOrigin(request: Request): NextResponse | undefined {
  const origin = request.headers.get('origin');
  if (!origin) return NextResponse.json({ code: 'origin_required' }, { status: 403 });

  const expectedOrigin = new URL(request.url).origin;
  return origin === expectedOrigin
    ? undefined
    : NextResponse.json({ code: 'origin_invalid' }, { status: 403 });
}
