import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';

type Result = { label: string; ok: boolean; detail: string; ms: number };

const argv = new Set(process.argv.slice(2));
const fix = argv.has('--fix');
const ci = argv.has('--ci') || process.env.CI === 'true';
const warm = !argv.has('--no-warm');

function run(command: string, args: string[], timeout = 15_000): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  }).trim();
}

function works(command: string, args: string[], timeout = 10_000): boolean {
  try {
    run(command, args, timeout);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

function startDockerDesktop(): void {
  try {
    run('docker', ['desktop', 'start'], 20_000);
    return;
  } catch {
    // Fall through to the Windows executable when the Desktop CLI is unavailable.
  }
  if (process.platform !== 'win32') return;
  const executable = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
  if (!existsSync(executable)) return;
  const child = spawn(executable, [], { detached: true, stdio: 'ignore' });
  child.unref();
}

type SupabaseImageCache = { cliVersion: string; images: string[] };
const imageCachePath = '.qa/cache/supabase-images.json';

function installedSupabaseImages(): string[] {
  return run('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}'])
    .split(/\r?\n/)
    .filter((image) => /^(?:public\.ecr\.aws\/supabase\/|supabase\/)/.test(image))
    .sort();
}

function cachedSupabaseImages(cliVersion: string): string[] | null {
  if (!existsSync(imageCachePath)) return null;
  try {
    const cache = JSON.parse(readFileSync(imageCachePath, 'utf8')) as SupabaseImageCache;
    if (cache.cliVersion !== cliVersion || cache.images.length < 5) return null;
    if (!cache.images.every((image) => works('docker', ['image', 'inspect', image]))) return null;
    return cache.images;
  } catch {
    return null;
  }
}

function writeSupabaseImageCache(cliVersion: string, images: string[]): void {
  mkdirSync('.qa/cache', { recursive: true });
  writeFileSync(imageCachePath, `${JSON.stringify({ cliVersion, images }, null, 2)}\n`, 'utf8');
}
export function isSupportedNodeVersion(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 18);
}

async function check(label: string, fn: () => Promise<string> | string): Promise<Result> {
  const started = Date.now();
  try {
    return { label, ok: true, detail: await fn(), ms: Date.now() - started };
  } catch (error) {
    return {
      label,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
  }
}

async function main(): Promise<void> {
  const results: Result[] = [];
  results.push(
    await check('Node.js', () => {
      if (!isSupportedNodeVersion(process.versions.node)) {
        throw new Error(`need >=22.18; found ${process.versions.node}`);
      }
      return process.versions.node;
    }),
  );
  results.push(await check('pnpm/Corepack', () => run('corepack', ['pnpm', '--version'])));
  results.push(
    await check('GitHub/repository', () => {
      const repo = JSON.parse(run('gh', ['repo', 'view', '--json', 'nameWithOwner'])) as {
        nameWithOwner?: string;
      };
      if (repo.nameWithOwner !== 'Matthew-Irving5/AI-Operations') {
        throw new Error(`wrong repository: ${repo.nameWithOwner ?? 'unknown'}`);
      }
      return repo.nameWithOwner;
    }),
  );
  results.push(
    await check('Docker engine', async () => {
      if (!works('docker', ['info', '--format', '{{.ServerVersion}}'])) {
        if (!fix || ci) throw new Error('not running; rerun pnpm qa:doctor --fix');
        startDockerDesktop();
        const ready = await waitUntil(
          () => works('docker', ['info', '--format', '{{.ServerVersion}}']),
          60_000,
        );
        if (!ready) throw new Error('Docker Desktop did not become ready within 60s');
      }
      return run('docker', ['info', '--format', '{{.ServerVersion}}']);
    }),
  );
  results.push(
    await check('Supabase CLI', () => run('corepack', ['pnpm', 'exec', 'supabase', '--version'])),
  );
  if (warm) {
    results.push(
      await check('Supabase Docker images', () => {
        const cliVersion = run('corepack', ['pnpm', 'exec', 'supabase', '--version']);
        const cached = cachedSupabaseImages(cliVersion);
        if (cached) return `${cached.length} cached images verified`;
        if (!fix) throw new Error('image cache is not verified; rerun pnpm qa:doctor --fix');
        try {
          run('corepack', ['pnpm', 'exec', 'supabase', 'stop', '--no-backup'], 60_000);
        } catch {
          // Best-effort cleanup before a one-time image warm-up.
        }
        try {
          run(
            'corepack',
            [
              'pnpm',
              'exec',
              'supabase',
              'start',
              '--exclude',
              'studio,mailpit,logflare,supavisor,vector',
            ],
            300_000,
          );
          if (!works('corepack', ['pnpm', 'exec', 'supabase', 'status'])) {
            throw new Error('Supabase image warm-up completed but the stack is unhealthy');
          }
          const images = installedSupabaseImages();
          if (images.length < 5) {
            throw new Error('Supabase image warm-up did not expose the expected image set');
          }
          writeSupabaseImageCache(cliVersion, images);
          return `${images.length} images verified and cached`;
        } finally {
          try {
            run('corepack', ['pnpm', 'exec', 'supabase', 'stop', '--no-backup'], 60_000);
          } catch {
            // Never leave a persistent default stack that can interfere with isolated QA.
          }
        }
      }),
    );
  }
  results.push(
    await check('Playwright browsers', () => {
      const browserPaths: Array<[string, string]> = [
        ['Chromium', chromium.executablePath()],
        ['WebKit', webkit.executablePath()],
      ];
      if (browserPaths.some(([, executable]) => !existsSync(executable)) && fix) {
        run('corepack', ['pnpm', 'exec', 'playwright', 'install', 'chromium', 'webkit'], 180_000);
      }
      const missing = browserPaths
        .filter(([, executable]) => !existsSync(executable))
        .map(([name]) => name);
      if (missing.length) {
        throw new Error(`${missing.join(', ')} missing; rerun pnpm qa:doctor --fix`);
      }
      return 'Chromium + WebKit available';
    }),
  );
  results.push(
    await check('Deno', () => {
      if (!works('deno', ['--version'])) {
        throw new Error('deno unavailable; install the repository-supported Deno runtime');
      }
      return run('deno', ['--version']).split(/\r?\n/, 1)[0] ?? 'available';
    }),
  );
  results.push(
    await check('Python', () => {
      if (!works('python', ['--version'])) throw new Error('python unavailable');
      return run('python', ['--version']);
    }),
  );

  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    const status = result.ok ? 'PASS' : 'FAIL';
    process.stdout.write(
      `${status.padEnd(4)} ${result.label.padEnd(28)} ${String(result.ms).padStart(5)}ms  ${result.detail}\n`,
    );
  }
  if (failed.length) {
    throw new Error(
      `QA doctor failed ${failed.length} check${failed.length === 1 ? '' : 's'}. Fix the first failure before feature work.`,
    );
  }
  process.stdout.write('QA doctor green. Feature work may start.\n');
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/qa-doctor.ts')) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
