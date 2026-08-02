import { NextResponse } from 'next/server';
import { signInSchema } from '../../../../lib/contracts';
import { isAllowedEmail } from '../../../../lib/auth';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../lib/request-security';
export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const form = await request.formData();
  const parsed = signInSchema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success || !isAllowedEmail(parsed.data.email))
    return NextResponse.redirect(new URL('/login?error=invalid', request.url));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  return NextResponse.redirect(new URL(error ? '/login?error=invalid' : '/mfa', request.url));
}
