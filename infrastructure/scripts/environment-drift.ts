import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

const EnvironmentSchema = z.object({
  projectRef: z.string().min(1),
  supabaseUrl: z.string().url(),
  workerName: z.string().min(1),
  origin: z.string().url(),
  archiveBucket: z.string().min(1),
  appEnv: z.enum(['staging', 'production']),
  wranglerConfig: z.string().min(1),
  githubEnvironment: z.string().min(1),
  requiredGitHubSecrets: z.array(z.string()),
  requiredGitHubVariables: z.array(z.string()),
});
const ManifestSchema = z.object({
  environments: z.object({ staging: EnvironmentSchema, production: EnvironmentSchema }),
  allowedDifferences: z.array(z.string()),
  requiredEdgeSecrets: z.array(z.string()),
  requiredWorkerSecrets: z.array(z.string()),
});
const FunctionSchema = z.object({
  slug: z.string(),
  verify_jwt: z.boolean(),
  version: z.number(),
  ezbr_sha256: z.string().min(1),
});
const FunctionsSchema = z.array(FunctionSchema);
const MigrationRowsSchema = z.array(z.object({ version: z.string() }));
const DigestRowsSchema = z.array(z.object({ schema_digest: z.string() })).length(1);
const SecretSchema = z.object({ name: z.string() });
const SecretsSchema = z.array(SecretSchema);
const GitHubNamesSchema = z.array(z.object({ name: z.string() }));
const GitHubEnvironmentSchema = z.object({
  secrets: z.array(z.string()),
  variables: z.array(z.string()),
});
const SourceAttestationSchema = z.object({
  commit: z.string().regex(/^[a-f0-9]{40}$/i),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  supabaseCliVersion: z.string().min(1),
});
const SnapshotSchema = z.object({
  migrations: z.array(z.string()),
  schemaDigest: z.string(),
  functions: FunctionsSchema,
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  secrets: z.array(z.string()),
  worker: z.object({ vars: z.record(z.string(), z.string()), bindings: z.array(z.string()) }),
});
const SnapshotReportSchema = z.object({
  ok: z.boolean(),
  mismatches: z.array(z.string()),
  evidence: z.object({
    mode: z.literal('repo-staging'),
    environment: z.literal('staging'),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/i),
    sourceAttestation: SourceAttestationSchema,
    githubEnvironment: GitHubEnvironmentSchema,
    inventorySnapshot: SnapshotSchema,
  }),
});

export type EnvironmentName = 'staging' | 'production';
export type FunctionInventory = z.infer<typeof FunctionSchema>[];
export type DriftReport = { ok: boolean; mismatches: string[]; evidence: Record<string, unknown> };

