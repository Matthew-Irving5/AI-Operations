import { z } from 'zod';
import { stagingTarget } from './live-e2e-safety';

export const localTestAuthFlag = 'LOCAL_TEST_AUTH';
export const localTestUserId = '00000000-0000-0000-0000-000000000101';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const authFlagSchema = z.enum(['1', 'true']);

function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && loopbackHosts.has(url.hostname);
  } catch {
    return false;
  }
}

export function assertLocalTestAuthEnvironment(env: Record<string, string | undefined>): boolean {
  const flag = env[localTestAuthFlag];
  if (flag === undefined) return false;
  if (!authFlagSchema.safeParse(flag).success) {
    throw new Error('LOCAL_TEST_AUTH must be explicitly set to true or 1.');
  }
  if (
    env.NODE_ENV !== 'development' ||
    env.APP_ENV !== 'local' ||
    !isLoopbackUrl(env.LOCAL_TEST_APP_ORIGIN) ||
    !isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  ) {
    throw new Error(
      'LOCAL_TEST_AUTH is restricted to a development app and Supabase instance on loopback.',
    );
  }
  if (!env.E2E_JWT_SECRET || !env.LOCAL_TEST_EMAIL || !env.LOCAL_TEST_PASSWORD) {
    throw new Error(
      'Local test authentication requires local credentials and the local JWT secret.',
    );
  }
  const validateStaging = env.LOCAL_TEST_AUTH_VALIDATE_STAGING;
  if (validateStaging && !authFlagSchema.safeParse(validateStaging).success) {
    throw new Error('LOCAL_TEST_AUTH_VALIDATE_STAGING must be true or 1 when enabled.');
  }
  if (
    validateStaging &&
    (!env.LOCAL_TEST_STAGING_ANON_KEY ||
      !env.LOCAL_TEST_STAGING_EMAIL ||
      !env.LOCAL_TEST_STAGING_PASSWORD)
  ) {
    throw new Error(
      'Staging Auth validation requires staging test credentials and a staging anon key.',
    );
  }
  return true;
}

export function assertNoLocalTestAuthInBuild(env: Record<string, string | undefined>): void {
  if (Object.hasOwn(env, localTestAuthFlag)) {
    throw new Error('LOCAL_TEST_AUTH is forbidden in production builds and deployments.');
  }
}

export async function validateStagingAuthCredentials(
  email: string,
  password: string,
  anonKey: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(
      `${stagingTarget.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: { apikey: anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
        redirect: 'error',
      },
    );
    const valid = response.ok;
    await response.body?.cancel();
    return valid;
  } catch {
    return false;
  }
}
