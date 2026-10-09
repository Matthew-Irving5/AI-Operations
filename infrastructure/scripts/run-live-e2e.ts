import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import { createHostedStagingSuiteEvidence } from './release-gate.js';
import { resolveGitTreeSha } from './live-acceptance-evidence.js';

async function containsFailureArtifacts(directory: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return false;
  }
  const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  if (names.has('failure-redacted.png') && names.has('failure-redacted-trace.json')) return true;
  for (const entry of entries) {
    if (entry.isDirectory() && (await containsFailureArtifacts(resolve(directory, entry.name)))) {
      return true;
    }
  }
  return false;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (
    mode !== 'suite' &&
    mode !== 'auth-acceptance' &&
    mode !== 'fixtures' &&
    mode !== 'fixture-mismatch' &&
    mode !== 'mismatch'
  ) {
    throw new Error(
      'Choose one live E2E mode: suite, auth-acceptance, fixtures, fixture-mismatch, or mismatch.',
    );
  }

  if (mode === 'mismatch') {
    const safeDefaults = {
      LIVE_E2E_BASE_URL: stagingTarget.origin,
      LIVE_E2E_SUPABASE_URL: stagingTarget.supabaseUrl,
      LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY: 'unused-safety-check-value',
      LIVE_E2E_EMAIL: 'qa@example.test',
      LIVE_E2E_PASSWORD: 'unused-safety-check-value',
    };
    const rejected = (() => {
      try {
        parseLiveE2eEnvironment(
          {
            ...safeDefaults,
            LIVE_E2E_BASE_URL: 'https://ai-operations.example.com',
            LIVE_E2E_SUPABASE_URL: 'https://production-project.supabase.co',
          },
          'suite',
        );
        return false;
      } catch {
        return true;
      }
    })();
    if (!rejected) throw new Error('Safety guard accepted a non-staging target.');
    process.stdout.write(
      'Non-staging origin and Supabase project rejected before network access.\n',
    );
    process.exit(0);
  }

  if (
    (mode === 'suite' || mode === 'auth-acceptance') &&
    process.env.LIVE_E2E_MANUAL_MFA !== 'true'
  ) {
    throw new Error(
      'Live suite requires LIVE_E2E_MANUAL_MFA=true so Playwright opens a user-visible browser for the real MFA checkpoint.',
    );
  }
  const env = parseLiveE2eEnvironment(process.env, mode);
  if (env.LIVE_E2E_BASE_URL !== stagingTarget.origin) throw new Error('Unexpected E2E origin.');
  let acceptanceOutputPath: string | undefined;
  let acceptanceCandidateSha: string | undefined;
  let acceptanceDeploymentRunId: string | undefined;
  let acceptanceCandidateTreeSha: string | undefined;
  let acceptancePullRequestNumber: number | undefined;
  if (mode === 'suite' || mode === 'auth-acceptance') {
    acceptanceCandidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
    acceptanceDeploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;
    acceptanceCandidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA;
    const pullRequestNumberInput = process.env.LIVE_E2E_PULL_REQUEST_NUMBER;
    if (
      [
        acceptanceCandidateSha,
        acceptanceDeploymentRunId,
        acceptanceCandidateTreeSha,
        pullRequestNumberInput,
      ].some(Boolean) &&
      ![
        acceptanceCandidateSha,
        acceptanceDeploymentRunId,
        acceptanceCandidateTreeSha,
        pullRequestNumberInput,
      ].every(Boolean)
    ) {
      throw new Error(
        'Hosted acceptance evidence requires candidate SHA, tree SHA, PR number, and staging deployment run ID.',
      );
    }
    if (
      acceptanceCandidateSha &&
      acceptanceDeploymentRunId &&
      acceptanceCandidateTreeSha &&
      pullRequestNumberInput
    ) {
      if (!/^[a-f0-9]{40}$/i.test(acceptanceCandidateSha))
        throw new Error('Hosted acceptance candidate SHA is invalid.');
      if (!/^[a-f0-9]{40}$/i.test(acceptanceCandidateTreeSha))
        throw new Error('Hosted acceptance candidate tree SHA is invalid.');
      if (!/^[1-9][0-9]{0,19}$/.test(acceptanceDeploymentRunId))
        throw new Error('Hosted acceptance deployment run ID is invalid.');
      if (!/^[1-9][0-9]{0,8}$/.test(pullRequestNumberInput))
        throw new Error('Hosted acceptance PR number is invalid.');
      acceptanceCandidateSha = acceptanceCandidateSha.toLowerCase();
      acceptanceCandidateTreeSha = acceptanceCandidateTreeSha.toLowerCase();
      acceptancePullRequestNumber = Number(pullRequestNumberInput);
      const actualTreeSha = resolveGitTreeSha(acceptanceCandidateSha);
      if (actualTreeSha !== acceptanceCandidateTreeSha)
        throw new Error(
          'Hosted acceptance candidate tree SHA does not match the local candidate commit.',
        );
      acceptanceOutputPath = resolve(
        'test-results',
        `live-staging-acceptance-${acceptanceCandidateSha}-${Date.now()}.json`,
      );
      await mkdir(resolve('test-results'), { recursive: true });
      process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH = acceptanceOutputPath;
    }
  }
  if (mode === 'auth-acceptance') {
    const profileQuery = new URLSearchParams({ select: 'id,is_allowed', is_allowed: 'eq.true' });
    if (env.LIVE_E2E_EMAIL) profileQuery.set('email', `eq.${env.LIVE_E2E_EMAIL}`);
    const profileResponse = await fetch(
      `${stagingTarget.supabaseUrl}/rest/v1/app_users?${profileQuery}`,
      {
        headers: {
          apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!profileResponse.ok)
      throw new Error(`Staging auth profile check failed with HTTP ${profileResponse.status}.`);
    const profiles = (await profileResponse.json()) as Array<{ id: string; is_allowed: boolean }>;
    if (profiles.length !== 1 || !profiles[0]?.is_allowed)
      throw new Error('The allowlisted staging profile is missing or ambiguous.');
    const scheduleQuery = new URLSearchParams({
      select: 'id,enabled',
      user_id: `eq.${profiles[0].id}`,
      enabled: 'eq.false',
      order: 'id.asc',
      limit: '1',
    });
    const scheduleResponse = await fetch(
      `${stagingTarget.supabaseUrl}/rest/v1/workflow_schedules?${scheduleQuery}`,
      {
        headers: {
          apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!scheduleResponse.ok)
      throw new Error(
        `Staging schedule fixture check failed with HTTP ${scheduleResponse.status}.`,
      );
    const schedules = (await scheduleResponse.json()) as Array<{ id: string; enabled: boolean }>;
    if (schedules.length !== 1 || schedules[0]?.enabled !== false)
      throw new Error('A disabled staging schedule is required for the no-state-change MFA proof.');
    process.env.LIVE_E2E_USER_ID = profiles[0].id;
    process.env.LIVE_E2E_SCHEDULE_ID = schedules[0].id;
    process.stdout.write(
      'Staging auth prerequisites passed: one allowlisted user and one disabled schedule selected for an idempotent update proof.\n',
    );
  }
  if (mode === 'fixtures' || mode === 'suite' || mode === 'fixture-mismatch') {
    // Supabase access stays in this Node process. Reset only queued runs owned by the
    // allowlisted staging profile and marked with this harness's UUID namespace.
    const profileQuery = new URLSearchParams({
      select: 'id,is_allowed',
      is_allowed: 'eq.true',
    });
    if (env.LIVE_E2E_EMAIL) profileQuery.set('email', `eq.${env.LIVE_E2E_EMAIL}`);
    const response = await fetch(`${stagingTarget.supabaseUrl}/rest/v1/app_users?${profileQuery}`, {
      headers: {
        apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!response.ok)
      throw new Error(`Staging fixture identity check failed with HTTP ${response.status}.`);
    const users = (await response.json()) as Array<{ id: string; is_allowed: boolean }>;
    if (users.length !== 1 || !users[0]?.is_allowed) {
      throw new Error('The allowlisted staging app profile is missing or disabled.');
    }
    const userId = users[0]!.id;
    const [definitionResponse, queueResponse] = await Promise.all([
      fetch(
        `${stagingTarget.supabaseUrl}/rest/v1/workflow_definitions?select=id&code=eq.travel-on-demand-plan`,
        {
          headers: {
            apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
            authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      ),
      fetch(
        `${stagingTarget.supabaseUrl}/rest/v1/job_queue?${new URLSearchParams({
          select: 'run_id,status,job_type,payload',
          user_id: `eq.${userId}`,
          job_type: 'eq.workflow_execute',
          status: 'eq.queued',
          'payload->>purpose': 'eq.AI7-LIVE-E2E-FIXTURE-v1',
        })}`,
        {
          headers: {
            apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
            authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      ),
    ]);
    if (!definitionResponse.ok || !queueResponse.ok)
      throw new Error('Staging fixture definition or ownership-marker lookup failed.');
    const definitions = (await definitionResponse.json()) as Array<{ id: string }>;
    const markedJobs = (await queueResponse.json()) as Array<{
      run_id: string;
      status: string;
      job_type: string;
      payload: Record<string, unknown>;
    }>;
    if (definitions.length !== 1)
      throw new Error('The canonical staging Travel workflow is unavailable.');
    const runQuery = new URLSearchParams({
      select: 'id,status,idempotency_key,trigger',
      user_id: `eq.${userId}`,
      workflow_definition_id: `eq.${definitions[0]!.id}`,
      trigger: 'eq.on_demand',
      status: 'eq.queued',
      idempotency_key: 'like.a17e*',
    });
    const fixtureResponse = await fetch(
      `${stagingTarget.supabaseUrl}/rest/v1/workflow_runs?${runQuery}`,
      {
        headers: {
          apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!fixtureResponse.ok)
      throw new Error(`Staging fixture reset query failed with HTTP ${fixtureResponse.status}.`);
    const fixtures = (await fixtureResponse.json()) as Array<{
      id: string;
      status: string;
      idempotency_key: string;
    }>;
    const fixtureIds = fixtures
      .filter((fixture) =>
        markedJobs.some(
          (job) =>
            job.run_id === fixture.id &&
            job.job_type === 'workflow_execute' &&
            job.payload.purpose === 'AI7-LIVE-E2E-FIXTURE-v1',
        ),
      )
      .map((fixture) => fixture.id);
    if (fixtureIds.length > 8)
      throw new Error(
        'More than eight queued E2E fixtures exist; inspect staging before resetting them.',
      );
    process.stdout.write(
      `Staging identity prerequisite passed; found ${fixtureIds.length} explicitly marked queued fixture(s) for authenticated reset.\n`,
    );
    if (mode === 'fixtures') {
      process.stdout.write(
        'This check is read-only. Run the suite once to reset these fixtures and exercise all hosted browser scenarios in one authenticated session.\n',
      );
      process.exit(0);
    }
    process.env.LIVE_E2E_FIXTURE_IDS = fixtureIds.join(',');
    if (mode === 'fixture-mismatch') {
      process.env.LIVE_E2E_FIXTURE_MISMATCH_EXPECTED_COUNT = String(fixtureIds.length + 1);
    }
  }

  if (mode === 'fixture-mismatch') {
    const outputDirectory = resolve(`test-results/fixture-mismatch-${Date.now()}`);
    let expectedFailure = false;
    try {
      execFileSync(
        'corepack',
        [
          'pnpm',
          'exec',
          'playwright',
          'test',
          '--config=playwright.live.config.ts',
          '--grep=deliberate staging fixture mismatch emits redacted failure diagnostics',
          `--output=${outputDirectory}`,
        ],
        {
          stdio: 'inherit',
          shell: process.platform === 'win32',
          env: { ...process.env, ...env },
        },
      );
    } catch (error) {
      expectedFailure =
        typeof error === 'object' && error !== null && 'status' in error && error.status === 1;
    }
    if (!expectedFailure || !(await containsFailureArtifacts(outputDirectory))) {
      throw new Error(
        'The deliberate fixture mismatch did not produce the expected redacted diagnostics.',
      );
    }
    process.stdout.write(
      `Deliberate staging fixture mismatch failed before authentication or mutation and captured redacted screenshot/diagnostic artifacts in ${outputDirectory}.\n`,
    );
    return;
  }

  try {
    const liveArgs = [
      'pnpm',
      'exec',
      'playwright',
      'test',
      '--config=playwright.live.config.ts',
      ...(mode === 'auth-acceptance' ? ['tests/e2e-live/auth-acceptance.spec.ts'] : []),
    ];
    execFileSync('corepack', liveArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...env },
    });
    if (
      acceptanceOutputPath &&
      acceptanceCandidateSha &&
      acceptanceDeploymentRunId &&
      acceptanceCandidateTreeSha &&
      acceptancePullRequestNumber
    ) {
      const rawEvidence: unknown = JSON.parse(await readFile(acceptanceOutputPath, 'utf8'));
      const evidence = createHostedStagingSuiteEvidence(rawEvidence);
      if (evidence.candidateSha !== acceptanceCandidateSha)
        throw new Error(
          'Hosted acceptance evidence candidate SHA did not match the requested candidate.',
        );
      if (evidence.deploymentRunId !== acceptanceDeploymentRunId)
        throw new Error(
          'Hosted acceptance evidence deployment run did not match the staging deployment.',
        );
      if (evidence.candidateTreeSha !== acceptanceCandidateTreeSha)
        throw new Error(
          'Hosted acceptance evidence candidate tree SHA did not match the requested candidate.',
        );
      if (evidence.pullRequestNumber !== acceptancePullRequestNumber)
        throw new Error(
          'Hosted acceptance evidence PR number did not match the requested candidate.',
        );
      process.stdout.write(
        `Hosted staging acceptance evidence written to ${acceptanceOutputPath}.\n`,
      );
    }
  } catch (error) {
    if (acceptanceOutputPath) await unlink(acceptanceOutputPath).catch(() => undefined);
    throw error;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