export function sourceFileDigests(root: string): Record<string, string> {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:ts|js)$/.test(entry.name) && !/(?:_test|\.test)\.(?:ts|js)$/.test(entry.name))
        files.push(path);
    }
  };
  if (existsSync(root)) walk(root);
  const sourceFiles = new Set(files);
  const entrypoints = files.filter((path) => {
    const rel = relative(root, path).split(sep).join('/');
    const segments = rel.split('/');
    return segments.at(-1) === 'index.ts' && segments.length <= 2 && !segments[0]?.startsWith('_');
  });
  if (entrypoints.length > 0) {
    const reachable = new Set<string>();
    const visit = (path: string) => {
      if (reachable.has(path)) return;
      reachable.add(path);
      const code = readFileSync(path, 'utf8');
      for (const match of code.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
        const specifier = match[1];
        if (!specifier?.startsWith('.')) continue;
        const resolved = resolve(dirname(path), specifier);
        const candidates = [
          resolved,
          `${resolved}.ts`,
          `${resolved}.js`,
          join(resolved, 'index.ts'),
        ];
        const dependency = candidates.find((candidate) => sourceFiles.has(candidate));
        if (dependency) visit(dependency);
      }
    };
    for (const entrypoint of entrypoints) visit(entrypoint);
    for (const path of files) if (!reachable.has(path)) sourceFiles.delete(path);
  }
  return Object.fromEntries(
    [...sourceFiles]
      .map(
        (path) =>
          [
            relative(root, path).split(sep).join('/'),
            valueHash(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')),
          ] as const,
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function compareSourceDigests(
  expected: Record<string, string>,
  deployed: Record<string, string>,
): string[] {
  return sorted([...new Set([...Object.keys(expected), ...Object.keys(deployed)])]).filter(
    (path) => expected[path] !== deployed[path],
  );
}

const manifest = ManifestSchema.parse(
  JSON.parse(readFileSync('docs/build/environment-parity.json', 'utf8')),
);

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function compareInventory(
  left: {
    migrations: string[];
    schemaDigest: string;
    functions: FunctionInventory;
    sourceDigest: string;
    secrets: string[];
    worker: WorkerInventory;
  },
  right: {
    migrations: string[];
    schemaDigest: string;
    functions: FunctionInventory;
    sourceDigest: string;
    secrets: string[];
    worker: WorkerInventory;
  },
  labels: [string, string],
): string[] {
  const mismatches: string[] = [];
  if (JSON.stringify(sorted(left.migrations)) !== JSON.stringify(sorted(right.migrations))) {
    mismatches.push(`${labels[0]} ↔ ${labels[1]}: applied migration versions differ`);
  }
  if (left.schemaDigest !== right.schemaDigest) {
    mismatches.push(`${labels[0]} ↔ ${labels[1]}: live database schema objects differ`);
  }
  if (JSON.stringify(sorted(left.secrets)) !== JSON.stringify(sorted(right.secrets))) {
    mismatches.push(`${labels[0]} ↔ ${labels[1]}: Edge Function secret names differ`);
  }
  if (left.sourceDigest !== right.sourceDigest)
    mismatches.push(`${labels[0]} ↔ ${labels[1]}: release source attestations differ`);
  const functionMap = (entries: FunctionInventory) =>
    new Map(entries.map((entry) => [entry.slug, entry]));
  const leftFunctions = functionMap(left.functions);
  const rightFunctions = functionMap(right.functions);
  for (const slug of sorted([...new Set([...leftFunctions.keys(), ...rightFunctions.keys()])])) {
    const before = leftFunctions.get(slug);
    const after = rightFunctions.get(slug);
    if (!before || !after) {
      mismatches.push(
        `${labels[0]} ↔ ${labels[1]}: Edge Function ${slug} exists in only one environment`,
      );
      continue;
    }
    if (before.verify_jwt !== after.verify_jwt) {
      mismatches.push(`${labels[0]} ↔ ${labels[1]}: Edge Function ${slug} verify_jwt differs`);
    }
    if (before.ezbr_sha256 !== after.ezbr_sha256) {
      mismatches.push(
        `${labels[0]} ↔ ${labels[1]}: Edge Function ${slug} deployed bundle attestation differs`,
      );
    }
  }
  const sharedWorkerShape = (value: WorkerInventory) => ({
    vars: Object.fromEntries(
      Object.entries(value.vars)
        .filter(([name]) => name !== 'APP_ENV' && name !== 'PUBLIC_APP_ORIGIN')
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    bindings: value.bindings.map((binding) => binding.split(':').slice(0, 2).join(':')).sort(),
  });
  if (
    JSON.stringify(sharedWorkerShape(left.worker)) !==
    JSON.stringify(sharedWorkerShape(right.worker))
  ) {
    mismatches.push(
      `${labels[0]} ↔ ${labels[1]}: Cloudflare Worker runtime configuration differs`,
    );
  }
  return mismatches;
}

function compareWorkerToExpected(name: EnvironmentName, actual: WorkerInventory): string[] {
  const expected = inventoryFromWrangler(name);
  const fingerprint = (value: WorkerInventory) =>
    JSON.stringify({
      vars: Object.fromEntries(
        Object.entries(value.vars).sort(([left], [right]) => left.localeCompare(right)),
      ),
      bindings: sorted(value.bindings),
    });
  return fingerprint(expected) === fingerprint(actual)
    ? []
    : [
        `${name}: Cloudflare runtime configuration differs from ${manifest.environments[name].wranglerConfig}`,
      ];
}

export type WorkerInventory = {
  vars: Record<string, string>;
  bindings: string[];
};

export function validateExpectedEnvironment(
  name: EnvironmentName,
  actual: {
    projectRef: string;
    supabaseUrl: string;
    origin: string;
    appEnv: string;
    workerName: string;
    archiveBucket: string;
  },
): string[] {
  const expected = manifest.environments[name];
  const mismatches: string[] = [];
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
    if (actual[key] !== expected[key])
      mismatches.push(`${name}: ${key} does not match the parity manifest`);
  }
  return mismatches;
}

export function compareMigrations(expected: string[], applied: string[], label: string): string[] {
  return JSON.stringify(sorted(expected)) === JSON.stringify(sorted(applied))
    ? []
    : [`${label}: applied migration versions differ`];
}

export function migrationVersionFromFilename(fileName: string): string {
  const match = /^(\d{12}|\d{14})_[^/\\]+\.sql$/.exec(fileName);
  if (!match?.[1]) throw new Error(`Invalid Supabase migration filename: ${fileName}`);
  return match[1];
}

export function validateConfig(
  name: EnvironmentName,
  actual: {
    projectRef: string;
    supabaseUrl: string;
    origin: string;
    appEnv: string;
    workerName: string;
    archiveBucket: string;
  },
): DriftReport {
  const mismatches = validateExpectedEnvironment(name, actual);
  return { ok: mismatches.length === 0, mismatches, evidence: { environment: name, mismatches } };
}

export function validateStagingSnapshot(report: unknown, releaseSha: string): string[] {
  const parsed = SnapshotReportSchema.safeParse(report);
  if (!parsed.success) return ['production: staging inventory artifact is malformed'];
  if (!parsed.data.ok || parsed.data.mismatches.length > 0) {
    return ['production: staging inventory artifact did not pass its release gate'];
  }
  const mismatches: string[] = [];
  if (
    parsed.data.evidence.sourceCommit !== releaseSha ||
    parsed.data.evidence.sourceAttestation.commit !== releaseSha
  ) {
    mismatches.push('production: staging inventory commit does not match the release commit');
  }
  if (
    parsed.data.evidence.inventorySnapshot.sourceDigest !==
    parsed.data.evidence.sourceAttestation.sourceDigest
  ) {
    mismatches.push(
      'production: staging inventory source digest does not match its predeploy attestation',
    );
  }
  return mismatches;
}

export function compareSourceAttestations(
  staging: z.infer<typeof SourceAttestationSchema>,
  production: z.infer<typeof SourceAttestationSchema>,
): string[] {
  const mismatches: string[] = [];
  if (staging.commit !== production.commit)
    mismatches.push('staging ↔ production: release source commits differ');
  if (staging.sourceDigest !== production.sourceDigest)
    mismatches.push('staging ↔ production: predeploy function source digests differ');
  if (staging.supabaseCliVersion !== production.supabaseCliVersion)
    mismatches.push('staging ↔ production: Supabase CLI release versions differ');
  return mismatches;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment input ${name} is missing.`);
  return value;
}

function listGitHubEnvironmentNames(): {
  secrets: string[];
  variables: string[];
} {
  const names = (variable: string): string[] =>
    (process.env[variable] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  return {
    secrets: GitHubNamesSchema.parse(
      names('GITHUB_CONFIG_SECRET_NAMES').map((name) => ({ name })),
    ).map(({ name }) => name),
    variables: GitHubNamesSchema.parse(
      names('GITHUB_CONFIG_VARIABLE_NAMES').map((name) => ({ name })),
    ).map(({ name }) => name),
  };
}

export function missingGitHubEnvironmentNames(
  name: EnvironmentName,
  actual: { secrets: string[]; variables: string[] },
): string[] {
  const expected = manifest.environments[name];
  const secrets = new Set(actual.secrets);
  const variables = new Set(actual.variables);
  return [
    ...expected.requiredGitHubSecrets
      .filter((secret) => !secrets.has(secret))
      .map((secret) => `${name}: required GitHub environment secret name missing: ${secret}`),
    ...expected.requiredGitHubVariables
      .filter((variable) => !variables.has(variable))
      .map((variable) => `${name}: required GitHub environment variable name missing: ${variable}`),
  ];
}

async function api<T>(
  url: string,
  token: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const responseText = await response.text();
    let providerMessage = '';
    try {
      const payload = z
        .object({ message: z.string().optional(), error: z.string().optional() })
        .passthrough()
        .parse(JSON.parse(responseText));
      providerMessage = payload.message ?? payload.error ?? '';
    } catch {
      // Keep non-JSON provider responses out of logs.
    }
    const safeMessage = providerMessage
      .replaceAll(token, '[redacted]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, 500);
    throw new Error(
      `Provider inventory request failed with HTTP ${response.status}.${safeMessage ? ` ${safeMessage}` : ''}`,
    );
  }
  return schema.parse(await response.json());
}

function queryUrl(projectRef: string): string {
  return `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
}

async function getMigrations(projectRef: string, token: string): Promise<string[]> {
  const rows = await api(queryUrl(projectRef), token, MigrationRowsSchema, {
    method: 'POST',
    body: JSON.stringify({
      query:
        'select version::text as version from supabase_migrations.schema_migrations order by version',
      read_only: true,
    }),
  });
  return rows.map(({ version }) => version);
}

async function getSchemaDigest(projectRef: string, token: string): Promise<string> {
  const query = `with objects(kind, identity, definition) as (
    select 'relation', n.nspname || '.' || c.relname,
      c.relkind::text || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    union all
    select 'column', table_schema || '.' || table_name || '.' || column_name,
      data_type || ':' || coalesce(udt_name, '') || ':' || is_nullable || ':' || coalesce(column_default, '')
    from information_schema.columns where table_schema = 'public'
    union all
    select 'constraint', n.nspname || '.' || c.relname || '.' || con.conname, pg_get_constraintdef(con.oid, true)
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
    union all
    select 'index', schemaname || '.' || tablename || '.' || indexname, indexdef from pg_indexes where schemaname = 'public'
    union all
    select 'view', n.nspname || '.' || c.relname, pg_get_viewdef(c.oid, true)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
    union all
    select 'policy', schemaname || '.' || tablename || '.' || policyname,
      coalesce(qual, '') || ':' || coalesce(with_check, '') || ':' || roles::text || ':' || cmd || ':' || permissive
    from pg_policies where schemaname = 'public'
    union all
    select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind <> 'a'
    union all
    select 'enum', n.nspname || '.' || t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' group by n.nspname, t.typname
    union all
    select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, t.tgenabled::text || ':' || md5(pg_get_triggerdef(t.oid, true))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal
    union all
    select 'table-grant', table_schema || '.' || table_name || '.' || grantee, privilege_type || ':' || is_grantable
    from information_schema.role_table_grants where table_schema = 'public'
    union all
    select 'routine-grant', routine_schema || '.' || routine_name || '.' || grantee, privilege_type || ':' || is_grantable
    from information_schema.routine_privileges where routine_schema = 'public'
    union all
    select 'extension', e.extname, e.extversion || ':' || n.nspname
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  )
  select md5(coalesce(string_agg(kind || ':' || identity || ':' || definition, E'\\n' order by kind, identity, definition), '')) as schema_digest from objects`;
  const rows = await api(queryUrl(projectRef), token, DigestRowsSchema, {
    method: 'POST',
    body: JSON.stringify({ query, read_only: true }),
  });
  return rows[0].schema_digest;
}

function generateTypes(projectRef: string, token: string): string {
  try {
    const generated = execFileSync(
      'corepack',
      [
        'pnpm',
        'exec',
        'supabase',
        'gen',
        'types',
        'typescript',
        '--project-id',
        projectRef,
        '--schema',
        'public',
      ],
      {
        encoding: 'utf8',
        shell: process.platform === 'win32',
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trimEnd();
    return execFileSync('corepack', ['pnpm', 'exec', 'prettier', '--parser', 'typescript'], {
      encoding: 'utf8',
      input: `${generated}\n`,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trimEnd();
  } catch {
    throw new Error('Could not generate database types from the selected Supabase project.');
  }
}

function localMigrationInventory(): { fileName: string; version: string }[] {
  const migrations = readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .map((fileName) => ({ fileName, version: migrationVersionFromFilename(fileName) }))
    .sort((left, right) => left.version.localeCompare(right.version));
  const versions = migrations.map(({ version }) => version);
  if (new Set(versions).size !== versions.length)
    throw new Error('Duplicate Supabase migration versions exist in the repository.');
  return migrations;
}

function localMigrations(): string[] {
  return localMigrationInventory().map(({ version }) => version);
}

function deploymentWorkflowMismatches(name: EnvironmentName): string[] {
  const config = manifest.environments[name];
  const workflow = readFileSync(`.github/workflows/deploy-${name}.yml`, 'utf8');
  const expected = [
    `PUBLIC_APP_ORIGIN=${config.origin}`,
    `--config ${name === 'staging' ? 'wrangler.jsonc' : 'wrangler.production.jsonc'}`,
    `${name.toUpperCase()}_SUPABASE_PROJECT_REF`,
    `${name.toUpperCase()}_SUPABASE_URL`,
    ...config.requiredGitHubSecrets.map((secret) => '${{ secrets.' + secret + ' }}'),
    ...config.requiredGitHubVariables.map((variable) => '${{ vars.' + variable + ' }}'),
  ];
  return expected
    .filter((value) => !workflow.includes(value))
    .map(
      (value) =>
        `${name}: deploy workflow is missing expected environment contract ${value.split('=')[0]}`,
    );
}

export function parseFunctionAuth(source: string, directoryNames: string[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const sections = source
    .split(/(?=^\[[^\]]+\])/m)
    .filter((block) => block.startsWith('[functions.'));
  for (const block of sections) {
    const headerMatch = /^\[functions\.([a-zA-Z0-9_-]+)\]\s*(?:#.*)?$/m.exec(block);
    if (!headerMatch?.[1]) throw new Error('Malformed Supabase function configuration section.');
    const slug = headerMatch[1];
    if (result.has(slug)) throw new Error(`Duplicate Supabase function configuration: ${slug}`);
    const verifyLines = block.match(/^[ \t]*verify_jwt[ \t]*=.*$/gm) ?? [];
    if (verifyLines.length > 1)
      throw new Error(`Duplicate verify_jwt setting for Supabase function: ${slug}`);
    let verifyJwt = true;
    if (verifyLines.length === 1) {
      const value = /^[ \t]*verify_jwt[ \t]*=[ \t]*(true|false)[ \t]*(?:#.*)?$/m.exec(block)?.[1];
      if (!value) throw new Error(`Malformed verify_jwt setting for Supabase function: ${slug}`);
      verifyJwt = value === 'true';
    }
    result.set(slug, verifyJwt);
  }
  for (const slug of directoryNames.filter((name) => !name.startsWith('_'))) {
    if (!/^[a-zA-Z0-9_-]+$/.test(slug))
      throw new Error(`Invalid local Supabase function directory: ${slug}`);
    if (!result.has(slug)) result.set(slug, true);
  }
  return result;
}

function localFunctionAuth(): Map<string, boolean> {
  const source = readFileSync('supabase/config.toml', 'utf8');
  const directories = readdirSync('supabase/functions', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name);
  return parseFunctionAuth(source, directories);
}

function captureSourceAttestation(): z.infer<typeof SourceAttestationSchema> {
  const attestation = SourceAttestationSchema.parse({
    commit: requiredEnv('RELEASE_SHA'),
    sourceDigest: stableHash(sourceFileDigests('supabase/functions')),
    supabaseCliVersion: execFileSync('corepack', ['pnpm', 'exec', 'supabase', '--version'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim(),
  });
  const path = requiredEnv('SOURCE_ATTESTATION_PATH');
  writeFileSync(path, `${JSON.stringify(attestation, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  console.log(JSON.stringify(attestation));
  return attestation;
}

function loadSourceAttestation(): z.infer<typeof SourceAttestationSchema> {
  const attestation = SourceAttestationSchema.parse(
    JSON.parse(readFileSync(requiredEnv('SOURCE_ATTESTATION_PATH'), 'utf8')),
  );
  const currentDigest = stableHash(sourceFileDigests('supabase/functions'));
  if (attestation.commit !== requiredEnv('RELEASE_SHA'))
    throw new Error('Function source attestation commit does not match the release.');
  if (attestation.sourceDigest !== currentDigest)
    throw new Error('Function source tree changed after release attestation.');
  const currentCliVersion = execFileSync('corepack', ['pnpm', 'exec', 'supabase', '--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (attestation.supabaseCliVersion !== currentCliVersion)
    throw new Error('Supabase CLI version changed after release attestation.');
  return attestation;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function valueHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function inventoryFromWrangler(name: EnvironmentName): WorkerInventory {
  const config = manifest.environments[name];
  const raw = readFileSync(config.wranglerConfig, 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
  const parsed = JSON.parse(raw) as {
    name?: string;
    vars?: Record<string, string>;
    services?: { binding: string; service: string }[];
    r2_buckets?: { binding: string; bucket_name: string }[];
    assets?: { binding: string };
  };
  const vars = parsed.vars ?? {};
  return {
    vars: Object.fromEntries(Object.entries(vars).map(([key, value]) => [key, valueHash(value)])),
    bindings: sorted([
      ...(parsed.assets ? [`assets:${parsed.assets.binding}`] : []),
      ...(parsed.services ?? []).map((item) => `service:${item.binding}:${item.service}`),
      ...(parsed.r2_buckets ?? []).map((item) => `r2:${item.binding}:${item.bucket_name}`),
      ...manifest.requiredWorkerSecrets.map((secret) => `secret:${secret}`),
    ]),
  };
}

async function getFunctions(projectRef: string, token: string): Promise<FunctionInventory> {
  const entries = await api(
    `https://api.supabase.com/v1/projects/${projectRef}/functions`,
    token,
    z.array(z.unknown()),
  );
  const functions = FunctionsSchema.parse(entries);
  return functions.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function getSecretNames(projectRef: string, token: string): Promise<string[]> {
  const entries = await api(
    `https://api.supabase.com/v1/projects/${projectRef}/secrets`,
    token,
    SecretsSchema,
  );
  return sorted(entries.map(({ name }) => name));
}

async function getWorkerInventory(name: EnvironmentName): Promise<WorkerInventory> {
  const expected = manifest.environments[name];
  const account = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const token = requiredEnv('CLOUDFLARE_API_TOKEN');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${expected.workerName}/settings`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw new Error(`Cloudflare settings request failed with HTTP ${response.status}.`);
  const payload = z
    .object({
      success: z.boolean(),
      result: z.object({ bindings: z.array(z.unknown()).default([]) }),
    })
    .parse(await response.json());
  if (!payload.success) throw new Error('Cloudflare settings inventory was not successful.');
  const bindings: string[] = [];
  const vars: Record<string, string> = {};
  for (const binding of payload.result.bindings) {
    const item = z
      .object({
        type: z.string(),
        name: z.string(),
        text: z.string().optional(),
        service: z.string().optional(),
        bucket_name: z.string().optional(),
      })
      .parse(binding);
    if (item.type === 'plain_text') vars[item.name] = valueHash(item.text ?? '');
    else if (item.type === 'secret_text') bindings.push(`secret:${item.name}`);
    else if (item.type === 'r2_bucket') bindings.push(`r2:${item.name}:${item.bucket_name ?? ''}`);
    else if (item.type === 'service') bindings.push(`service:${item.name}:${item.service ?? ''}`);
    else bindings.push(`${item.type}:${item.name}`);
  }
  for (const secret of manifest.requiredWorkerSecrets) {
    if (!bindings.includes(`secret:${secret}`))
      throw new Error(`${name}: required Worker secret binding ${secret} is missing.`);
  }
  return { vars, bindings: sorted(bindings) };
}

async function inventory(
  name: EnvironmentName,
  accessToken: string,
): Promise<{
  migrations: string[];
  schemaDigest: string;
  functions: FunctionInventory;
  sourceDigest: string;
  secrets: string[];
  worker: WorkerInventory;
}> {
  const config = manifest.environments[name];
  const [migrations, schemaDigest, functions, secrets, worker] = await Promise.all([
    getMigrations(config.projectRef, accessToken),
    getSchemaDigest(config.projectRef, accessToken),
    getFunctions(config.projectRef, accessToken),
    getSecretNames(config.projectRef, accessToken),
    getWorkerInventory(name),
  ]);
  return {
    migrations,
    schemaDigest,
    functions,
    sourceDigest: stableHash(sourceFileDigests('supabase/functions')),
    secrets,
    worker,
  };
}

export async function runDriftCheck(
  mode: 'repo-staging' | 'staging-production',
): Promise<DriftReport> {
  const name: EnvironmentName = mode === 'repo-staging' ? 'staging' : 'production';
  const token = requiredEnv(`${name.toUpperCase()}_SUPABASE_ACCESS_TOKEN`);
  const refEnvName = `${name.toUpperCase()}_SUPABASE_PROJECT_REF`;
  const urlEnvName = `${name.toUpperCase()}_SUPABASE_URL`;
  const mismatches = validateExpectedEnvironment(name, {
    projectRef: requiredEnv(refEnvName),
    supabaseUrl: requiredEnv(urlEnvName),
    origin: manifest.environments[name].origin,
    appEnv: manifest.environments[name].appEnv,
    workerName: manifest.environments[name].workerName,
    archiveBucket: manifest.environments[name].archiveBucket,
  });
  if (mismatches.length) return { ok: false, mismatches, evidence: { mode, environment: name } };

  const sourceAttestation = loadSourceAttestation();
  const current = await inventory(name, token);
  if (current.sourceDigest !== sourceAttestation.sourceDigest)
    mismatches.push('Function source digest differs from the predeploy release attestation.');
  const githubEnvironment = listGitHubEnvironmentNames(name);
  mismatches.push(...missingGitHubEnvironmentNames(name, githubEnvironment));
  mismatches.push(...deploymentWorkflowMismatches(name));
  const repoMigrations = localMigrations();
  mismatches.push(...compareMigrations(repoMigrations, current.migrations, `repo ↔ ${name}`));
  const generatedTypes = generateTypes(manifest.environments[name].projectRef, token);
  const checkedInTypes = readFileSync('packages/db/src/database.types.ts', 'utf8').trimEnd();
  if (generatedTypes !== checkedInTypes)
    mismatches.push(`repo ↔ ${name}: generated database.types.ts differs from live schema`);
  const sourceDigest = sourceAttestation.sourceDigest;
  const auth = localFunctionAuth();
  const expectedSlugs = sorted([...auth.keys()]);
  const deployedSlugs = current.functions.map((fn) => fn.slug);
  for (const slug of sorted([...new Set([...expectedSlugs, ...deployedSlugs])])) {
    const deployed = current.functions.find((fn) => fn.slug === slug);
    if (!auth.has(slug) || !deployed)
      mismatches.push(`repo ↔ ${name}: Edge Function ${slug} exists in only one inventory`);
    else if (auth.get(slug) !== deployed.verify_jwt)
      mismatches.push(
        `${name}: Edge Function ${slug} verify_jwt differs from supabase/config.toml`,
      );
  }
  mismatches.push(...compareWorkerToExpected(name, current.worker));
  const missingSecrets = manifest.requiredEdgeSecrets.filter(
    (secret) => !current.secrets.includes(secret),
  );
  if (missingSecrets.length)
    mismatches.push(
      `${name}: required Edge Function secret names missing: ${missingSecrets.join(', ')}`,
    );
  const report = {
    mode,
    environment: name,
    migrationCount: current.migrations.length,
    migrationDigest: stableHash(sorted(current.migrations)),
    repositoryMigrations: localMigrationInventory(),
    schemaDigest: current.schemaDigest,
    databaseTypesDigest: stableHash(generatedTypes),
    sourceAttestation: {
      ...sourceAttestation,
      providerSourceBytesAvailable: false,
      providerBundleHashesAreReleaseInvariants: true,
    },
    functionCount: current.functions.length,
    functions: current.functions.map(({ slug, verify_jwt, version, ezbr_sha256 }) => ({
      slug,
      verify_jwt,
      version,
      deploymentHash: ezbr_sha256 ?? null,
    })),
    edgeSecretNames: current.secrets,
    githubEnvironment,
    worker: current.worker,
    mismatches,
  };
  return {
    ok: mismatches.length === 0,
    mismatches,
    evidence: {
      ...report,
      sourceCommit: sourceAttestation.commit,
      sourceAttestation,
      githubEnvironment,
      inventorySnapshot: {
        migrations: current.migrations,
        schemaDigest: current.schemaDigest,
        functions: current.functions,
        sourceDigest,
        secrets: current.secrets,
        worker: current.worker,
      },
    },
  };
}

export async function runPairCheck(): Promise<DriftReport> {
  const productionToken = requiredEnv('PRODUCTION_SUPABASE_ACCESS_TOKEN');
  const productionAttestation = loadSourceAttestation();
  const artifactPath = process.env.STAGING_INVENTORY_PATH;
  if (!artifactPath)
    throw new Error('Required staging release inventory artifact path is missing.');
  const stagingArtifact = SnapshotReportSchema.parse(
    JSON.parse(readFileSync(artifactPath, 'utf8')),
  );
  const [staging, production] = await Promise.all([
    Promise.resolve(stagingArtifact.evidence.inventorySnapshot),
    inventory('production', productionToken),
  ]);
  const stagingGithub = stagingArtifact.evidence.githubEnvironment;
  const productionGithub = listGitHubEnvironmentNames();
  const mismatches = [
    ...compareInventory(staging, production, ['staging', 'production']),
    ...compareWorkerToExpected('staging', staging.worker),
    ...compareWorkerToExpected('production', production.worker),
    ...deploymentWorkflowMismatches('staging'),
    ...deploymentWorkflowMismatches('production'),
    ...missingGitHubEnvironmentNames('staging', stagingGithub),
    ...missingGitHubEnvironmentNames('production', productionGithub),
  ];
  const stagingAttestation = stagingArtifact.evidence.sourceAttestation;
  mismatches.push(...compareSourceAttestations(stagingAttestation, productionAttestation));
  const missingStage = manifest.requiredEdgeSecrets.filter(
    (name) => !staging.secrets.includes(name),
  );
  const missingProduction = manifest.requiredEdgeSecrets.filter(
    (name) => !production.secrets.includes(name),
  );
  if (missingStage.length)
    mismatches.push(
      `staging: required Edge Function secret names missing: ${missingStage.join(', ')}`,
    );
  if (missingProduction.length)
    mismatches.push(
      `production: required Edge Function secret names missing: ${missingProduction.join(', ')}`,
    );
  return {
    ok: mismatches.length === 0,
    mismatches,
    evidence: {
      mode: 'staging-production',
      environments: {
        staging: summarize(staging),
        production: summarize(production),
      },
      githubEnvironmentNames: { staging: stagingGithub, production: productionGithub },
      sourceAttestations: {
        staging: stagingAttestation,
        production: productionAttestation,
        providerSourceBytesAvailable: false,
      },
      allowedDifferences: manifest.allowedDifferences,
      mismatches,
    },
  };
}

function summarize(value: Awaited<ReturnType<typeof inventory>>) {
  return {
    migrationCount: value.migrations.length,
    migrationDigest: stableHash(sorted(value.migrations)),
    schemaDigest: value.schemaDigest,
    functionCount: value.functions.length,
    sourceDigest: value.sourceDigest,
    functions: value.functions.map(({ slug, verify_jwt, version, ezbr_sha256 }) => ({
      slug,
      verify_jwt,
      version,
      deploymentHash: ezbr_sha256 ?? null,
    })),
    edgeSecretNames: value.secrets,
    worker: value.worker,
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2] === '--' ? process.argv[3] : process.argv[2];
  if (mode === 'attest-source') {
    captureSourceAttestation();
    return;
  }
  if (mode === 'validate-release-attestation') {
    const report = SnapshotReportSchema.parse(
      JSON.parse(readFileSync(requiredEnv('STAGING_INVENTORY_PATH'), 'utf8')),
    );
    const mismatches = [
      ...validateStagingSnapshot(report, requiredEnv('RELEASE_SHA')),
      ...compareSourceAttestations(report.evidence.sourceAttestation, loadSourceAttestation()),
    ];
    const result = { ok: mismatches.length === 0, mismatches };
    console.log(JSON.stringify(result, null, 2));
    if (mismatches.length > 0) process.exitCode = 1;
    return;
  }
  if (mode === 'validate-staging' || mode === 'validate-production') {
    const name: EnvironmentName = mode === 'validate-staging' ? 'staging' : 'production';
    const prefix = name.toUpperCase();
    const result = validateConfig(name, {
      projectRef: requiredEnv(`${prefix}_SUPABASE_PROJECT_REF`),
      supabaseUrl: requiredEnv(`${prefix}_SUPABASE_URL`),
      origin: requiredEnv(`${prefix}_PUBLIC_APP_ORIGIN`),
      appEnv: requiredEnv('APP_ENV'),
      workerName: requiredEnv('WORKER_NAME'),
      archiveBucket: requiredEnv('ARCHIVE_BUCKET_NAME'),
    });
    const mismatches = [...result.mismatches];
    const githubEnvironment = listGitHubEnvironmentNames();
    mismatches.push(...missingGitHubEnvironmentNames(name, githubEnvironment));
    if (name === 'production') {
      const report = SnapshotReportSchema.parse(
        JSON.parse(readFileSync(requiredEnv('STAGING_INVENTORY_PATH'), 'utf8')),
      );
      mismatches.push(...validateStagingSnapshot(report, requiredEnv('RELEASE_SHA')));
    }
    const evidence = { environment: name, githubEnvironment, mismatches };
    console.log(JSON.stringify(evidence, null, 2));
    if (mismatches.length > 0) process.exitCode = 1;
    return;
  }
  if (mode !== 'repo-staging' && mode !== 'staging-production') {
    throw new Error(
      'Usage: pnpm environment:drift -- validate-staging|validate-production|repo-staging|staging-production',
    );
  }
  const report = mode === 'repo-staging' ? await runDriftCheck(mode) : await runPairCheck();
  const output = JSON.stringify(report, null, 2);
  console.log(output);
  if (process.env.DRIFT_REPORT_PATH)
    writeFileSync(process.env.DRIFT_REPORT_PATH, `${output}\n`, { encoding: 'utf8', mode: 0o600 });
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('environment-drift.ts')) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown drift check failure.';
    console.error(`Environment drift check failed: ${message}`);
    process.exitCode = 1;
  });
}
