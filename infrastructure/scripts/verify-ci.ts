import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

type Command = {
  executable: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

function run({ executable, args, cwd, env }: Command): string {
  console.log(`\n$ ${[executable, ...args].join(' ')}`);
  return execFileSync(executable, args, {
    cwd,
    env: env ?? process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
}

function runInherited(command: Command): void {
  console.log(`\n$ ${[command.executable, ...command.args].join(' ')}`);
  execFileSync(command.executable, command.args, {
    cwd: command.cwd,
    env: command.env ?? process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
}

function pnpm(args: string[], env?: NodeJS.ProcessEnv): Command {
  return {
    executable: 'corepack',
    args: ['pnpm', ...args],
    env,
  };
}

function valueFromSupabaseStatus(status: string, name: string): string {
  try {
    const json = JSON.parse(status) as Record<string, unknown>;
    const value = json[name];
    if (typeof value === 'string' && value) return value;
  } catch {
    // Older Supabase CLI versions return shell-compatible environment lines.
  }
  const match = status.match(new RegExp(`^${name}="([^"]+)"$`, 'm'));
  if (!match?.[1]) throw new Error(`supabase status did not provide ${name}.`);
  return match[1];
}

const functionDirectories = readdirSync('supabase/functions', {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => join('supabase/functions', entry.name, 'index.ts'));
const edgeContractTests = readdirSync('supabase/functions/_shared')
  .filter((entry) => entry.endsWith('_test.ts'))
  .map((entry) => join('supabase/functions/_shared', entry));

runInherited(pnpm(['verify']));
if (process.platform === 'win32') {
  console.log(
    '\nSkipping the OpenNext Cloudflare dry-run on native Windows: OpenNext does not support this host. GitHub Actions runs pnpm cloudflare:check on Ubuntu.',
  );
} else {
  runInherited(pnpm(['cloudflare:check']));
}
run(pnpm(['exec', 'supabase', 'start']));
console.log('Local Supabase stack is ready.');
run(pnpm(['exec', 'supabase', 'db', 'reset', '--local']));
console.log('Local Supabase database reset completed.');
runInherited(pnpm(['exec', 'supabase', 'test', 'db']));
runInherited({ executable: 'deno', args: ['fmt', '--check', 'supabase/functions'] });
runInherited({
  executable: 'deno',
  args: ['lint', '--rules-exclude=no-import-prefix', 'supabase/functions'],
});
runInherited({
  executable: 'deno',
  args: ['check', ...functionDirectories],
});
runInherited({
  executable: 'deno',
  args: ['test', ...edgeContractTests],
});
runInherited({
  executable: 'python',
  args: ['-m', 'ruff', 'check', 'src', 'tests'],
  cwd: 'apps/windows-worker',
});
runInherited({
  executable: 'python',
  args: ['-m', 'pytest', '-p', 'no:cacheprovider'],
  cwd: 'apps/windows-worker',
});
runInherited(pnpm(['security']));

const status = run(pnpm(['exec', 'supabase', 'status', '-o', 'env']));
const e2eEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: valueFromSupabaseStatus(status, 'ANON_KEY'),
  E2E_JWT_SECRET: valueFromSupabaseStatus(status, 'JWT_SECRET'),
};
const playwrightInstallArgs = ['exec', 'playwright', 'install'];
if (process.platform === 'linux') playwrightInstallArgs.push('--with-deps');
playwrightInstallArgs.push('chromium', 'webkit');
runInherited(pnpm(playwrightInstallArgs));
// Keep the CI-equivalent runner explicit here. On Windows, forwarding a custom
// environment through a second package-manager shell can drop E2E_JWT_SECRET.
runInherited(pnpm(['exec', 'playwright', 'test'], e2eEnvironment));

console.log('\nLocal CI-equivalent validation passed.');
