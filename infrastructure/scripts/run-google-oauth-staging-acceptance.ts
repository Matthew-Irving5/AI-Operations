import { readGoogleStagingFreshness } from './google-staging-reader.js';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import { resolveGitTreeSha } from './live-acceptance-evidence.js';
import { parseGoogleOAuthStagingEvidence } from './google-oauth-staging-acceptance.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Google OAuth staging acceptance requires ${name}; no browser was opened.`);
  return value;
}

async function main(): Promise<void> {
  if (process.env.LIVE_E2E_MANUAL_MFA !== 'true') {
    throw new Error('Google OAuth staging acceptance requires LIVE_E2E_MANUAL_MFA=true.');
  }
  const env = parseLiveE2eEnvironment(process.env, 'auth-acceptance');
  if (env.LIVE_E2E_BASE_URL !== stagingTarget.origin) throw new Error('Unexpected E2E origin.');

  const candidateSha = required('LIVE_E2E_CANDIDATE_SHA').toLowerCase();
  const candidateTreeSha = required('LIVE_E2E_CANDIDATE_TREE_SHA').toLowerCase();
  const deploymentRunId = required('LIVE_E2E_DEPLOYMENT_RUN_ID');
  const pullRequestNumberInput = required('LIVE_E2E_PULL_REQUEST_NUMBER');
  const selectedFileId = required('LIVE_E2E_GOOGLE_SELECTED_FILE_ID');
  const unselectedFileId = required('LIVE_E2E_GOOGLE_UNSELECTED_FILE_ID');
  const selectedFileName = required('LIVE_E2E_GOOGLE_SELECTED_FILE_NAME');
  if (!/^[a-f0-9]{40}$/.test(candidateSha) || !/^[a-f0-9]{40}$/.test(candidateTreeSha)) {
    throw new Error('Google OAuth acceptance candidate SHA or tree SHA is invalid.');
  }
  if (!/^[1-9][0-9]{0,19}$/.test(deploymentRunId)) {
    throw new Error('Google OAuth acceptance deployment run ID is invalid.');
  }
  if (!/^[1-9][0-9]{0,8}$/.test(pullRequestNumberInput)) {
    throw new Error('Google OAuth acceptance PR number is invalid.');
  }
  if (
    selectedFileId.length > 256 ||
    unselectedFileId.length > 256 ||
    selectedFileId === unselectedFileId ||
    selectedFileName.length < 1 ||
    selectedFileName.length > 200
  ) {
    throw new Error('Google OAuth acceptance requires distinct dedicated staging fixture files.');
  }
  if (resolveGitTreeSha(candidateSha) !== candidateTreeSha) {
    throw new Error('Google OAuth acceptance candidate tree SHA does not match the local commit.');
  }

  await readGoogleStagingFreshness('00000000-0000-4000-8000-000000000001');
  const outputPath = resolve(
    'test-results',
    `live-google-oauth-acceptance-${candidateSha}-${Date.now()}.json`,
  );
  await mkdir(resolve('test-results'), { recursive: true });
  try {
    execFileSync(
      'corepack',
      [
        'pnpm',
        'exec',
        'playwright',
        'test',
        '--config=playwright.live.config.ts',
        'tests/e2e-live/google-oauth-acceptance.spec.ts',
        '--project=staging-chromium',
      ],
      {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          ...env,
          LIVE_E2E_ACCEPTANCE_OUTPUT_PATH: outputPath,
        },
      },
    );
    const evidence = parseGoogleOAuthStagingEvidence(
      JSON.parse(await readFile(outputPath, 'utf8')) as unknown,
    );
    if (
      evidence.candidateSha !== candidateSha ||
      evidence.candidateTreeSha !== candidateTreeSha ||
      evidence.deploymentRunId !== deploymentRunId ||
      evidence.pullRequestNumber !== Number(pullRequestNumberInput)
    ) {
      throw new Error('Google OAuth acceptance evidence does not match the requested candidate.');
    }
    process.stdout.write(`Google OAuth staging acceptance evidence: ${outputPath}\n`);
  } catch (error) {
    await unlink(outputPath).catch(() => undefined);
    throw error;
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : 'Google OAuth acceptance failed.'}\n`,
  );
  process.exitCode = 1;
});
