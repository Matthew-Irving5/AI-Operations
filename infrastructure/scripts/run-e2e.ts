import { execFileSync } from 'node:child_process';

function run(args: string[], env = process.env): string {
  return execFileSync('corepack', ['pnpm', ...args], {
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
}

function statusValue(status: string, name: string): string {
  try {
    const parsed = JSON.parse(status) as Record<string, unknown>;
    if (typeof parsed[name] === 'string' && parsed[name]) return parsed[name];
  } catch {
    // Supabase CLI also supports shell-compatible environment output.
  }
  const match = status.match(new RegExp(`^${name}="([^"]+)"$`, 'm'));
  if (!match?.[1])
    throw new Error(`supabase status did not provide ${name}. Start the local stack first.`);
  return match[1];
}

// E2E is self-contained: a previous DB test may stop local services, and an
// authenticated browser suite must never proceed against an unavailable Auth API.
run(['exec', 'supabase', 'start']);
const status = run(['exec', 'supabase', 'status', '-o', 'env']);
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: statusValue(status, 'ANON_KEY'),
  E2E_JWT_SECRET: statusValue(status, 'JWT_SECRET'),
};
Object.assign(process.env, env);
execFileSync('corepack', ['pnpm', 'exec', 'playwright', 'test'], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
