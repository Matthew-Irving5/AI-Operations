const stagingProjectRef = 'jqtssfrfocnibffdkqch';
const stagingProjectUrl = `https://${stagingProjectRef}.supabase.co`;

const protectedMobileTables = {
  mobile_snapshots: {
    columns: [
      'id',
      'snapshot_id',
      'request_id',
      'device_id',
      'user_id',
      'received_at',
      'received_count',
      'client_type',
      'client_version',
      'status',
    ],
    filters: [
      'id',
      'snapshot_id',
      'request_id',
      'device_id',
      'user_id',
      'received_at',
      'received_count',
      'client_type',
      'status',
    ],
    scope: [
      ['user_id', 'device_id'],
      ['user_id', 'snapshot_id'],
    ],
  },
  mobile_snapshot_sources: {
    columns: ['id', 'user_id'],
    filters: ['id', 'user_id', 'snapshot_internal_id'],
    scope: [['user_id', 'snapshot_internal_id']],
  },
  mobile_ingestion_records: {
    columns: ['id', 'user_id', 'record_id'],
    filters: ['id', 'user_id', 'snapshot_internal_id', 'record_id'],
    scope: [['user_id', 'snapshot_internal_id']],
  },
  mobile_record_adaptations: {
    columns: ['id', 'user_id', 'status', 'derived_row_id'],
    filters: ['id', 'user_id', 'record_internal_id', 'adapter_name', 'adapter_version'],
    scope: [['user_id', 'record_internal_id']],
  },
  mobile_calendar_event_items: {
    columns: ['id', 'user_id', 'raw_record_id', 'title'],
    filters: ['user_id', 'raw_record_id', 'title'],
    scope: [
      ['user_id', 'raw_record_id'],
      ['user_id', 'title'],
    ],
  },
} as const;

type ProtectedMobileTable = keyof typeof protectedMobileTables;

function quoteSqlString(value: string): string {
  if (value.includes('\0'))
    throw new Error('AI28 mobile SQL filter contains an invalid character.');
  return `'${value.replaceAll("'", "''")}'`;
}

function validateFilterValue(table: ProtectedMobileTable, column: string, value: string): void {
  if (
    [
      'id',
      'snapshot_id',
      'request_id',
      'device_id',
      'user_id',
      'snapshot_internal_id',
      'record_internal_id',
    ].includes(column)
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('AI28 mobile SQL UUID filter is invalid.');
    return;
  }
  if (column === 'received_at') {
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    ) {
      throw new Error('AI28 mobile SQL timestamp filter is invalid.');
    }
    return;
  }
  if (column === 'received_count') {
    if (!/^(?:0|[1-9]\d{0,5})$/.test(value))
      throw new Error('AI28 mobile SQL count filter is invalid.');
    return;
  }
  if (!/^[A-Za-z0-9._:-]{1,256}$/.test(value)) {
    throw new Error(`AI28 mobile SQL text filter is invalid for ${table}.${column}.`);
  }
}

function parsePostgrestFilter(
  table: ProtectedMobileTable,
  column: string,
  expression: string,
): string {
  if (
    table === 'mobile_calendar_event_items' &&
    column === 'title' &&
    expression.startsWith('like.')
  ) {
    const match = /^like\.(AI28_SYNTH_[A-Za-z0-9_-]{1,80})\*$/.exec(expression);
    if (!match)
      throw new Error('AI28 mobile SQL title filter must use a synthetic fixture prefix.');
    const prefix = match[1]!;
    return `left(title, ${prefix.length}) = ${quoteSqlString(prefix)}`;
  }
  if (expression.startsWith('eq.')) {
    const value = expression.slice(3);
    validateFilterValue(table, column, value);
    return `${column} = ${quoteSqlString(value)}`;
  }
  if (expression.startsWith('gt.') && column === 'received_at') {
    const value = expression.slice(3);
    validateFilterValue(table, column, value);
    return `${column} > ${quoteSqlString(value)}::timestamptz`;
  }
  if (expression.startsWith('in.(') && expression.endsWith(')') && column === 'snapshot_id') {
    const values = expression.slice(4, -1).split(',');
    if (values.length < 1 || values.length > 10)
      throw new Error('AI28 mobile SQL IN filter is out of bounds.');
    for (const value of values) validateFilterValue(table, column, value);
    return `${column} in (${values.map(quoteSqlString).join(', ')})`;
  }
  throw new Error(`AI28 mobile SQL filter operator is not allowed for ${table}.${column}.`);
}

