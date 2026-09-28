import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { runLocalQaPreflight } from './local-qa-preflight';

function run(args: string[], env = process.env): string {
  return execFileSync('corepack', ['pnpm', ...args], {
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
}

function sanitizedCommandError(error: unknown): string {
  if (!error || typeof error !== 'object' || !('stderr' in error)) return '';
  const stderr = (error as { stderr?: Buffer | string }).stderr;
  if (!stderr) return '';
  return String(stderr)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .slice(-2000);
}

function statusValue(status: string, name: string): string {
  try {
    const parsed = JSON.parse(status) as Record<string, unknown>;
    if (typeof parsed[name] === 'string' && parsed[name]) return parsed[name];
  } catch {
    // Supabase CLI also supports shell-compatible environment output.
  }
  const match = status.match(new RegExp(`^${name}="([^"]+)"$`, 'm'));
  if (!match?.[1]) throw new Error(`Local Supabase did not provide ${name}.`);
  return match[1];
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function localPorts(): Promise<{
  api: number;
  database: number;
  shadow: number;
  app: number;
}> {
  const used = new Set<number>();
  const next = async () => {
    const port = await freePort();
    if (used.has(port)) return next();
    used.add(port);
    return port;
  };
  const [api, database, shadow, app] = await Promise.all([next(), next(), next(), next()]);
  return { api, database, shadow, app };
}

function createIsolatedSupabaseProject(
  repositoryRoot: string,
  namespace: string,
  ports: { api: number; database: number; shadow: number },
): { temporaryRoot: string; projectDirectory: string } {
  const workdir = mkdtempSync(join(tmpdir(), `aiops-local-qa-${namespace.slice(0, 8)}-`));
  const projectDirectory = join(workdir, `supabase-${namespace.slice(0, 8)}`);
  cpSync(join(repositoryRoot, 'supabase'), projectDirectory, {
    recursive: true,
    filter: (source) =>
      basename(source) !== '.env' &&
      !source.includes(`${join('supabase', '.temp')}`) &&
      !source.includes(`${join('supabase', '.branches')}`),
  });
  const configPath = join(projectDirectory, 'config.toml');
  let config = readFileSync(configPath, 'utf8');
  config = config.replace(
    /^project_id = "[^"]+"/m,
    `project_id = "aiops-${namespace.replaceAll('-', '').slice(0, 12)}"`,
  );
  config = config.replace(/(\[api\]\s*\nenabled = true\s*\nport = )\d+/m, `$1${ports.api}`);
  config = config.replace(
    /(\[db\]\s*\nport = )\d+/m,
    `$1${ports.database}\nshadow_port = ${ports.shadow}`,
  );
  writeFileSync(configPath, config, 'utf8');
  return { temporaryRoot: workdir, projectDirectory };
}

function checkStagingAuthConfiguration(env: NodeJS.ProcessEnv): void {
  if (env.LOCAL_TEST_EMAIL && env.LOCAL_TEST_EMAIL.toLowerCase() !== 'matthewirving99@gmail.com') {
    throw new Error(
      'Local test auth uses the locked application identity configured by the product.',
    );
  }
  const enabled = env.LOCAL_TEST_AUTH_VALIDATE_STAGING;
  if (!enabled) return;
  if (!['true', '1'].includes(enabled)) {
    throw new Error('LOCAL_TEST_AUTH_VALIDATE_STAGING must be true or unset.');
  }
  if (
    !env.LOCAL_TEST_STAGING_EMAIL ||
    !env.LOCAL_TEST_STAGING_PASSWORD ||
    !env.LOCAL_TEST_STAGING_ANON_KEY
  ) {
    throw new Error(
      'Staging Auth validation needs LOCAL_TEST_STAGING_EMAIL, LOCAL_TEST_STAGING_PASSWORD and LOCAL_TEST_STAGING_ANON_KEY in the local process environment.',
    );
  }
}

function localRunnerEnvironment(additions: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const localCredentialNames = new Set([
    'E2E_JWT_SECRET',
    'LOCAL_TEST_PASSWORD',
    'LOCAL_TEST_STAGING_ANON_KEY',
    'LOCAL_TEST_STAGING_PASSWORD',
  ]);
  for (const name of Object.keys(env)) {
    if (
      !localCredentialNames.has(name) &&
      /(?:SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|SERVICE_ROLE|PRIVATE_KEY|ACCESS_KEY|API_KEY)/i.test(
        name,
      )
    ) {
      delete env[name];
    }
  }
  return { ...env, ...additions };
}

async function waitForLocalSupabase(url: string, anonKey: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: anonKey },
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // Retry the local health endpoint for up to ten seconds.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    'Local Supabase Auth did not become healthy; check Docker and the local port range.',
  );
}

async function main(): Promise<void> {
  runLocalQaPreflight();
  checkStagingAuthConfiguration(process.env);

  const repositoryRoot = process.cwd();
  const namespace = randomUUID();
  const ports = await localPorts();
  const supabase = createIsolatedSupabaseProject(repositoryRoot, namespace, ports);
  const supabaseWorkdir = supabase.projectDirectory;
  const appBuildDir = `.next-local-qa-${namespace}`;
  let stackMayHaveStarted = false;

  const cleanup = () => {
    if (stackMayHaveStarted) {
      try {
        run(['exec', 'supabase', 'stop', '--workdir', supabaseWorkdir, '--no-backup']);
      } catch {
        process.stderr.write(
          'Local Supabase cleanup did not finish; inspect Docker for this QA session.\n',
        );
      }
    }
    rmSync(supabase.temporaryRoot, { recursive: true, force: true });
    rmSync(join(repositoryRoot, 'apps', 'web', appBuildDir), { recursive: true, force: true });
  };

  try {
    try {
      stackMayHaveStarted = true;
      run([
        'exec',
        'supabase',
        'start',
        '--workdir',
        supabaseWorkdir,
        '--exclude',
        'studio,mailpit,logflare,supavisor',
      ]);
    } catch (error) {
      throw new Error(
        `Local Supabase could not start. Confirm Docker Desktop is ready and free local ports are available.${sanitizedCommandError(error) ? `\n${sanitizedCommandError(error)}` : ''}`,
      );
    }

    const status = run(['exec', 'supabase', 'status', '-o', 'env', '--workdir', supabaseWorkdir]);
    const anonKey = statusValue(status, 'ANON_KEY');
    const jwtSecret = statusValue(status, 'JWT_SECRET');
    const supabaseUrl = `http://127.0.0.1:${ports.api}`;
    await waitForLocalSupabase(supabaseUrl, anonKey);

    const env = localRunnerEnvironment({
      NODE_ENV: 'development',
      APP_ENV: 'local',
      LOCAL_TEST_AUTH: 'true',
      LOCAL_TEST_APP_ORIGIN: `http://127.0.0.1:${ports.app}`,
      LOCAL_TEST_EMAIL: process.env.LOCAL_TEST_EMAIL?.trim() || 'matthewirving99@gmail.com',
      LOCAL_TEST_PASSWORD: process.env.LOCAL_TEST_PASSWORD || randomBytes(32).toString('base64url'),
      PUBLIC_APP_ORIGIN: `http://127.0.0.1:${ports.app}`,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      E2E_JWT_SECRET: jwtSecret,
      E2E_NAMESPACE: namespace,
      E2E_PORT: String(ports.app),
      LOCAL_QA_DIST_DIR: appBuildDir,
    });
    execFileSync('corepack', ['pnpm', 'exec', 'playwright', 'test'], {
      env,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
  } finally {
    cleanup();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Local QA failed.'}\n`);
  process.exitCode = 1;
});
