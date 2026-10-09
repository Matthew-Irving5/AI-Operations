import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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
supabase(['test', 'db', '--local', join('supabase', 'tests', 'agent_runtime_backfill.sql')]);
supabase(['test', 'db', '--local']);
process.stdout.write('AI-14 legacy backfill and full database tests passed.\n');
