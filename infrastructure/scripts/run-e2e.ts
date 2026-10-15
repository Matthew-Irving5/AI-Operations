import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { requiredBrowsersFromPlaywrightArgs, runLocalQaPreflight } from './local-qa-preflight';
import { configureLocalAuthCallback } from './local-auth-config';
import { copyLocalSupabaseWorkspaceFiles } from './qa-workspace-dependencies';

function run(args: string[], env = process.env, timeoutMs = 120_000): string {
  return execFileSync('corepack', ['pnpm', ...args], {
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
    timeout: timeoutMs,
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

function cleanupDockerProject(projectId: string): void {
  const filter = `label=com.supabase.cli.project=${projectId}`;
  const remove = (listArgs: string[], removeArgs: string[]) => {
    try {
      const ids = execFileSync('docker', listArgs, {
        encoding: 'utf8',
        shell: process.platform === 'win32',
      })
        .split(/\r?\n/)
        .filter(Boolean);
      if (ids.length) {
        execFileSync('docker', [...removeArgs, ...ids], {
          encoding: 'utf8',
          shell: process.platform === 'win32',
          stdio: 'ignore',
          timeout: 30_000,
        });
      }
    } catch {
      // The exact-session fallback is best effort and never touches unrelated Docker resources.
    }
  };
  remove(['ps', '-aq', '--filter', filter], ['rm', '-f']);
  remove(['volume', 'ls', '-q', '--filter', filter], ['volume', 'rm', '-f']);
  remove(['network', 'ls', '-q', '--filter', filter], ['network', 'rm']);
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

function localAuthSigningKeys(projectId: string): string {
  const names = execFileSync(
    'docker',
    ['ps', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.Names}}'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  )
    .split(/\r?\n/)
    .filter((name) => name.includes('_auth_'));
  if (names.length !== 1) throw new Error('Isolated local Auth container was not found uniquely.');
  const inspection = execFileSync('docker', ['inspect', names[0]], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const container = JSON.parse(inspection) as Array<{ Config?: { Env?: string[] } }>;
  const value = container[0]?.Config?.Env?.find((entry) => entry.startsWith('GOTRUE_JWT_KEYS='));
  if (!value) throw new Error('Isolated local Auth signing keys were unavailable.');
  const keys = JSON.parse(value.slice('GOTRUE_JWT_KEYS='.length)) as Array<{
    alg?: string;
    kid?: string;
    d?: string;
  }>;
  if (!keys.some((key) => key.alg === 'ES256' && key.kid && key.d)) {
    throw new Error('Isolated local Auth ES256 private signing key was unavailable.');
  }
  return value.slice('GOTRUE_JWT_KEYS='.length);
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
  ports: { api: number; database: number; shadow: number; app: number },
  localTestPassword: string,
): { temporaryRoot: string; projectDirectory: string } {
  const workdir = mkdtempSync(join(tmpdir(), `aiops-local-qa-${namespace.slice(0, 8)}-`));
  const projectDirectory = join(workdir, 'supabase');
  cpSync(join(repositoryRoot, 'supabase'), projectDirectory, {
    recursive: true,
    filter: (source) =>
      basename(source) !== '.env' &&
      basename(source) !== 'node_modules' &&
      !source.includes(`${join('supabase', '.temp')}`) &&
      !source.includes(`${join('supabase', '.branches')}`),
  });
  copyLocalSupabaseWorkspaceFiles(repositoryRoot, workdir);
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
  config = configureLocalAuthCallback(config, ports.app);
  if (!/^\[db\.seed\]/m.test(config)) {
    config += '\n[db.seed]\nsql_paths = ["./seed.sql"]\n';
  }
  writeFileSync(configPath, config, 'utf8');
  const seedPath = join(projectDirectory, 'seed.sql');
  const seed = readFileSync(seedPath, 'utf8');
  writeFileSync(
    seedPath,
    seed.replace(
      "crypt('synthetic-only', gen_salt('bf'))",
      `crypt('${localTestPassword}', gen_salt('bf'))`,
    ),
    'utf8',
  );
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
    'LOCAL_TEST_AUTH_SIGNING_KEYS',
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
  let lastResult = 'no response';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: anonKey },
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
      lastResult = `HTTP ${response.status}`;
    } catch {
      lastResult = 'connection failed';
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Local Supabase Auth did not become healthy at ${url} (${lastResult}); check Docker and the local port range.`,
  );
}

async function main(): Promise<void> {
  const playwrightArgs = process.argv.slice(2);
  if (playwrightArgs[0] === '--') playwrightArgs.shift();
  runLocalQaPreflight(requiredBrowsersFromPlaywrightArgs(playwrightArgs));
  checkStagingAuthConfiguration(process.env);

  const repositoryRoot = process.cwd();
  const namespace = randomUUID();
  const projectId = `aiops-${namespace.replaceAll('-', '').slice(0, 12)}`;
  const localTestPassword = randomBytes(32).toString('base64url');
  const ports = await localPorts();
  const supabase = createIsolatedSupabaseProject(
    repositoryRoot,
    namespace,
    ports,
    localTestPassword,
  );
  const supabaseWorkdir = supabase.temporaryRoot;
  const appBuildDir = `.next-local-qa-${namespace}`;
  const preserveFailedStack = process.env.LOCAL_QA_KEEP_TEMP === 'true';
  let stackMayHaveStarted = false;
  let testsPassed = false;

  const cleanup = () => {
    if (preserveFailedStack && !testsPassed) {
      process.stderr.write(`Local QA debug stack preserved at ${supabaseWorkdir}\n`);
      return;
    }
    if (stackMayHaveStarted) {
      try {
        run(
          ['exec', 'supabase', 'stop', '--workdir', supabaseWorkdir, '--no-backup'],
          process.env,
          60_000,
        );
      } catch {
        cleanupDockerProject(projectId);
        process.stderr.write(
          'Local Supabase CLI cleanup failed; exact-session Docker cleanup was attempted.\n',
        );
      }
    }
    rmSync(supabase.temporaryRoot, { recursive: true, force: true });
    rmSync(join(repositoryRoot, 'apps', 'web', appBuildDir), { recursive: true, force: true });
  };

  try {
    try {
      stackMayHaveStarted = true;
      process.stdout.write(`[qa:local] ${projectId}: starting isolated Supabase (max 120s).\n`);
      run(
        [
          'exec',
          'supabase',
          'start',
          '--workdir',
          supabaseWorkdir,
          '--exclude',
          'studio,mailpit,logflare,supavisor,vector',
        ],
        process.env,
        120_000,
      );
      process.stdout.write(`[qa:local] ${projectId}: isolated Supabase started.\n`);
    } catch (error) {
      throw new Error(
        `Local Supabase could not start within 120s or failed early. Confirm Docker Desktop is ready and pnpm qa:doctor --fix is green.${sanitizedCommandError(error) ? `\n${sanitizedCommandError(error)}` : ''}`,
      );
    }

    const status = run(['exec', 'supabase', 'status', '-o', 'env', '--workdir', supabaseWorkdir]);
    const anonKey = statusValue(status, 'ANON_KEY');
    const jwtSecret = statusValue(status, 'JWT_SECRET');
    const signingKeys = localAuthSigningKeys(projectId);
    const supabaseUrl = statusValue(status, 'API_URL');
    await waitForLocalSupabase(supabaseUrl, anonKey);

    const env = localRunnerEnvironment({
      NODE_ENV: 'development',
      APP_ENV: 'local',
      LOCAL_TEST_AUTH: 'true',
      LOCAL_TEST_APP_ORIGIN: `http://127.0.0.1:${ports.app}`,
      LOCAL_TEST_EMAIL: process.env.LOCAL_TEST_EMAIL?.trim() || 'matthewirving99@gmail.com',
      LOCAL_TEST_PASSWORD: localTestPassword,
      E2E_JWT_SECRET: jwtSecret,
      PUBLIC_APP_ORIGIN: `http://127.0.0.1:${ports.app}`,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      LOCAL_TEST_AUTH_SIGNING_KEYS: signingKeys,
      E2E_NAMESPACE: namespace,
      E2E_PORT: String(ports.app),
      LOCAL_QA_DIST_DIR: appBuildDir,
    });
    const runPlaywright = (args: string[]) =>
      execFileSync('corepack', ['pnpm', 'exec', 'playwright', 'test', ...args], {
        env,
        shell: process.platform === 'win32',
        stdio: 'inherit',
      });
    process.stdout.write(
      `[qa:local] ${projectId}: running Playwright ${playwrightArgs.join(' ') || 'all projects'}.\n`,
    );
    if (process.env.LOCAL_QA_AUTH_PROBE === 'true') {
      runPlaywright(['tests/e2e/local-test-auth.spec.ts', '--project=chromium']);
    }
    runPlaywright(playwrightArgs);
    testsPassed = true;
    process.stdout.write(`[qa:local] ${projectId}: Playwright passed.\n`);
  } finally {
    cleanup();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Local QA failed.'}\n`);
  process.exitCode = 1;
});
