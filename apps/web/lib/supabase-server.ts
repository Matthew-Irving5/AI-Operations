import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { parsePublicEnvironment } from './env';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } =
    parsePublicEnvironment(process.env);
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (entries) =>
        entries.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
}
