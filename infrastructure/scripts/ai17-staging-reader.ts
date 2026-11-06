import { z } from 'zod';
import { stagingTarget } from '../../apps/web/lib/live-e2e-safety';

const RunIdSchema = z.string().uuid();
const ReportRowsSchema = z
  .array(z.object({ id: z.string().uuid(), run_id: RunIdSchema }).strict())
  .max(2);

/** Server-only readback of protected report identity; never selects report content. */
export async function readAi17StagingReports(
  runIdInput: string,
  environment: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
) {
  const runId = RunIdSchema.parse(runIdInput);
  const token = environment.STAGING_PERSONAL_ACCESS_TOKEN;
  if (!token?.startsWith('sbp_'))
    throw new Error('AI-17 protected report readback requires the staging Management credential.');
  const response = await request(
    `https://api.supabase.com/v1/projects/${stagingTarget.projectRef}/database/query/read-only`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `select id, run_id from public.reports where run_id = '${runId}'::uuid order by id limit 2`,
      }),
    },
  );
  if (!response.ok)
    throw new Error(`AI-17 protected report readback failed HTTP ${response.status}.`);
  const rows = ReportRowsSchema.parse(await response.json());
  if (rows.some((row) => row.run_id !== runId))
    throw new Error('AI-17 report readback returned a different run.');
  return rows;
}
