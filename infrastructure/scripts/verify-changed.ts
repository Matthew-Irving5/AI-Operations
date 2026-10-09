import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { localFunctionDirectories } from './edge-function-inventory.js';
import { sanitize } from './qa-debug.js';

export type CheckStatus = 'passed' | 'failed' | 'skipped';

export type CheckTask = {
  name: string;
  command: string;
  dependencies?: string[];
  execute: () => void;
};

export type CheckResult = {
  name: string;
  command: string;
  status: CheckStatus;
  durationMs: number;
  detail?: string;
};

export function runChecks(
  checks: CheckTask[],
  options: {
    execute?: (check: CheckTask) => void;
    now?: () => number;
    write?: (text: string) => void;
  } = {},
): CheckResult[] {
  const execute = options.execute ?? ((check: CheckTask) => check.execute());
  const now = options.now ?? Date.now;
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const resultByName = new Map<string, CheckResult>();

  for (const check of checks) {
    if (resultByName.has(check.name)) throw new Error(`Duplicate check name: ${check.name}`);
    const missingDependency = (check.dependencies ?? []).find((name) => !resultByName.has(name));
    if (missingDependency) {
      throw new Error(
        `Check ${check.name} depends on unknown or later check ${missingDependency}.`,
      );
    }

    const failedDependency = (check.dependencies ?? []).find(
      (name) => resultByName.get(name)?.status !== 'passed',
    );
    if (failedDependency) {
      const prerequisite = resultByName.get(failedDependency);
      const detail = `Skipped because prerequisite "${failedDependency}" ${prerequisite?.status ?? 'is missing'}.`;
      resultByName.set(check.name, {
        name: check.name,
        command: check.command,
        status: 'skipped',
        durationMs: 0,
        detail,
      });
      continue;
    }

    const started = now();
    try {
      execute(check);
      resultByName.set(check.name, {
        name: check.name,
        command: check.command,
        status: 'passed',
        durationMs: Math.max(0, now() - started),
      });
    } catch (error) {
      resultByName.set(check.name, {
        name: check.name,
        command: check.command,
        status: 'failed',
        durationMs: Math.max(0, now() - started),
        detail: sanitize(error instanceof Error ? error.message : String(error)),
      });
    }
  }

  const results = [...resultByName.values()];
  const counts = results.reduce(
    (total, result) => ({ ...total, [result.status]: total[result.status] + 1 }),
    { passed: 0, failed: 0, skipped: 0 },
  );
  write(
    `\nCheck summary: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped.\n`,
  );
  for (const result of results) {
    const duration = result.durationMs ? ` ${result.durationMs}ms` : '';
    const detail = result.detail ? ` — ${result.detail}` : '';
    write(
      `${result.status.toUpperCase()} ${result.name}${duration}${detail}\n  $ ${sanitize(result.command)}\n`,
    );
  }
  return results;
}

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

export function shellSafeArguments(args: string[], platform = process.platform): string[] {
  if (platform !== 'win32') return args;
  return args.map((argument) =>
    /[\s()&|<>^]/.test(argument) ? `"${argument.replaceAll('"', '""')}"` : argument,
  );
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
): void {
  process.stdout.write(`\n$ ${[command, ...args].join(' ')}\n`);
  execFileSync(command, shellSafeArguments(args), {
    cwd: options.cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: options.timeout ?? 300_000,
  });
}

