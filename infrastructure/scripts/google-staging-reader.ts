import { z } from 'zod';
const projectRef = 'jqtssfrfocnibffdkqch';
export function googleFreshnessSql(userId: string): string {
  if (!z.uuid().safeParse(userId).success)
    throw new Error('Google freshness read requires an owner UUID.');
  return `select source,state,last_success_at from public.data_freshness where user_id = '${userId}'::uuid and source = 'google_drive' limit 2`;
}
export async function readGoogleStagingFreshness(
  userId: string,
  environment = process.env,
  request: typeof fetch = fetch,
) {
  const query = googleFreshnessSql(userId);
  if (
    environment.STAGING_PROJECT_REF !== projectRef ||
    environment.STAGING_PROJECT_URL !== `https://${projectRef}.supabase.co` ||
    !environment.STAGING_PERSONAL_ACCESS_TOKEN
  )
    throw new Error('Google freshness reads require fixed staging identity and server-only PAT.');
  const response = await request(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${environment.STAGING_PERSONAL_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!response.ok)
    throw new Error(`Google freshness read-only probe failed HTTP ${response.status}.`);
  return z
    .array(
      z
        .object({
          source: z.literal('google_drive'),
          state: z.string(),
          last_success_at: z.string().nullable(),
        })
        .strict(),
    )
    .max(2)
    .parse(await response.json());
}
