import { NextResponse } from 'next/server';
import { signInSchema } from '../../../../lib/contracts';
import { isAllowedEmail } from '../../../../lib/auth';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../lib/request-security';

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/login', request.url));
}

function redirectToLogin(request: Request, error?: 'invalid' | 'security') {
  const target = new URL('/login', request.url);
  if (error) target.searchParams.set('error', error);
  return NextResponse.redirect(target, { status: 303 });
}

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return redirectToLogin(request, 'security');
  const form = await request.formData();
  const parsed = signInSchema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success || !isAllowedEmail(parsed.data.email))
    return redirectToLogin(request, 'invalid');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  return error
    ? redirectToLogin(request, 'invalid')
    : NextResponse.redirect(new URL('/mfa', request.url), { status: 303 });
}
