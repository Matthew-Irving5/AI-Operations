import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';

type CommandCheck = { command: string; args: string[]; label: string; recover: string };

const checks: CommandCheck[] = [
  {
    command: 'docker',
    args: ['info', '--format', '{{.ServerVersion}}'],
    label: 'Docker engine is unavailable',
    recover: 'Start Docker Desktop and wait until its engine is ready.',
  },
  {
    command: 'corepack',
    args: ['pnpm', 'exec', 'supabase', '--version'],
    label: 'Supabase CLI is unavailable',
    recover: 'Run corepack pnpm install --frozen-lockfile from the repository root.',
  },
];

function commandWorks(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export function collectLocalQaPrerequisiteIssues(): string[] {
  const issues: string[] = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 18)) {
    issues.push('Node.js 22.18 or newer is required; install the repository-pinned runtime.');
  }
  if (!commandWorks('corepack', ['pnpm', '--version'])) {
    issues.push('pnpm is unavailable; enable Corepack and retry.');
  }
  for (const check of checks) {
    if (!commandWorks(check.command, check.args)) {
      issues.push(`${check.label}. ${check.recover}`);
    }
  }
  for (const [name, executablePath] of [
    ['Chromium', chromium.executablePath()],
    ['WebKit', webkit.executablePath()],
  ]) {
    if (!existsSync(executablePath)) {
      issues.push(
        `${name} browser is not installed; run corepack pnpm exec playwright install chromium webkit.`,
      );
    }
  }
  const stagingValidation = process.env.LOCAL_TEST_AUTH_VALIDATE_STAGING;
  if (stagingValidation && !['true', '1'].includes(stagingValidation)) {
    issues.push('LOCAL_TEST_AUTH_VALIDATE_STAGING must be true or unset.');
  }
  if (
    stagingValidation &&
    (!process.env.LOCAL_TEST_STAGING_EMAIL ||
      !process.env.LOCAL_TEST_STAGING_PASSWORD ||
      !process.env.LOCAL_TEST_STAGING_ANON_KEY)
  ) {
    issues.push(
      'Staging Auth validation needs LOCAL_TEST_STAGING_EMAIL, LOCAL_TEST_STAGING_PASSWORD and LOCAL_TEST_STAGING_ANON_KEY in the local process environment.',
    );
  }
  if (process.env.APP_ENV && process.env.APP_ENV !== 'local') {
    issues.push('Local QA cannot run while APP_ENV identifies a hosted environment.');
  }
  return issues;
}

export function runLocalQaPreflight(): void {
  const issues = collectLocalQaPrerequisiteIssues();
  if (issues.length) {
    throw new Error(
      `Local QA preflight failed (${issues.length} prerequisite${issues.length === 1 ? '' : 's'}):\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
    );
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/local-qa-preflight.ts')) {
  try {
    runLocalQaPreflight();
    process.stdout.write('Local QA prerequisites passed.\n');
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Local QA preflight failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
