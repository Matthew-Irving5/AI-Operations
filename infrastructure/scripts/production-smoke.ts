import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  ProductionPromotionEvidenceSchema,
  recordProductionSmoke,
  type ProductionPromotionEvidence,
} from './release-gate.js';

const ProductionOrigin = 'https://ai-operations-production.ai-operations.workers.dev';
const ShaSchema = z.string().regex(/^[a-f0-9]{40}$/i);
const ReleaseMetadataSchema = z
  .object({ schemaVersion: z.literal(1), releaseSha: ShaSchema })
  .strict();

export type ProductionSmokeProbe = {
  name: 'workerVersion' | 'loginShell' | 'authBoundary' | 'safeFunction';
  result: 'passed' | 'failed';
  diagnosticCode?: string;
  observedReleaseSha?: string;
};

export interface ProductionSmokeDependencies {
  fetch: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  maxReleaseAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export function parseProductionPromotionEvidence(input: unknown): ProductionPromotionEvidence {
  return ProductionPromotionEvidenceSchema.parse(input);
}

const defaultDependencies: ProductionSmokeDependencies = {
  fetch: globalThis.fetch,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxReleaseAttempts: 12,
  retryDelayMs: 2_000,
  timeoutMs: 5_000,
};

function requestSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

async function workerVersionProbe(
  expectedSha: string,
  dependencies: ProductionSmokeDependencies,
): Promise<ProductionSmokeProbe> {
  let observedReleaseSha: string | undefined;
  let invalidMetadata = false;
  for (let attempt = 0; attempt < (dependencies.maxReleaseAttempts ?? 12); attempt += 1) {
    try {
      const response = await dependencies.fetch(`${ProductionOrigin}/api/release`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
        redirect: 'manual',
        credentials: 'omit',
        signal: requestSignal(dependencies.timeoutMs ?? 5_000),
      });
      if (response.status === 404) {
        if (attempt + 1 < (dependencies.maxReleaseAttempts ?? 12))
          await dependencies.sleep(dependencies.retryDelayMs ?? 2_000);
        continue;
      }
      if (response.status !== 200)
        return {
          name: 'workerVersion',
          result: 'failed',
          diagnosticCode: 'release_metadata_http_error',
        };
      const metadata = ReleaseMetadataSchema.safeParse(await response.json().catch(() => null));
      if (!metadata.success) {
        invalidMetadata = true;
        break;
      }
      observedReleaseSha = metadata.data.releaseSha.toLowerCase();
      if (observedReleaseSha === expectedSha)
        return { name: 'workerVersion', result: 'passed', observedReleaseSha };
      if (attempt + 1 < (dependencies.maxReleaseAttempts ?? 12))
        await dependencies.sleep(dependencies.retryDelayMs ?? 2_000);
    } catch {
      if (attempt + 1 < (dependencies.maxReleaseAttempts ?? 12))
        await dependencies.sleep(dependencies.retryDelayMs ?? 2_000);
    }
  }
  return {
    name: 'workerVersion',
    result: 'failed',
    diagnosticCode: invalidMetadata
      ? 'release_metadata_invalid'
      : observedReleaseSha
        ? 'release_sha_mismatch'
        : 'release_metadata_unavailable',
    ...(observedReleaseSha ? { observedReleaseSha } : {}),
  };
}

async function loginShellProbe(
  dependencies: ProductionSmokeDependencies,
): Promise<ProductionSmokeProbe> {
  try {
    const response = await dependencies.fetch(`${ProductionOrigin}/login`, {
      method: 'GET',
      headers: { accept: 'text/html' },
      cache: 'no-store',
      redirect: 'manual',
      credentials: 'omit',
      signal: requestSignal(dependencies.timeoutMs ?? 5_000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const body = response.status === 200 ? await response.text() : '';
    return response.status === 200 &&
      contentType.includes('text/html') &&
      body.includes('AI Operations')
      ? { name: 'loginShell', result: 'passed' }
      : { name: 'loginShell', result: 'failed', diagnosticCode: 'login_shell_unavailable' };
  } catch {
    return { name: 'loginShell', result: 'failed', diagnosticCode: 'login_shell_unavailable' };
  }
}

async function authBoundaryProbe(
  dependencies: ProductionSmokeDependencies,
): Promise<ProductionSmokeProbe> {
  try {
    const response = await dependencies.fetch(
      `${ProductionOrigin}/api/connections/sources?connectionId=00000000-0000-4000-8000-000000000000`,
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
        signal: requestSignal(dependencies.timeoutMs ?? 5_000),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    return response.status === 401 &&
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      body.code === 'unauthorised'
      ? { name: 'authBoundary', result: 'passed' }
      : { name: 'authBoundary', result: 'failed', diagnosticCode: 'auth_boundary_unexpected' };
  } catch {
    return { name: 'authBoundary', result: 'failed', diagnosticCode: 'auth_boundary_unavailable' };
  }
}

async function safeFunctionProbe(
  dependencies: ProductionSmokeDependencies,
): Promise<ProductionSmokeProbe> {
  try {
    const response = await dependencies.fetch(`${ProductionOrigin}/api/auth/sign-in`, {
      method: 'GET',
      headers: { accept: 'text/html' },
      cache: 'no-store',
      redirect: 'manual',
      credentials: 'omit',
      signal: requestSignal(dependencies.timeoutMs ?? 5_000),
    });
    return response.status === 307 &&
      response.headers.get('location') === `${ProductionOrigin}/login`
      ? { name: 'safeFunction', result: 'passed' }
      : { name: 'safeFunction', result: 'failed', diagnosticCode: 'safe_function_unexpected' };
  } catch {
    return { name: 'safeFunction', result: 'failed', diagnosticCode: 'safe_function_unavailable' };
  }
}

export async function runProductionSmokeProbes(
  input: { productionOrigin: string; expectedSha: string },
  overrides: Partial<ProductionSmokeDependencies> = {},
): Promise<ProductionSmokeProbe[]> {
  const parsed = z
    .object({ productionOrigin: z.literal(ProductionOrigin), expectedSha: ShaSchema })
    .strict()
    .parse(input);
  const dependencies = { ...defaultDependencies, ...overrides };
  const version = await workerVersionProbe(parsed.expectedSha.toLowerCase(), dependencies);
  const [login, auth, safeFunction] = await Promise.all([
    loginShellProbe(dependencies),
    authBoundaryProbe(dependencies),
    safeFunctionProbe(dependencies),
  ]);
  return [version, login, auth, safeFunction];
}

async function main(): Promise<void> {
  const productionOrigin = process.env.PRODUCTION_ORIGIN ?? '';
  const expectedSha = ShaSchema.parse(process.env.RELEASE_SHA);
  const promotionPath =
    process.env.PRODUCTION_PROMOTION_PATH ?? 'production-promotion-evidence.json';
  const outputPath = process.env.PRODUCTION_SMOKE_OUTPUT_PATH ?? 'production-smoke-evidence.json';
  const promotion = parseProductionPromotionEvidence(
    JSON.parse(await readFile(promotionPath, 'utf8')),
  );
  const probes = await runProductionSmokeProbes({ productionOrigin, expectedSha });
  const evidence = recordProductionSmoke({ deployedSha: expectedSha, promotion, probes });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  if (evidence.state !== 'PRODUCTION_ACCEPTED')
    throw new Error(
      'Production capability smoke requires operator action; redacted evidence was written.',
    );
  process.stdout.write(`Production capability smoke passed for ${expectedSha}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
