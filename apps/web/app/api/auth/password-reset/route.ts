import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { requireSameOrigin } from '../../../../lib/request-security';

const requestSchema = z.object({ email: z.string().trim().email().max(254) });
const publicMessage = 'If the address is eligible, a recovery link will arrive shortly.';
const responseFloorMs = 400;

async function waitForResponseFloor(startedAt: number) {
  const remaining = responseFloorMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function recoveryRedirectTo(request: Request) {
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (process.env.NODE_ENV === 'production' && !configuredOrigin) {
    throw new Error('public_app_origin_required');
  }
  const origin = configuredOrigin ?? new URL(request.url).origin;
  const parsed = new URL(origin);
  if (
    parsed.origin !== origin ||
    (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
  ) {
    throw new Error('public_app_origin_invalid');
  }
  const redirect = new URL('/auth/callback', parsed);
  redirect.searchParams.set('next', '/reset-password');
  return redirect.toString();
}

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;

  const startedAt = Date.now();
  let email: string | undefined;
  try {
    const form = await request.formData();
    const parsed = requestSchema.safeParse({ email: form.get('email') });
    if (parsed.success) email = parsed.data.email;
  } catch {
    email = undefined;
  }

  if (email) {
    try {
      const supabase = await createSupabaseServerClient();
      // Supabase Auth documents that this endpoint never reveals account existence and sends
      // no email for an unknown address. Route every valid address through it so this handler
      // does not create an allowlist-dependent fast path.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryRedirectTo(request),
      });
      if (error) console.error('auth_password_recovery_email_failed');
    } catch {
      // Keep the public response identical for invalid identities and provider failures.
      console.error('auth_password_recovery_email_failed');
    }
  }

  await waitForResponseFloor(startedAt);
  return NextResponse.json(
    { message: publicMessage },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}
