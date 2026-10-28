import { z } from 'zod';
const projectRef = 'jqtssfrfocnibffdkqch';
export const procurementEvidenceColumns =
  'id,user_id,manager_code,hard_cap_minor,reserved_minor,search_limit,searches_used,status,request,decision_record,workflow_run_id,revises_research_run_id,report_id,created_at,completed_at';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildProcurementStagingSql(query: URLSearchParams): string {
  const allowed = new Set([
    'select',
    'id',
    'user_id',
    'manager_code',
    'limit',
    'request->>item',
    'created_at',
    'order',
    'revises_research_run_id',
  ]);
  if (
    [...query.keys()].some((key) => !allowed.has(key)) ||
    query.get('select') !== procurementEvidenceColumns ||
    query.get('manager_code') !== 'eq.procurement'
  )
    throw new Error('Procurement read requires fixed columns and manager scope.');
  const user = query.get('user_id')?.replace(/^eq\./, '');
  if (!user || !uuid.test(user)) throw new Error('Procurement read requires an owner UUID.');
  const clauses = [`user_id = '${user}'::uuid`, "manager_code = 'procurement'"];
  const id = query.get('id');
  if (id) {
    if (!id.startsWith('eq.') || !uuid.test(id.slice(3))) throw new Error('Invalid research UUID.');
    clauses.push(`id = '${id.slice(3)}'::uuid`);
  } else {
    const item = query.get('request->>item');
    const after = query.get('created_at');
    if (
      !item?.startsWith('eq.AI-39 acceptance charger ') ||
      item.length > 150 ||
      !after?.startsWith('gte.') ||
      !Number.isFinite(Date.parse(after.slice(4)))
    )
      throw new Error('Procurement discovery requires a synthetic item and timestamp.');
    clauses.push(
      `request->>'item' = '${item.slice(3).replaceAll("'", "''")}'`,
      `created_at >= '${new Date(after.slice(4)).toISOString()}'::timestamptz`,
    );
  }
  const revision = query.get('revises_research_run_id');
  if (revision) {
    if (!revision.startsWith('eq.') || !uuid.test(revision.slice(3)))
      throw new Error('Invalid revision UUID.');
    clauses.push(`revises_research_run_id = '${revision.slice(3)}'::uuid`);
  }
  if (
    !['2', '5'].includes(query.get('limit') ?? '') ||
    (query.has('order') && query.get('order') !== 'created_at.desc')
  )
    throw new Error('Procurement read requires bounded ordering.');
  return `select ${procurementEvidenceColumns} from public.on_demand_research_runs where ${clauses.join(' and ')} order by created_at desc limit ${query.get('limit')}`;
}

export async function readProcurementStagingRows<T>(
  query: URLSearchParams,
  environment = process.env,
  request: typeof fetch = fetch,
): Promise<T[]> {
  const sql = buildProcurementStagingSql(query);
  if (
    environment.STAGING_PROJECT_REF !== projectRef ||
    environment.STAGING_PROJECT_URL !== `https://${projectRef}.supabase.co` ||
    !environment.STAGING_PERSONAL_ACCESS_TOKEN
  )
    throw new Error('Procurement reads require fixed staging identity and server-only PAT.');
  const response = await request(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${environment.STAGING_PERSONAL_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok)
    throw new Error(`Procurement read-only evidence failed HTTP ${response.status}.`);
  const row = z
    .object({
      id: z.uuid(),
      user_id: z.uuid(),
      manager_code: z.literal('procurement'),
      hard_cap_minor: z.number().int(),
      reserved_minor: z.number().int(),
      search_limit: z.number().int(),
      searches_used: z.number().int(),
      status: z.string(),
      request: z.record(z.string(), z.unknown()),
      decision_record: z.record(z.string(), z.unknown()).nullable(),
      workflow_run_id: z.uuid().nullable(),
      revises_research_run_id: z.uuid().nullable(),
      report_id: z.uuid().nullable(),
      created_at: z.iso.datetime({ offset: true }),
      completed_at: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict();
  return z
    .array(row)
    .max(5)
    .parse(await response.json()) as T[];
}
