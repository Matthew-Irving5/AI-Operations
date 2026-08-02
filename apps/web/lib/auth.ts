import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase-server';
const allowed = 'matthewirving99@gmail.com';
export const isAllowedEmail = (email: string): boolean => email.trim().toLowerCase() === allowed;
export async function requireAal2(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const [{ data: userData }, { data: assurance }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (
    !userData.user ||
    !isAllowedEmail(userData.user.email ?? '') ||
    assurance?.currentLevel !== 'aal2'
  )
    redirect('/login');
}
export function requireRecentMfa(completedAt: Date, now = new Date()): boolean {
  return now.getTime() - completedAt.getTime() <= 5 * 60_000;
}