export function buildMobileStagingSql(
  tableName: string,
  parameters: Record<string, string>,
): string {
  if (!Object.hasOwn(protectedMobileTables, tableName))
    throw new Error('AI28 mobile SQL table is not allowlisted.');
  const table = tableName as ProtectedMobileTable;
  const definition = protectedMobileTables[table];
  if (!parameters.select || parameters.select === '*') {
    throw new Error(
      `AI28 mobile SQL query must explicitly select allowlisted columns for ${table}.`,
    );
  }
  const selected = parameters.select.split(',');
  if (
    selected.length === 0 ||
    selected.some((column) => !definition.columns.includes(column as never))
  ) {
    throw new Error(`AI28 mobile SQL selected column is not allowlisted for ${table}.`);
  }
  const filters = Object.entries(parameters).filter(
    ([key]) => !['select', 'order', 'limit'].includes(key),
  );
  for (const [column] of filters) {
    if (!definition.filters.includes(column as never))
      throw new Error(`AI28 mobile SQL filter column is not allowlisted for ${table}.`);
  }
  const names = new Set(filters.map(([column]) => column));
  if (!definition.scope.some((scope) => scope.every((column) => names.has(column)))) {
    throw new Error(`AI28 mobile SQL query for ${table} has no required synthetic-row scope.`);
  }
  if (
    table === 'mobile_record_adaptations' &&
    (!names.has('adapter_name') || !names.has('adapter_version'))
  ) {
    throw new Error('AI28 mobile SQL adaptation query must select one adapter version.');
  }
  const where = filters
    .map(([column, value]) => parsePostgrestFilter(table, column, value))
    .join(' and ');
  let order = '';
  if (parameters.order) {
    const match = /^(received_at|id)\.(asc|desc)$/.exec(parameters.order);
    if (!match || !definition.columns.includes(match[1] as never))
      throw new Error(`AI28 mobile SQL ordering is invalid for ${table}.`);
    order = ` order by ${match[1]} ${match[2]}`;
  }
  const limit = parameters.limit === undefined ? 500 : Number(parameters.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new Error('AI28 mobile SQL limit is out of bounds.');
  return `select ${selected.join(', ')} from public.${table} where ${where}${order} limit ${limit}`;
}

export function assertMobileStagingReadTarget(env: Record<string, string | undefined>): void {
  const sha = env.LIVE_E2E_CANDIDATE_SHA;
  const tree = env.LIVE_E2E_CANDIDATE_TREE_SHA;
  const pr = env.LIVE_E2E_PULL_REQUEST_NUMBER;
  const run = env.LIVE_E2E_DEPLOYMENT_RUN_ID;
  if (
    env.STAGING_SUPABASE_PROJECT_REF !== stagingProjectRef ||
    env.STAGING_SUPABASE_URL !== stagingProjectUrl ||
    env.LIVE_E2E_SUPABASE_URL !== stagingProjectUrl ||
    !sha ||
    !/^[a-f0-9]{40}$/i.test(sha) ||
    !tree ||
    !/^[a-f0-9]{40}$/i.test(tree) ||
    !pr ||
    !/^[1-9][0-9]{0,8}$/.test(pr) ||
    !run ||
    !/^[1-9][0-9]{0,19}$/.test(run)
  ) {
    throw new Error(
      'AI28 mobile SQL read requires the fixed staging project and candidate-bound metadata.',
    );
  }
}

export async function readMobileStagingRows<T extends object>(
  table: string,
  parameters: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<T[]> {
  assertMobileStagingReadTarget(env);
  const token = env.STAGING_SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('AI28 mobile SQL read requires the staging management token.');
  const query = buildMobileStagingSql(table, parameters);
  const response = await fetcher(
    `https://api.supabase.com/v1/projects/${stagingProjectRef}/database/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, read_only: true }),
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error(`AI28 staging SQL read failed with HTTP ${response.status}.`);
  const result: unknown = await response.json();
  if (
    !Array.isArray(result) ||
    result.some((row) => typeof row !== 'object' || row === null || Array.isArray(row))
  ) {
    throw new Error('AI28 staging SQL read returned an unexpected row shape.');
  }
  return result as T[];
}
