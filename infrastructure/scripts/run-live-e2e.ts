import { execFileSync } from 'node:child_process';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';

const mode = process.argv[2];
if (mode !== 'suite' && mode !== 'fixtures' && mode !== 'mismatch') {
  throw new Error('Choose one live E2E mode: suite, fixtures, or mismatch.');
}

const env = parseLiveE2eEnvironment(process.env, mode);
if (mode === 'mismatch') {
  const rejected = (() => {
    try {
      parseLiveE2eEnvironment(
        {
          ...process.env,
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
  process.stdout.write('Non-staging origin and Supabase project rejected before network access.\n');
  process.exit(0);
}

if (env.LIVE_E2E_BASE_URL !== stagingTarget.origin) throw new Error('Unexpected E2E origin.');
if (mode === 'fixtures') {
  // Supabase access stays in this Node process. Reset only queued runs owned by the
  // allowlisted staging profile and marked with this harness's UUID namespace.
  const profileQuery = new URLSearchParams({
    select: 'id,email,is_allowed',
    email: `eq.${env.LIVE_E2E_EMAIL}`,
  });
  const response = await fetch(`${stagingTarget.supabaseUrl}/rest/v1/app_users?${profileQuery}`, {
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok)
    throw new Error(`Staging fixture identity check failed with HTTP ${response.status}.`);
  const users = (await response.json()) as Array<{
    id: string;
    email: string;
    is_allowed: boolean;
  }>;
  if (
    users.length !== 1 ||
    users[0]?.email.toLowerCase() !== env.LIVE_E2E_EMAIL.toLowerCase() ||
    !users[0]?.is_allowed
  ) {
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
  process.env.LIVE_E2E_FIXTURE_IDS = fixtureIds.join(',');
}

execFileSync(
  'corepack',
  [
    'pnpm',
    'exec',
    'playwright',
    'test',
    '--config=playwright.live.config.ts',
    ...(mode === 'fixtures' ? ['--grep=live fixture reset'] : []),
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  },
);
