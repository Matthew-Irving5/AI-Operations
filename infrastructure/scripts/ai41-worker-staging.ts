import { chromium, expect, type Page, type Response } from '@playwright/test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { createHostedStagingSuiteEvidence } from './release-gate.js';
import { liveE2eBrowserEnvironment } from './live-e2e-browser-environment.js';

const origin = 'https://ai-operations-staging.ai-operations.workers.dev';
const control = 'https://jqtssfrfocnibffdkqch.supabase.co/functions/v1';
const safetyRoot = 'C:\\ProgramData\\AI-Operations\\staging\\ai41';
const acceptancePython = process.env.AI41_ACCEPTANCE_PYTHON ?? 'python';
const Inputs = z
  .object({
    candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
    candidateTreeSha: z.string().regex(/^[a-f0-9]{40}$/),
    pullRequestNumber: z.literal(173),
    deploymentRunId: z.string().regex(/^[1-9][0-9]+$/),
    artifactPath: z.string().min(1),
    artifactSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    outputPath: z.string().min(1),
  })
  .strict();
export function validateWorkerAcceptanceInputs(value: unknown) {
  return Inputs.parse(value);
}
const Snapshot = z.array(
  z.object({
    run_id: z.string().uuid(),
    correlation_id: z.string().uuid(),
    scan_id: z.string().uuid(),
    status: z.string(),
    result_verified: z.boolean(),
    inventory_count: z.number(),
    workflow_status: z.string(),
    completed_at: z.string().nullable(),
    result_verified_at: z.string().nullable(),
    result_audit_count: z.number().int().nonnegative(),
  }),
);
export async function readWorkerStagingSnapshot(
  runId: string,
  token = process.env.STAGING_PERSONAL_ACCESS_TOKEN,
  request: typeof fetch = fetch,
) {
  z.string().uuid().parse(runId);
  if (!token?.startsWith('sbp_')) throw new Error('staging_readonly_token_required');
  const response = await request(
    'https://api.supabase.com/v1/projects/jqtssfrfocnibffdkqch/database/query/read-only',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `select r.id as run_id,r.correlation_id,s.id as scan_id,s.status,s.result_verified_at is not null as result_verified,(select count(*)::integer from public.digital_inventory_items i where i.scan_id=s.id) as inventory_count,r.status::text as workflow_status,s.completed_at::text,s.result_verified_at::text,(select count(*)::integer from public.audit_events a where a.target_id=s.id::text and a.action_type='worker_scan_result_verified') as result_audit_count from public.digital_scans s join public.workflow_runs r on r.id=s.run_id where r.id='${runId}'::uuid limit 1`,
      }),
    },
  );
  if (!response.ok) throw new Error(`worker_snapshot_http_${response.status}`);
  return Snapshot.parse(await response.json());
}
const probeSource = `import json,sys,urllib.request,urllib.error,win32crypt
path,endpoint,payload=sys.argv[1:]
secret=win32crypt.CryptUnprotectData(open(path,'rb').read(),None,None,None,0)[1].decode()
request=urllib.request.Request('${control}/'+endpoint,data=payload.encode(),headers={'content-type':'application/json','x-worker-secret':secret},method='POST')
try:
 response=urllib.request.urlopen(request,timeout=30)
except urllib.error.HTTPError as error:
 response=error
body=json.loads(response.read())
print(json.dumps({'status':response.status,'code':body.get('code'),'requestId':body.get('requestId')}))`;
const Probe = z.object({
  status: z.number(),
  code: z.string().nullable().optional(),
  requestId: z.string().optional(),
});
function probe(secretPath: string, endpoint: string, payload: unknown) {
  if (!['worker-poll', 'worker-submit-result'].includes(endpoint))
    throw new Error('worker_probe_endpoint_invalid');
  return Probe.parse(
    JSON.parse(
      execFileSync(
        acceptancePython,
        ['-c', probeSource, secretPath, endpoint, JSON.stringify(payload)],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    ),
  );
}

function replayCompletedScan(folder: string, deviceId: string, scanId: string, fixture: string) {
  const source = `import json,sys,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from ai_operations_worker.identity import create_or_load_private_key,load_secret
from ai_operations_worker.inventory import collect
from ai_operations_worker.results import sign_scan_result
folder,device_id,scan_id,fixture=sys.argv[2:]
inventory=[{'pathToken':i.path_token,'filename':i.filename,'sizeBytes':i.size_bytes,'sha256':i.sha256} for i in collect((Path(fixture),))]
payload=sign_scan_result(create_or_load_private_key(Path(folder)/'worker.key.dpapi'),device_id,scan_id,inventory)
request=urllib.request.Request('${control}/worker-submit-result',data=json.dumps(payload).encode(),headers={'content-type':'application/json','x-worker-secret':load_secret(Path(folder)/'worker.secret.dpapi')},method='POST')
try:
 response=urllib.request.urlopen(request,timeout=30)
except urllib.error.HTTPError as error:
 response=error
body=json.loads(response.read())
print(json.dumps({'status':response.status,'replayed':body.get('replayed'),'accepted':body.get('accepted')}))`;
  return z
    .object({ status: z.literal(200), replayed: z.literal(true), accepted: z.literal(0) })
    .parse(
      JSON.parse(
        execFileSync(
          acceptancePython,
          ['-c', source, resolve('apps/windows-worker/src'), folder, deviceId, scanId, fixture],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      ),
    );
}
async function responseAfterManual(
  page: Page,
  path: string,
  trigger: () => Promise<unknown>,
): Promise<Response> {
  const result = page.waitForResponse(
    (r) => new URL(r.url()).pathname === path && r.request().method() === 'POST',
    { timeout: 10 * 60_000 },
  );
  await trigger();
  process.stdout.write(`MANUAL_MFA_READY ${path}\n`);
  const response = await result;
  if (!response.ok()) throw new Error(`worker_ui_boundary_failed:${path}:${response.status()}`);
  return response;
}
function stop(worker: ChildProcess | undefined) {
  if (worker?.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(worker.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // A worker that already exited has no remaining process to stop.
    }
  }
}
export async function runWorkerAcceptance(raw: unknown) {
  const input = Inputs.parse(raw);
  execFileSync(acceptancePython, ['-c', 'import win32crypt, cryptography'], { stdio: 'pipe' });
  if (process.platform !== 'win32') throw new Error('real_windows_required');
  const artifact = resolve(input.artifactPath);
  if (
    createHash('sha256').update(readFileSync(artifact)).digest('hex') !==
    input.artifactSha256.toLowerCase()
  )
    throw new Error('worker_artifact_checksum_mismatch');
  const provenance = JSON.parse(
    readFileSync(join(resolve(artifact, '..'), 'ai-operations-worker.provenance.json'), 'utf8'),
  ) as Record<string, unknown>;
  if (!Object.values(provenance).includes(input.candidateSha))
    throw new Error('worker_artifact_candidate_mismatch');
  await readWorkerStagingSnapshot('00000000-0000-0000-0000-000000000000');
  const browser = await chromium.launch({
    headless: false,
    env: liveE2eBrowserEnvironment(process.env),
    args: ['--window-position=40,40', '--window-size=1280,900'],
  });
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  let worker: ChildProcess | undefined;
  const ids: string[] = [];
  const runRoot = join(safetyRoot, randomUUID());
  mkdirSync(runRoot, { recursive: true });
  const fixture = join(runRoot, 'fixture');
  mkdirSync(fixture);
  writeFileSync(join(fixture, 'synthetic.txt'), 'AI41 synthetic read-only scan\n');
  const workerEnv = (deviceId: string, folder: string) => ({
    ...liveE2eBrowserEnvironment(process.env),
    AI_OPERATIONS_CONTROL_PLANE_URL: control,
    AI_OPERATIONS_DEVICE_ID: deviceId,
    AI_OPERATIONS_KEY_PATH: join(folder, 'worker.key.dpapi'),
    AI_OPERATIONS_SECRET_PATH: join(folder, 'worker.secret.dpapi'),
    AI_OPERATIONS_STATE_PATH: join(folder, 'worker-state.sqlite'),
    AI_OPERATIONS_ALLOWED_ROOTS_JSON: JSON.stringify([fixture]),
    AI_OPERATIONS_QUARANTINE_ROOT: join(folder, 'quarantine'),
    AI_OPERATIONS_MANIFEST_PUBLIC_KEY_B64: '',
  });
  async function pair(folder: string, label: string) {
    mkdirSync(folder, { recursive: true });
    const identity = z.object({ publicKeyB64: z.string(), fingerprintSha256: z.string() }).parse(
      JSON.parse(
        execFileSync(artifact, ['identity', '--key-path', join(folder, 'worker.key.dpapi')], {
          encoding: 'utf8',
        }),
      ),
    );
    await page.goto('/devices');
    await page.getByLabel('Device label').fill(label);
    await page.getByLabel('Ed25519 public key (base64)').fill(identity.publicKeyB64);
    const response = await responseAfterManual(page, '/api/devices/register', () =>
      page.getByRole('button', { name: 'Register after fresh MFA' }).click(),
    );
    const registration = z
      .object({ device: z.object({ id: z.string().uuid() }), pairingCode: z.string().min(16) })
      .parse(await response.json());
    execFileSync(
      artifact,
      [
        'pair',
        '--control-plane-url',
        control,
        '--device-id',
        registration.device.id,
        '--pairing-code',
        registration.pairingCode,
        '--key-path',
        join(folder, 'worker.key.dpapi'),
        '--secret-path',
        join(folder, 'worker.secret.dpapi'),
      ],
      { stdio: 'pipe' },
    );
    return { id: registration.device.id, folder, label };
  }
  async function queueScan(deviceId: string) {
    await page.goto('/digital-estate');
    // The form targets the first active device; assert it is this isolated test device.
    const formDevice = await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Launch scan' }) })
      .count();
    expect(formDevice).toBe(1);
    await page.getByLabel('Approved roots').fill(fixture);
    const response = await responseAfterManual(page, '/api/digital-estate/scans', () =>
      page.getByRole('button', { name: 'Queue bounded scan (fresh MFA required)' }).click(),
    );
    const body = z
      .object({ scan: z.object({ id: z.string().uuid() }), runId: z.string().uuid() })
      .parse(await response.json());
    const request = JSON.parse(response.request().postData() ?? '{}') as { deviceId?: string };
    expect(request.deviceId).toBe(deviceId);
    return body;
  }
  try {
    const release = await page.request.get(`${origin}/api/release`);
    expect(await release.json()).toMatchObject({ releaseSha: input.candidateSha });
    await page.goto('/login');
    process.stdout.write('MANUAL_LOGIN_READY AI41 Windows worker\n');
    await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 10 * 60_000 });
    await page.goto('/digital-estate');
    // The page renders the bounded scan form before a staging device is paired;
    // the actual device binding is asserted by queueScan after pair().
    await expect(page.getByRole('heading', { name: 'Launch scan', exact: true })).toHaveCount(1);
    const first = await pair(join(runRoot, 'first'), `AI41 synthetic ${randomUUID()}`);
    const secret = join(first.folder, 'worker.secret.dpapi');
    worker = spawn(artifact, [], {
      env: workerEnv(first.id, first.folder),
      stdio: 'ignore',
      windowsHide: true,
    });
    await expect
      .poll(
        async () => {
          await page.goto('/devices');
          return page
            .locator('article')
            .filter({ has: page.getByRole('heading', { name: first.label, exact: true }) })
            .textContent();
        },
        { timeout: 90_000 },
      )
      .toContain('Compatibility: supported');
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: first.label, exact: true }) });
    await expect(card).toContainText('0.2.0');
    await expect(card).toContainText('digital_inventory_v1');
    const noListeners = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$ErrorActionPreference='Stop';$ids=@(${worker.pid});$ids+=Get-CimInstance Win32_Process|Where-Object {$_.ParentProcessId -eq ${worker.pid}}|Select-Object -ExpandProperty ProcessId;@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.OwningProcess -in $ids}).Count`,
      ],
      { encoding: 'utf8' },
    ).trim();
    expect(noListeners).toBe('0');
    const scan = await queueScan(first.id);
    await expect
      .poll(
        async () => {
          await page.goto('/devices');
          return page
            .locator('article')
            .filter({ has: page.getByRole('heading', { name: first.label, exact: true }) })
            .textContent();
        },
        { timeout: 90_000 },
      )
      .toContain('Verified smoke scan complete');
    await expect
      .poll(async () => (await readWorkerStagingSnapshot(scan.runId))[0]?.workflow_status, {
        timeout: 90_000,
      })
      .toBe('succeeded');
    const completed = (await readWorkerStagingSnapshot(scan.runId))[0]!;
    expect(completed.scan_id).toBe(scan.scan.id);
    expect(completed.status).toBe('complete');
    expect(completed.result_verified).toBe(true);
    expect(completed.inventory_count).toBe(1);
    replayCompletedScan(first.folder, first.id, scan.scan.id, fixture);
    expect((await readWorkerStagingSnapshot(scan.runId))[0]).toEqual(completed);
    ids.push(completed.correlation_id);
    const oldVersion = probe(secret, 'worker-poll', {
      deviceId: first.id,
      workerVersion: '0.1.1',
      capabilities: ['digital_inventory_v1'],
    });
    expect(oldVersion.status).toBe(426);
    expect(oldVersion.code).toBe('worker_upgrade_required');
    const unpaired = probe(secret, 'worker-submit-result', {
      deviceId: randomUUID(),
      scanId: scan.scan.id,
      inventory: [],
      signatureB64: Buffer.alloc(64).toString('base64'),
    });
    expect([401, 403]).toContain(unpaired.status);
    stop(worker);
    worker = undefined;
    const outstanding = await queueScan(first.id);
    await page.goto('/devices');
    const revoke = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: first.label, exact: true }) });
    await responseAfterManual(page, '/api/devices/revoke', () =>
      revoke.getByRole('button', { name: 'Revoke after fresh MFA' }).click(),
    );
    const metadata = {
      deviceId: first.id,
      workerVersion: '0.2.0',
      capabilities: ['digital_inventory_v1'],
    };
    expect(probe(secret, 'worker-poll', metadata).status).toBe(403);
    expect(
      probe(secret, 'worker-submit-result', {
        deviceId: first.id,
        scanId: outstanding.scan.id,
        inventory: [],
        signatureB64: Buffer.alloc(64).toString('base64'),
      }).status,
    ).toBe(403);
    const cancelled = (await readWorkerStagingSnapshot(outstanding.runId))[0]!;
    expect(cancelled.scan_id).toBe(outstanding.scan.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.workflow_status).toBe('cancelled');
    ids.push(cancelled.correlation_id);
    const second = await pair(join(runRoot, 'second'), `AI41 synthetic re-pair ${randomUUID()}`);
    expect(second.id).not.toBe(first.id);
    expect(probe(secret, 'worker-poll', metadata).status).toBe(403);
    const secondSecret = join(second.folder, 'worker.secret.dpapi');
    expect(probe(secondSecret, 'worker-poll', { ...metadata, deviceId: second.id }).status).toBe(
      200,
    );
    await page.goto('/devices');
    const secondCard = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: second.label, exact: true }) });
    await responseAfterManual(page, '/api/devices/revoke', () =>
      secondCard.getByRole('button', { name: 'Revoke after fresh MFA' }).click(),
    );
    const checks = {
      realWindowsArtifact: 'passed',
      freshMfaPairing: 'passed',
      identityVersionCapabilities: 'passed',
      harmlessScanReceipt: 'passed',
      replayImpersonationDenied: 'passed',
      revocationRecovery: 'passed',
      repairOldCredentialsDenied: 'passed',
      outboundOnly: 'passed',
      incompatibleWorkerBlocked: 'passed',
    };
    const result = createHostedStagingSuiteEvidence({
      schemaVersion: 1,
      state: 'WORKER_PROTOCOL_STAGING_ACCEPTED',
      acceptanceProfile: 'worker-protocol',
      candidateSha: input.candidateSha,
      candidateTreeSha: input.candidateTreeSha,
      pullRequestNumber: 173,
      deploymentRunId: input.deploymentRunId,
      stagingOrigin: origin,
      humanMfa: 'user-completed',
      checks,
      correlationIds: ids,
      acceptedAt: new Date().toISOString(),
    });
    writeFileSync(resolve(input.outputPath), JSON.stringify(result) + '\n');
    process.stdout.write('AI41_WORKER_PROTOCOL_PASS\n');
  } finally {
    stop(worker);
    await context.close();
    await browser.close();
  }
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/ai41-worker-staging.ts'))
  runWorkerAcceptance(JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8'))).catch((error) => {
    const message = error instanceof Error ? error.message : 'unknown_failure';
    process.stderr.write(`AI41_WORKER_PROTOCOL_FAILED: ${message}; no acceptance written.\n`);
    process.exitCode = 1;
  });
