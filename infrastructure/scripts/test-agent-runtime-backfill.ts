import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AI15_WORKFLOW_RUN_SELECT } from '../../supabase/functions/ai-execute/read-contract.ts';

const repositoryRoot = process.cwd();
const migrationName = '20261009102612_canonical_agent_conversation_handoff_contracts.sql';
const migrations = readdirSync(join(repositoryRoot, 'supabase', 'migrations'))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrationIndex = migrations.indexOf(migrationName);
if (migrationIndex < 1) throw new Error('AI-14 migration order could not be resolved.');
const previousVersion = migrations[migrationIndex - 1]?.slice(0, 14);
if (!previousVersion || !/^\d{14}$/.test(previousVersion)) {
  throw new Error('AI-14 pre-migration version is invalid.');
}

function supabase(args: string[]): void {
  process.stdout.write(`$ supabase ${args.join(' ')}\n`);
  execFileSync('corepack', ['pnpm', 'exec', 'supabase', ...args, '--workdir', repositoryRoot], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function localSupabaseCredentials(): { apiUrl: string; serviceRoleKey: string } {
  const output = execFileSync(
    'corepack',
    ['pnpm', 'exec', 'supabase', 'status', '--output', 'env', '--workdir', repositoryRoot],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    },
  );
  const values = new Map(
    output.split(/\r?\n/).flatMap((line) => {
      const match = /^(API_URL|SERVICE_ROLE_KEY)=(.*)$/.exec(line);
      return match ? [[match[1]!, match[2]!.replace(/^"|"$/g, '')] as const] : [];
    }),
  );
  const apiUrl = values.get('API_URL');
  const serviceRoleKey = values.get('SERVICE_ROLE_KEY');
  if (!apiUrl || !serviceRoleKey) {
    throw new Error('Local Supabase status did not provide the API URL and service role key.');
  }
  return { apiUrl, serviceRoleKey };
}

async function verifyAi15WorkflowRunProjection(): Promise<void> {
  const { apiUrl, serviceRoleKey } = localSupabaseCredentials();
  const query = new URLSearchParams({
    select: AI15_WORKFLOW_RUN_SELECT,
    id: 'eq.00000000-0000-0000-0000-000000000000',
    limit: '0',
  });
  const response = await fetch(`${apiUrl}/rest/v1/workflow_runs?${query}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  await response.body?.cancel();
  if (!response.ok) {
    throw new Error(
      `AI-15 workflow_runs projection failed PostgREST validation with HTTP ${response.status}.`,
    );
  }
  process.stdout.write('AI-15 workflow_runs projection passed local PostgREST validation.\n');
}

async function main(): Promise<void> {
  if (process.argv.includes('--projection-only')) {
    await verifyAi15WorkflowRunProjection();
    return;
  }

  supabase([
    'db',
    'reset',
    '--local',
    '--version',
    previousVersion,
    '--sql-paths',
    'seed.sql',
    '--sql-paths',
    'fixtures/ai14_legacy_backfill_seed.sql',
  ]);
  supabase(['migration', 'up', '--local']);
  await verifyAi15WorkflowRunProjection();
  supabase([
    'db',
    'query',
    '--local',
    '--file',
    join('supabase', 'fixtures', 'local_application_role_acl_baseline.sql'),
  ]);
  supabase(['test', 'db', '--local', join('supabase', 'tests', 'agent_runtime_backfill.sql')]);
  supabase(['test', 'db', '--local']);
  process.stdout.write('AI-14 legacy backfill and full database tests passed.\n');
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected test harness failure.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
