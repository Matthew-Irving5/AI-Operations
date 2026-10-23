import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import { CareerStagingAcceptanceEvidenceSchema } from './career-staging-acceptance-evidence.js';

const CandidateSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('CANDIDATE_STAGING_DEPLOYED'),
    candidateSha: z.string().regex(/^[a-f0-9]{40}$/i),
    candidateTreeSha: z.string().regex(/^[a-f0-9]{40}$/i),
    pullRequestNumber: z.literal(182),
    runId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    origin: z.literal(stagingTarget.origin),
    acceptanceProfile: z.literal('career'),
    migrations: z.literal('passed'),
    edgeFunctions: z.literal('passed'),
    sourceDrift: z.literal('passed'),
    readinessSmoke: z.literal('passed'),
  })
  .passthrough();

const PullRequestSchema = z
  .object({ number: z.number().int(), headRefOid: z.string() })
  .passthrough();
const UserSchema = z.object({ id: z.string().uuid(), is_allowed: z.literal(true) }).strict();

function gitText(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function currentPullRequestHead(): string {
  try {
    const output = execFileSync(
      'gh',
      [
        'pr',
        'view',
        '182',
        '--repo',
        'Matthew-Irving5/AI-Operations',
        '--json',
        'number,headRefOid',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const pullRequest = PullRequestSchema.parse(JSON.parse(output));
    if (pullRequest.number !== 182) throw new Error('PR identity mismatch.');
    return pullRequest.headRefOid.toLowerCase();
  } catch {
    throw new Error(
      'Could not verify the current GitHub head for Matthew-Irving5/AI-Operations PR #182.',
    );
  }
}

async function allowlistedStagingUserId(): Promise<string> {
  const env = parseLiveE2eEnvironment(process.env, 'auth-acceptance');
  const query = new URLSearchParams({ select: 'id,is_allowed', is_allowed: 'eq.true', limit: '2' });
  if (env.LIVE_E2E_EMAIL) query.set('email', `eq.${env.LIVE_E2E_EMAIL}`);
  const response = await fetch(`${stagingTarget.supabaseUrl}/rest/v1/app_users?${query}`, {
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`Staging identity check failed with HTTP ${response.status}.`);
  const users = z
    .array(UserSchema)
    .max(2)
    .parse(await response.json());
  if (users.length !== 1)
    throw new Error('The allowlisted staging account is missing or ambiguous.');
  return users[0]!.id;
}

async function main(): Promise<void> {
  const candidatePath = process.argv[2];
  if (!candidatePath) {
    throw new Error(
      'Provide the downloaded candidate deployment JSON: node --env-file-if-exists=.env --import tsx infrastructure/scripts/run-career-staging-acceptance.ts <candidate-staging-deployment.json>',
    );
  }
  if (process.env.LIVE_E2E_MANUAL_MFA !== 'true') {
    throw new Error('Set LIVE_E2E_MANUAL_MFA=true to open the headed browser for operator MFA.');
  }

  const env = parseLiveE2eEnvironment(process.env, 'auth-acceptance');
  if (env.LIVE_E2E_BASE_URL !== stagingTarget.origin) throw new Error('Unexpected staging origin.');
  const candidate = CandidateSchema.parse(
    JSON.parse(await readFile(resolve(candidatePath), 'utf8')),
  );
  const candidateSha = candidate.candidateSha.toLowerCase();
  const candidateTreeSha = candidate.candidateTreeSha.toLowerCase();
  if (gitText('rev-parse', '--verify', 'HEAD').toLowerCase() !== candidateSha) {
    throw new Error('Local HEAD does not match the immutable staging candidate SHA.');
  }
  if (
    gitText('rev-parse', '--verify', `${candidateSha}^{tree}`).toLowerCase() !== candidateTreeSha
  ) {
    throw new Error('Candidate tree SHA does not match the downloaded deployment metadata.');
  }
  if (currentPullRequestHead() !== candidateSha) {
    throw new Error('PR #182 has moved since this staging candidate was deployed.');
  }

  const releaseResponse = await fetch(new URL('/api/release', stagingTarget.origin));
  if (!releaseResponse.ok)
    throw new Error(`Staging release identity check failed with HTTP ${releaseResponse.status}.`);
  const releasePayload = z
    .object({ schemaVersion: z.literal(1), releaseSha: z.string() })
    .strict()
    .parse(await releaseResponse.json());
  if (releasePayload.releaseSha.toLowerCase() !== candidateSha) {
    throw new Error('Staging is not serving the exact downloaded candidate SHA.');
  }

  const userId = await allowlistedStagingUserId();
  const outputPath = resolve(
    'test-results',
    `career-staging-acceptance-${candidateSha}-${candidate.runId}.json`,
  );
  const outputDirectory = resolve(
    'test-results',
    `career-staging-${candidateSha}-${candidate.runId}`,
  );
  const authStatePath = resolve('test-results', 'career-staging-auth-state.json');
  const hasAuthState = await access(authStatePath).then(
    () => true,
    () => false,
  );
  const authStateAgeMs = hasAuthState ? Date.now() - (await stat(authStatePath)).mtimeMs : null;
  const hasResumableAuthState =
    authStateAgeMs !== null && authStateAgeMs >= 0 && authStateAgeMs < 30 * 60_000;
  if (hasAuthState && !hasResumableAuthState) await unlink(authStatePath).catch(() => undefined);
  await mkdir(resolve('test-results'), { recursive: true });
  process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH = outputPath;
  process.env.LIVE_E2E_AUTH_STATE_PATH = authStatePath;
  delete process.env.LIVE_E2E_RESUME_AUTH;
  delete process.env.LIVE_E2E_STORAGE_STATE;
  if (hasResumableAuthState) {
    process.env.LIVE_E2E_RESUME_AUTH = 'true';
    process.env.LIVE_E2E_STORAGE_STATE = authStatePath;
  }
  process.env.LIVE_E2E_CANDIDATE_SHA = candidateSha;
  process.env.LIVE_E2E_CANDIDATE_TREE_SHA = candidateTreeSha;
  process.env.LIVE_E2E_PULL_REQUEST_NUMBER = String(candidate.pullRequestNumber);
  process.env.LIVE_E2E_DEPLOYMENT_RUN_ID = candidate.runId;
  process.env.LIVE_E2E_USER_ID = userId;

  try {
    execFileSync(
      'corepack',
      [
        'pnpm',
        'exec',
        'playwright',
        'test',
        '--config=playwright.live.config.ts',
        'tests/e2e-live/career-acceptance.spec.ts',
        '--workers=1',
        `--output=${outputDirectory}`,
      ],
      {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: { ...process.env, ...env },
      },
    );
    const evidence = CareerStagingAcceptanceEvidenceSchema.parse(
      JSON.parse(await readFile(outputPath, 'utf8')),
    );
    if (
      evidence.candidateSha !== candidateSha ||
      evidence.candidateTreeSha !== candidateTreeSha ||
      evidence.pullRequestNumber !== candidate.pullRequestNumber ||
      evidence.deploymentRunId !== candidate.runId ||
      evidence.stagingOrigin !== candidate.origin
    ) {
      throw new Error(
        'Career evidence does not match the immutable candidate deployment metadata.',
      );
    }
    process.stdout.write(`Career staging acceptance evidence saved to ${outputPath}.\n`);
    await unlink(authStatePath).catch(() => undefined);
  } catch (error) {
    await unlink(outputPath).catch(() => undefined);
    throw error;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown career acceptance failure.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
