import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../lib/request-security';

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    return NextResponse.json({ code: 'session_revoke_failed' }, { status: 503 });
  }
  return NextResponse.json({ signedOut: true });
}
