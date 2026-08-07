import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { parsePublicEnvironment } from './env';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } =
    parsePublicEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (entries) =>
        entries.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
}

/**
 * Obtain a bearer token only after Supabase has validated the cookie-backed
 * session with Auth. `getSession()` alone only reads untrusted cookie storage.
 */
export async function getAuthenticatedServerAccessToken(): Promise<string | null> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  return session?.access_token ?? null;
}
