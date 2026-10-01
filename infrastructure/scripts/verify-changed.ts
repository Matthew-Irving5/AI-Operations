import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { localFunctionDirectories } from './edge-function-inventory.js';

type ImpactPlan = {
  files: string[];
  profiles: string[];
  packages: string[];
  fullCore: boolean;
  browser: boolean;
  db: boolean;
  edge: boolean;
  worker: boolean;
  security: boolean;
};

function run(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
): void {
  process.stdout.write(`\n$ ${[command, ...args].join(' ')}\n`);
  execFileSync(command, args, {
    cwd: options.cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: options.timeout ?? 300_000,
  });
}

function output(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function changedFiles(base: string): string[] {
  const files = new Set<string>();
  const add = (text: string) => {
    for (const file of text.split(/\r?\n/).filter(Boolean)) files.add(file);
  };
  try {
    add(output('git', ['diff', '--name-only', `${base}...HEAD`]));
  } catch {
    try {
      add(output('git', ['diff', '--name-only', 'HEAD^', 'HEAD']));
    } catch {
      // A repository with no parent commit simply has no committed comparison yet.
    }
  }
  try {
    add(output('git', ['diff', '--name-only']));
    add(output('git', ['diff', '--name-only', '--cached']));
    add(output('git', ['ls-files', '--others', '--exclude-standard']));
  } catch {
    // Preserve any committed comparison gathered above.
  }
  return [...files].sort();
}
export function buildImpactPlan(files: string[]): ImpactPlan {
  const normalized = files.map((file) => file.replaceAll('\\', '/'));
  const rootRisk = new Set([
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
    'tsconfig.base.json',
  ]);
  const routerRisk = normalized.some(
    (file) =>
      file === 'infrastructure/scripts/verify-changed.ts' ||
      file === 'infrastructure/scripts/run-e2e.ts' ||
      file === 'playwright.config.ts' ||
      file === '.github/workflows/ci.yml',
  );
  const fullCore = normalized.some((file) => rootRisk.has(file)) || routerRisk;
  const web = normalized.some(
    (file) => file.startsWith('apps/web/') || file.startsWith('packages/ui/'),
  );
  const db = normalized.some(
    (file) =>
      file.startsWith('supabase/migrations/') ||
      file.startsWith('supabase/tests/') ||
      file.startsWith('packages/db/'),
  );
  const edge = normalized.some((file) => file.startsWith('supabase/functions/'));
  const worker = normalized.some((file) => file.startsWith('apps/windows-worker/'));
  const browser = web || routerRisk || normalized.some((file) => file.startsWith('tests/e2e/'));
  const security = normalized.some(
    (file) =>
      file === 'package.json' ||
      file === 'pnpm-lock.yaml' ||
      /(?:auth|security|credential|rls|permission|secret)/i.test(file),
  );
  const packageDirs = new Set<string>();
  for (const file of normalized) {
    const match = file.match(/^packages\/([^/]+)\//);
    if (match?.[1]) packageDirs.add(match[1]);
  }
  const profiles = [
    web && 'frontend',
    db && 'db',
    edge && 'edge',
    worker && 'windows-worker',
    browser && 'browser',
    security && 'security',
    fullCore && 'full-core',
  ].filter((value): value is string => Boolean(value));
  if (!profiles.length) profiles.push('static');
  return {
    files: normalized,
    profiles,
    packages: [...packageDirs].sort(),
    fullCore,
    browser,
    db,
    edge,
    worker,
    security,
  };
}

export function prettierFiles(files: string[]): string[] {
  return files.filter(
    (file) =>
      !file.startsWith('supabase/functions/') &&
      /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css)$/i.test(file),
  );
}

function infrastructureTests(files: string[]): string[] {
  const tests = new Set<string>();
  for (const file of files) {
    if (!file.startsWith('infrastructure/scripts/') || !file.endsWith('.ts')) continue;
    if (file.endsWith('.test.ts')) {
      tests.add(file);
      continue;
    }
    const candidate = file.replace(/\.ts$/, '.test.ts');
    if (existsSync(candidate)) tests.add(candidate);
  }
  return [...tests].sort();
}

function packageName(directory: string): string | null {
  const file = join('packages', directory, 'package.json');
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { name?: string };
  return parsed.name ?? null;
}

function ensureSupabase(): void {
  try {
    output('corepack', ['pnpm', 'exec', 'supabase', 'status']);
  } catch {
    run('corepack', [
      'pnpm',
      'exec',
      'supabase',
      'start',
      '--exclude',
      'studio,mailpit,logflare,supavisor,vector',
    ]);
  }
}

function runCore(plan: ImpactPlan): void {
  const formatted = prettierFiles(plan.files);
  if (formatted.length) run('corepack', ['pnpm', 'exec', 'prettier', '--check', ...formatted]);
  if (plan.fullCore) {
    run('corepack', ['pnpm', 'verify']);
    return;
  }
  const infraTests = infrastructureTests(plan.files);
  if (infraTests.length) run('corepack', ['pnpm', 'exec', 'tsx', '--test', ...infraTests]);
  if (plan.profiles.includes('frontend')) {
    for (const script of ['lint', 'typecheck', 'test', 'build']) {
      run('corepack', ['pnpm', '--filter', '@ai-operations/web', script]);
    }
  }
  for (const directory of plan.packages) {
    if (directory === 'ui' && plan.profiles.includes('frontend')) continue;
    const name = packageName(directory);
    if (!name) continue;
    for (const script of ['lint', 'typecheck', 'test']) {
      run('corepack', ['pnpm', '--filter', name, '--if-present', script]);
    }
  }
  if (plan.worker) {
    run('python', ['-m', 'ruff', 'check', 'src', 'tests'], { cwd: 'apps/windows-worker' });
  }
}

export function playwrightInstallArgs(platform = process.platform): string[] {
  const args = ['pnpm', 'exec', 'playwright', 'install'];
  if (platform === 'linux') args.push('--with-deps');
  args.push('chromium');
  return args;
}

function runBoundary(plan: ImpactPlan): void {
  if (plan.db) {
    ensureSupabase();
    run('corepack', ['pnpm', 'test:db']);
  }
  if (plan.edge) {
    const indexes = localFunctionDirectories().map((name) =>
      join('supabase/functions', name, 'index.ts'),
    );
    const tests = readdirSync('supabase/functions/_shared')
      .filter((entry) => entry.endsWith('_test.ts'))
      .map((entry) => join('supabase/functions/_shared', entry));
    run('deno', ['fmt', '--check', 'supabase/functions']);
    run('deno', ['lint', '--rules-exclude=no-import-prefix', 'supabase/functions']);
    run('deno', ['check', '--config', 'supabase/functions/deno.json', ...indexes]);
    run('deno', ['test', '--no-config', ...tests]);
  }
  if (plan.worker) {
    run('python', ['-m', 'pytest', '-p', 'no:cacheprovider'], { cwd: 'apps/windows-worker' });
  }
  if (plan.browser) {
    if (!existsSync(chromium.executablePath())) {
      run('corepack', playwrightInstallArgs());
    }
    run(
      'node',
      [
        '--env-file-if-exists=.env',
        '--import',
        'tsx',
        'infrastructure/scripts/run-e2e.ts',
        '--project=chromium',
      ],
      { timeout: 600_000 },
    );
  }
  if (plan.security) run('corepack', ['pnpm', 'security']);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function main(): void {
  const base =
    argValue('--base') ??
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
  const lane = argValue('--lane') ?? 'all';
  const plan = buildImpactPlan(changedFiles(base));
  process.stdout.write(
    `Impact plan: ${plan.profiles.join(', ')}\nChanged files: ${plan.files.length}\n`,
  );
  if (process.argv.includes('--plan')) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  if (!plan.files.length) {
    process.stdout.write('No changed files; nothing to verify.\n');
    return;
  }
  if (lane === 'all' || lane === 'core') runCore(plan);
  if (lane === 'all' || lane === 'boundary') runBoundary(plan);
  process.stdout.write(`Changed-surface verification passed (${lane}).\n`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/verify-changed.ts')) main();