function output(command: string, args: string[]): string {
  return execFileSync(command, shellSafeArguments(args), {
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

function runCore(plan: ImpactPlan): CheckResult[] {
  const checks: CheckTask[] = [];
  const add = (name: string, command: string, args: string[], options?: { cwd?: string }) => {
    checks.push({
      name,
      command: [command, ...args].join(' '),
      execute: () => run(command, args, options),
    });
  };

  const formatted = prettierFiles(plan.files);
  if (formatted.length && !plan.fullCore) {
    add('Changed-file formatting', 'corepack', [
      'pnpm',
      'exec',
      'prettier',
      '--check',
      ...formatted,
    ]);
  }
  if (plan.fullCore) {
    add('Workspace formatting', 'corepack', ['pnpm', 'format:check']);
    add('Workspace lint', 'corepack', ['pnpm', '-r', '--if-present', '--no-bail', 'run', 'lint']);
    add('Workspace typecheck', 'corepack', [
      'pnpm',
      '-r',
      '--if-present',
      '--no-bail',
      'run',
      'typecheck',
    ]);
    add('Workspace package tests', 'corepack', [
      'pnpm',
      '-r',
      '--if-present',
      '--no-bail',
      'run',
      'test',
    ]);
    const infraTests = readdirSync('infrastructure/scripts')
      .filter((entry) => entry.endsWith('.test.ts'))
      .map((entry) => join('infrastructure/scripts', entry));
    if (infraTests.length) {
      add('Infrastructure tests', 'corepack', ['pnpm', 'exec', 'tsx', '--test', ...infraTests]);
    }
    add('Web build', 'corepack', ['pnpm', '--filter', '@ai-operations/web', 'build']);
    return runChecks(checks);
  }
  const infraTests = infrastructureTests(plan.files);
  if (infraTests.length) {
    add('Affected infrastructure tests', 'corepack', [
      'pnpm',
      'exec',
      'tsx',
      '--test',
      ...infraTests,
    ]);
  }
  if (plan.profiles.includes('frontend')) {
    for (const script of ['lint', 'typecheck', 'test', 'build']) {
      add(`Web ${script}`, 'corepack', ['pnpm', '--filter', '@ai-operations/web', script]);
    }
  }
  for (const directory of plan.packages) {
    if (directory === 'ui' && plan.profiles.includes('frontend')) continue;
    const name = packageName(directory);
    if (!name) continue;
    for (const script of ['lint', 'typecheck', 'test']) {
      add(`${name} ${script}`, 'corepack', ['pnpm', '--filter', name, '--if-present', script]);
    }
  }
  if (plan.worker && !process.env.CI) {
    add('Windows worker lint', 'python', ['-m', 'ruff', 'check', 'src', 'tests'], {
      cwd: 'apps/windows-worker',
    });
  }
  return runChecks(checks);
}

export function playwrightInstallArgs(platform = process.platform): string[] {
  const args = ['pnpm', 'exec', 'playwright', 'install'];
  if (platform === 'linux') args.push('--with-deps');
  args.push('chromium');
  return args;
}

function runBoundary(plan: ImpactPlan): CheckResult[] {
  const checks: CheckTask[] = [];
  const add = (
    name: string,
    command: string,
    args: string[],
    options?: { cwd?: string; timeout?: number },
    dependencies?: string[],
  ) => {
    checks.push({
      name,
      command: [command, ...args].join(' '),
      dependencies,
      execute: () => run(command, args, options),
    });
  };

  if (plan.db) {
    checks.push({
      name: 'Local Supabase readiness',
      command: 'corepack pnpm exec supabase status (start if needed)',
      execute: ensureSupabase,
    });
    add('Database/backfill tests', 'corepack', ['pnpm', 'test:db'], undefined, [
      'Local Supabase readiness',
    ]);
  }
  if (plan.edge) {
    const indexes = localFunctionDirectories().map((name) =>
      join('supabase/functions', name, 'index.ts'),
    );
    const tests = readdirSync('supabase/functions/_shared')
      .filter((entry) => entry.endsWith('_test.ts'))
      .map((entry) => join('supabase/functions/_shared', entry));
    add('Edge formatting', 'deno', ['fmt', '--check', 'supabase/functions']);
    add('Edge lint', 'deno', ['lint', '--rules-exclude=no-import-prefix', 'supabase/functions']);
    add('Edge typecheck', 'deno', [
      'check',
      '--config',
      'supabase/functions/deno.json',
      ...indexes,
    ]);
    add('Edge contract tests', 'deno', ['test', '--no-config', ...tests]);
  }
  if (plan.worker && !process.env.CI) {
    add('Windows worker tests', 'python', ['-m', 'pytest', '-p', 'no:cacheprovider'], {
      cwd: 'apps/windows-worker',
    });
  }
  if (plan.browser) {
    checks.push({
      name: 'Chromium browser setup',
      command: 'corepack pnpm exec playwright install chromium',
      execute: () => {
        if (!existsSync(chromium.executablePath())) run('corepack', playwrightInstallArgs());
      },
    });
    add(
      'Local Chromium E2E',
      'node',
      [
        '--env-file-if-exists=.env',
        '--import',
        'tsx',
        'infrastructure/scripts/run-e2e.ts',
        '--project=chromium',
      ],
      { timeout: 600_000 },
      ['Chromium browser setup'],
    );
  }
  if (plan.security) add('Dependency audit', 'corepack', ['pnpm', 'audit', '--audit-level=high']);
  return runChecks(checks);
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
  const results: CheckResult[] = [];
  if (lane === 'all' || lane === 'core') results.push(...runCore(plan));
  if (lane === 'all' || lane === 'boundary') results.push(...runBoundary(plan));
  const failures = results.filter((result) => result.status === 'failed');
  if (failures.length) {
    process.stderr.write(
      `Changed-surface verification failed: ${failures.length} required check(s) failed.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Changed-surface verification passed (${lane}).\n`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/verify-changed.ts')) main();
