import { z } from 'zod';

export const stagingTarget = {
  origin: 'https://ai-operations-staging.ai-operations.workers.dev',
  supabaseUrl: 'https://jqtssfrfocnibffdkqch.supabase.co',
  projectRef: 'jqtssfrfocnibffdkqch',
} as const;

export const legacyStagingE2eFactorName = 'AI Operations staging live E2E';

const environmentSchema = z.object({
  LIVE_E2E_BASE_URL: z.string().url().default(stagingTarget.origin),
  LIVE_E2E_SUPABASE_URL: z.string().url(),
  LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LIVE_E2E_EMAIL: z.string().email().optional(),
  LIVE_E2E_PASSWORD: z.string().min(1).optional(),
});

export type LiveE2eEnvironment = z.infer<typeof environmentSchema>;

export function parseLiveE2eEnvironment(
  env: Record<string, string | undefined>,
  mode: 'suite' | 'fixtures' | 'mismatch',
): LiveE2eEnvironment {
  const parsed = environmentSchema.safeParse({
    LIVE_E2E_BASE_URL: env.LIVE_E2E_BASE_URL ?? stagingTarget.origin,
    LIVE_E2E_SUPABASE_URL: env.LIVE_E2E_SUPABASE_URL ?? env.STAGING_PROJECT_URL,
    LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY:
      env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY ?? env.STAGING_SERVICE_ROLE_KEY,
    LIVE_E2E_EMAIL: env.LIVE_E2E_EMAIL,
    LIVE_E2E_PASSWORD: env.LIVE_E2E_PASSWORD,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(
      `Live staging E2E configuration is incomplete (${missing}); no request was made.`,
    );
  }
  const value = parsed.data;
  const base = new URL(value.LIVE_E2E_BASE_URL);
  const supabase = new URL(value.LIVE_E2E_SUPABASE_URL);
  const matches =
    base.origin === stagingTarget.origin &&
    [stagingTarget.origin, `${stagingTarget.origin}/`].includes(value.LIVE_E2E_BASE_URL) &&
    supabase.origin === stagingTarget.supabaseUrl &&
    [stagingTarget.supabaseUrl, `${stagingTarget.supabaseUrl}/`].includes(
      value.LIVE_E2E_SUPABASE_URL,
    ) &&
    supabase.hostname.split('.')[0] === stagingTarget.projectRef;
  if (!matches) {
    if (mode === 'mismatch') return value;
    throw new Error('Live E2E target must match the fixed staging origin and project.');
  }
  return value;
}
