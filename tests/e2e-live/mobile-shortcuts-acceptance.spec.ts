import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { expect, test, type Page } from '@playwright/test';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import { readMobileStagingRows } from '../../infrastructure/scripts/mobile-staging-reader';

const env = parseLiveE2eEnvironment(process.env, 'suite');
const anonKey = process.env.LIVE_E2E_SUPABASE_ANON_KEY ?? process.env.STAGING_SUPABASE_ANON_KEY;
const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA;
const pullRequestNumber = process.env.LIVE_E2E_PULL_REQUEST_NUMBER;
const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;
const mobileResultPath = resolve(
  process.env.LIVE_E2E_MOBILE_RESULT_OUTPUT_PATH ?? 'test-results/mobile-shortcuts-staging.json',
);
const resultDirectory = `${resolve('test-results')}${sep}`;

type CalendarRecord = {
  record_id: string;
  source: 'calendar';
  kind: 'calendar_event';
  external_id: string;
  modified_at: string;
  payload: {
    title: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
    calendar: string;
    location: string;
    notes: string;
    url: string;
  };
};

type MobileEnvelope = {
  schema_version: number;
  snapshot_id: string;
  request_id: string;
  client: { type: 'ios-shortcut'; version: '1.0.0' };
  captured_at: string;
  sources: Array<{
    source: 'calendar';
    requested: boolean;
    captured: boolean;
    captured_at: string | null;
    record_count: number;
    error: null;
  }>;
  records: CalendarRecord[];
  attachments: [];
};

type IngestResult = {
  status?: string;
  replay?: boolean;
  adaptation?: { adapted: number; duplicate: number; rejected: number };
};

type EdgeResult = { status: number; body: IngestResult; correlationId: string };
type RawSnapshot = {
  id: string;
  snapshot_id: string;
  request_id: string;
  device_id: string;
  received_at: string;
  received_count: number;
  client_type: string;
  client_version: string;
  status: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function envelope(records: CalendarRecord[], captured = true): MobileEnvelope {
  const capturedAt = new Date().toISOString();
  return {
    schema_version: 1,
    snapshot_id: randomUUID(),
    request_id: randomUUID(),
    client: { type: 'ios-shortcut', version: '1.0.0' },
    captured_at: capturedAt,
    sources: [
      {
        source: 'calendar',
        requested: true,
        captured,
        captured_at: captured ? capturedAt : null,
        record_count: records.length,
        error: null,
      },
    ],
    records,
    attachments: [],
  };
}

function eventRecord(title: string, externalId: string, modifiedAt: string): CalendarRecord {
  const start = Date.now() + 60 * 60_000;
  return {
    record_id: randomUUID(),
    source: 'calendar',
    kind: 'calendar_event',
    external_id: externalId,
    modified_at: modifiedAt,
    payload: {
      title,
      start_at: new Date(start).toISOString(),
      end_at: new Date(start + 30 * 60_000).toISOString(),
      all_day: false,
      calendar: 'AI28 synthetic acceptance fixture',
      location: '',
      notes: '',
      url: '',
    },
  };
}

async function protectedStagingRows<T extends object>(
  table: string,
  filters: Record<string, string>,
): Promise<T[]> {
  return readMobileStagingRows<T>(table, filters);
}

const ownerReadContracts = {
  apple_bridge_devices: {
    columns: ['id', 'user_id', 'revoked_at'],
    filters: ['id'],
    scopes: [['id']],
  },
  data_freshness: {
    columns: ['state', 'last_success_at'],
    filters: ['user_id', 'source'],
    scopes: [['user_id', 'source']],
  },
  mobile_calendar_event_items: {
    columns: ['id', 'raw_record_id'],
    filters: ['user_id', 'raw_record_id', 'title'],
    scopes: [
      ['user_id', 'raw_record_id'],
      ['user_id', 'title'],
    ],
  },
} as const;

function readOwnerSession(cookies: Array<{ name: string; value: string }>): {
  accessToken: string;
  userId: string;
} {
  const cookieBase = `sb-${stagingTarget.projectRef}-auth-token`;
  const chunks = cookies
    .filter(({ name }) => name === cookieBase || name.startsWith(`${cookieBase}.`))
    .sort((left, right) => {
      const leftIndex = Number(left.name.slice(cookieBase.length + 1)) || 0;
      const rightIndex = Number(right.name.slice(cookieBase.length + 1)) || 0;
      return leftIndex - rightIndex;
    });
  if (chunks.length === 0) throw new Error('AI28 owner browser auth cookie is missing.');
  const encoded = chunks.map(({ value }) => value).join('');
  const json = encoded.startsWith('base64-')
    ? Buffer.from(encoded.slice('base64-'.length), 'base64url').toString('utf8')
    : decodeURIComponent(encoded);
  const session = JSON.parse(json) as { access_token?: string };
  const accessToken = session.access_token;
  const claimsPart = accessToken?.split('.')[1];
  if (!accessToken || !claimsPart) throw new Error('AI28 owner browser access token is invalid.');
  const claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8')) as {
    aal?: string;
    exp?: number;
    sub?: string;
  };
  if (
    claims.aal !== 'aal2' ||
    !claims.sub ||
    !/^[0-9a-f-]{36}$/i.test(claims.sub) ||
    typeof claims.exp !== 'number' ||
    claims.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error('AI28 owner browser session is not a current AAL2 session.');
  }
  return { accessToken, userId: claims.sub };
}

async function ownerRows<T extends object>(
  page: Page,
  tableName: string,
  filters: Record<string, string>,
): Promise<T[]> {
  if (!Object.hasOwn(ownerReadContracts, tableName))
    throw new Error('AI28 owner Data API table is not allowlisted.');
  const table = tableName as keyof typeof ownerReadContracts;
  const contract = ownerReadContracts[table];
  const selected = (filters.select ?? '').split(',');
  if (
    !filters.select ||
    selected.length === 0 ||
    selected.some((column) => !contract.columns.includes(column as never)) ||
    Object.keys(filters).some((column) => !['select', ...contract.filters].includes(column)) ||
    !(contract.scopes as readonly (readonly string[])[]).some((scope) =>
      scope.every((column) => Object.hasOwn(filters, column)),
    )
  ) {
    throw new Error(`AI28 owner Data API query is outside the ${table} read contract.`);
  }
  const session = readOwnerSession(await page.context().cookies(stagingTarget.origin));
  if (table !== 'apple_bridge_devices' && filters.user_id !== `eq.${session.userId}`) {
    throw new Error(`AI28 owner Data API query for ${table} does not match the signed-in owner.`);
  }
  for (const [column, expression] of Object.entries(filters)) {
    if (column === 'select') continue;
    if (column === 'title') {
      if (!/^like\.AI28_SYNTH_[A-Za-z0-9_-]{1,80}\*$/.test(expression))
        throw new Error('AI28 owner Data API title filter must use the synthetic fixture prefix.');
    } else if (column === 'source') {
      if (expression !== 'eq.apple_calendar')
        throw new Error('AI28 owner Data API source filter is not allowlisted.');
    } else if (!/^eq\.[0-9a-f-]{36}$/i.test(expression)) {
      throw new Error(`AI28 owner Data API filter is invalid for ${table}.${column}.`);
    }
  }
  const url = new URL(`/rest/v1/${table}`, env.LIVE_E2E_SUPABASE_URL);
  for (const [column, value] of Object.entries(filters)) url.searchParams.set(column, value);
  const response = await fetch(url, {
    headers: {
      apikey: anonKey!,
      authorization: `Bearer ${session.accessToken}`,
    },
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error(`AI28 owner read of ${table} failed with HTTP ${response.status}.`);
  const rows: unknown = await response.json();
  if (
    !Array.isArray(rows) ||
    rows.some((row) => typeof row !== 'object' || row === null || Array.isArray(row))
  ) {
    throw new Error(`AI28 owner read of ${table} returned an unexpected row shape.`);
  }
  return rows as T[];
}

async function mobileRequest(
  token: string,
  body: string,
  contentType = 'application/json',
): Promise<EdgeResult> {
  const response = await fetch(`${env.LIVE_E2E_SUPABASE_URL}/functions/v1/mobile-snapshot-ingest`, {
    method: 'POST',
    headers: {
      apikey: anonKey!,
      authorization: `Bearer ${token}`,
      'content-type': contentType,
    },
    body,
  });
  const correlationId = response.headers.get('x-correlation-id');
  if (!correlationId) throw new Error('Mobile ingest response omitted its correlation ID.');
  const parsed: unknown = await response.json().catch(() => ({}));
  return {
    status: response.status,
    body: typeof parsed === 'object' && parsed !== null ? (parsed as IngestResult) : {},
    correlationId,
  };
}

async function seedAcceptedRawBeforeAdaptation(
  token: string,
  value: MobileEnvelope,
): Promise<void> {
  const record = value.records[0]!;
  const rpcRecords = [
    {
      record_id: record.record_id,
      source: record.source,
      kind: record.kind,
      external_id: record.external_id,
      source_created_at: null,
      source_modified_at: new Date(record.modified_at).toISOString(),
      canonical_hash: sha256(canonicalJson(record.payload)),
      payload: record.payload,
      raw_record: record,
      ingest_status: 'accepted',
      reject_reason: null,
    },
  ];
  const response = await fetch(`${env.LIVE_E2E_SUPABASE_URL}/rest/v1/rpc/ingest_mobile_snapshot`, {
    method: 'POST',
    headers: {
      apikey: anonKey!,
      authorization: `Bearer ${anonKey!}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_token_hash: sha256(token),
      p_schema_version: value.schema_version,
      p_snapshot_id: value.snapshot_id,
      p_request_id: value.request_id,
      p_client_type: value.client.type,
      p_client_version: value.client.version,
      p_captured_at: new Date(value.captured_at).toISOString(),
      p_request_hash: sha256(canonicalJson(value)),
      p_sources: value.sources.map((source) => ({
        ...source,
        captured_at: source.captured_at ? new Date(source.captured_at).toISOString() : null,
      })),
      p_records: rpcRecords,
    }),
  });
  if (!response.ok)
    throw new Error(`Synthetic raw snapshot seed failed with HTTP ${response.status}.`);
  const result = (await response.json()) as { code?: string; status?: string };
  if (result.code || result.status !== 'accepted') {
    throw new Error(
      `Synthetic raw snapshot seed violated the accepted-ingest invariant (${result.code ?? result.status ?? 'no result'}).`,
    );
  }
}

async function waitForSnapshot(
  deviceId: string,
  after: string,
  timeoutMs = 5 * 60_000,
): Promise<RawSnapshot> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await protectedStagingRows<RawSnapshot>('mobile_snapshots', {
      select:
        'id,snapshot_id,request_id,device_id,received_at,received_count,client_type,client_version,status',
      device_id: `eq.${deviceId}`,
      received_at: `gt.${after}`,
      received_count: 'eq.0',
      client_type: 'eq.ios-shortcut',
      order: 'received_at.asc',
      limit: '1',
    });
    if (rows[0]) return rows[0];
    await new Promise((done) => setTimeout(done, 1_000));
  }
  throw new Error(
    'No empty synthetic snapshot arrived from the paired Apple Shortcut before timeout.',
  );
}

async function confirmShortcutRun(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Apple Shortcut acceptance requires a visible interactive operator confirmation.',
    );
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question(
      'After running the configured staging Apple Shortcut with an empty synthetic fixture, type SHORTCUT RUN CONFIRMED: ',
    );
    expect(answer.trim()).toBe('SHORTCUT RUN CONFIRMED');
  } finally {
    terminal.close();
  }
}

test('AI-28 mobile Shortcut staging acceptance', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  if (
    !anonKey ||
    !candidateSha ||
    !/^[a-f0-9]{40}$/i.test(candidateSha) ||
    !candidateTreeSha ||
    !/^[a-f0-9]{40}$/i.test(candidateTreeSha) ||
    !pullRequestNumber ||
    !/^[1-9][0-9]{0,8}$/.test(pullRequestNumber) ||
    !deploymentRunId ||
    !/^[1-9][0-9]{0,19}$/.test(deploymentRunId) ||
    !mobileResultPath.startsWith(resultDirectory)
  ) {
    throw new Error('Mobile staging acceptance metadata is incomplete or outside test-results/.');
  }

  const mfaRoutes: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      const url = new URL(frame.url());
      if (url.pathname === '/mfa') mfaRoutes.push(url.href);
    } catch {
      // Only real top-level MFA navigation counts toward this acceptance.
    }
  });
  await page.goto('/login');
  if (env.LIVE_E2E_EMAIL && env.LIVE_E2E_PASSWORD) {
    await page.getByLabel('Email').fill(env.LIVE_E2E_EMAIL);
    await page.getByLabel('Password').fill(env.LIVE_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
    process.stdout.write('\nComplete sign-in MFA in the visible staging browser.\n');
  } else {
    process.stdout.write(
      '\nSign into staging and complete Microsoft Authenticator in this visible browser.\n',
    );
  }
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  expect(mfaRoutes.length, 'Initial sign-in must observe a real MFA route.').toBeGreaterThan(0);

  const runTag = randomUUID();
  const deviceLabel = `AI28 synthetic ${runTag.slice(0, 8)}`;
  await page.goto('/data-sources');
  await page.getByLabel('Device name').fill(deviceLabel);
  const beforePairingMfa = mfaRoutes.length;
  const deviceResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/apple-bridge/device' &&
      response.request().method() === 'POST',
    { timeout: 5 * 60_000 },
  );
  await page.getByRole('button', { name: 'Set up Apple Shortcut bridge' }).click();
  await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
  expect(mfaRoutes.length).toBeGreaterThan(beforePairingMfa);
  process.stdout.write(
    '\nPairing MFA checkpoint: complete the fresh challenge in this visible staging browser.\n',
  );
  await expect(page).toHaveURL(/\/data-sources\?resume=apple_bridge/, { timeout: 5 * 60_000 });
  const deviceResponse = await deviceResponsePromise;
  expect(deviceResponse.status()).toBe(201);
  const deviceResult = (await deviceResponse.json()) as {
    device?: { id?: string };
    token?: string;
  };
  const deviceId = deviceResult.device?.id;
  const token = deviceResult.token;
  expect(deviceId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(token?.length ?? 0).toBeGreaterThan(20);
  await expect(
    page.getByText('Device created. Copy this token into the Shortcut now; it is shown only once.'),
  ).toBeVisible();

  const shortcutStartedAt = new Date().toISOString();
  process.stdout.write(
    '\nOperator checkpoint: copy the one-time token shown in this browser into a staging Apple Shortcut configured with an empty synthetic fixture (sources=[], records=[], attachments=[]), then run it. Do not use personal calendar or reminder data and do not send the token here.\n',
  );
  const shortcutSnapshot = await waitForSnapshot(deviceId!, shortcutStartedAt);
  expect(shortcutSnapshot.status).toBe('accepted');
  expect(shortcutSnapshot.client_version).toBe('1.0.0');
  const shortcutSources = await protectedStagingRows<{ id: string }>('mobile_snapshot_sources', {
    select: 'id',
    snapshot_internal_id: `eq.${shortcutSnapshot.id}`,
  });
  const shortcutRecords = await protectedStagingRows<{ id: string }>('mobile_ingestion_records', {
    select: 'id',
    snapshot_internal_id: `eq.${shortcutSnapshot.id}`,
  });
  expect(shortcutSources).toHaveLength(0);
  expect(shortcutRecords).toHaveLength(0);
  await confirmShortcutRun();

  const devices = await ownerRows<{ id: string; user_id: string; revoked_at: string | null }>(
    page,
    'apple_bridge_devices',
    { select: 'id,user_id,revoked_at', id: `eq.${deviceId}` },
  );
  expect(devices).toHaveLength(1);
  expect(devices[0]?.revoked_at).toBeNull();
  const userId = devices[0]!.user_id;
  const freshnessFilter = {
    select: 'state,last_success_at',
    user_id: `eq.${userId}`,
    source: 'eq.apple_calendar',
  };

  const staleEnvelope = envelope([], false);
  const staleResult = await mobileRequest(token!, JSON.stringify(staleEnvelope));
  expect(staleResult.status).toBe(202);
  const staleRows = await ownerRows<{ state: string }>(page, 'data_freshness', freshnessFilter);
  expect(staleRows).toHaveLength(1);
  expect(staleRows[0]?.state).toBe('stale');

  const modifiedUnchanged = new Date(Date.now() - 120_000).toISOString();
  const modifiedChanged = new Date(Date.now() - 60_000).toISOString();
  const titlePrefix = `AI28_SYNTH_${runTag}`;
  const firstEvent = eventRecord(`${titlePrefix}_changed_v1`, `${runTag}-event-a`, modifiedChanged);
  const stableEvent = eventRecord(`${titlePrefix}_stable`, `${runTag}-event-b`, modifiedUnchanged);
  const validEnvelope = envelope([firstEvent, stableEvent]);
  const validResult = await mobileRequest(token!, JSON.stringify(validEnvelope));
  expect(validResult.status).toBe(202);
  expect(validResult.body.adaptation).toMatchObject({ adapted: 2, duplicate: 0, rejected: 0 });
  const validSnapshotRows = await protectedStagingRows<RawSnapshot>('mobile_snapshots', {
    select:
      'id,snapshot_id,request_id,device_id,received_at,received_count,client_type,client_version,status',
    device_id: `eq.${deviceId}`,
    snapshot_id: `eq.${validEnvelope.snapshot_id}`,
  });
  expect(validSnapshotRows).toHaveLength(1);
  const validRaw = validSnapshotRows[0]!;
  const rawRecords = await protectedStagingRows<{ id: string; record_id: string }>(
    'mobile_ingestion_records',
    {
      select: 'id,record_id',
      snapshot_internal_id: `eq.${validRaw.id}`,
      record_id: `eq.${firstEvent.record_id}`,
    },
  );
  expect(rawRecords).toHaveLength(1);
  const provenance = await protectedStagingRows<{
    id: string;
    status: string;
    derived_row_id: string | null;
  }>('mobile_record_adaptations', {
    select: 'id,status,derived_row_id',
    record_internal_id: `eq.${rawRecords[0]!.id}`,
    adapter_name: 'eq.calendar',
    adapter_version: 'eq.v1',
  });
  expect(provenance).toHaveLength(1);
  expect(provenance[0]).toMatchObject({ status: 'adapted' });
  const canonical = await ownerRows<{ id: string; raw_record_id: string }>(
    page,
    'mobile_calendar_event_items',
    {
      select: 'id,raw_record_id',
      user_id: `eq.${userId}`,
      raw_record_id: `eq.${rawRecords[0]!.id}`,
    },
  );
  expect(canonical).toHaveLength(1);
  expect(canonical[0]?.id).toBe(provenance[0]?.derived_row_id);
  const canonicalBeforeReplay = await ownerRows<{ id: string }>(
    page,
    'mobile_calendar_event_items',
    {
      select: 'id',
      user_id: `eq.${userId}`,
      title: `like.${titlePrefix}*`,
    },
  );
  expect(canonicalBeforeReplay).toHaveLength(2);

  const replayResult = await mobileRequest(token!, JSON.stringify(validEnvelope));
  expect(replayResult.status).toBe(200);
  expect(replayResult.body.replay).toBe(true);
  const canonicalAfterReplay = await ownerRows<{ id: string }>(
    page,
    'mobile_calendar_event_items',
    {
      select: 'id',
      user_id: `eq.${userId}`,
      title: `like.${titlePrefix}*`,
    },
  );
  expect(canonicalAfterReplay.map(({ id }) => id).sort()).toEqual(
    canonicalBeforeReplay.map(({ id }) => id).sort(),
  );

  const updatedEvent = eventRecord(
    `${titlePrefix}_changed_v2`,
    firstEvent.external_id,
    new Date().toISOString(),
  );
  const updatedStableEvent = { ...stableEvent, record_id: randomUUID() };
  const updatedEnvelope = envelope([updatedEvent, updatedStableEvent]);
  const updatedResult = await mobileRequest(token!, JSON.stringify(updatedEnvelope));
  expect(updatedResult.status).toBe(202);
  expect(updatedResult.body.adaptation).toMatchObject({ adapted: 1, duplicate: 1, rejected: 0 });
  const canonicalAfterUpdate = await ownerRows<{ id: string }>(
    page,
    'mobile_calendar_event_items',
    {
      select: 'id',
      user_id: `eq.${userId}`,
      title: `like.${titlePrefix}*`,
    },
  );
  expect(canonicalAfterUpdate).toHaveLength(3);
  const freshRows = await ownerRows<{ state: string; last_success_at: string | null }>(
    page,
    'data_freshness',
    freshnessFilter,
  );
  expect(freshRows).toHaveLength(1);
  expect(freshRows[0]?.state).toBe('fresh');

  const wrongSchemaEnvelope = { ...envelope([]), schema_version: 2 };
  const wrongSchemaResult = await mobileRequest(token!, JSON.stringify(wrongSchemaEnvelope));
  expect(wrongSchemaResult.status).toBe(400);
  const malformedResult = await mobileRequest(token!, '{');
  expect(malformedResult.status).toBe(400);
  const oversizedBody = `{"padding":"${'x'.repeat(8 * 1024 * 1024)}"}`;
  const oversizedResult = await mobileRequest(token!, oversizedBody);
  expect(oversizedResult.status).toBe(413);
  const wrongTokenEnvelope = envelope([]);
  const wrongTokenResult = await mobileRequest(
    `${randomUUID()}-invalid-token`,
    JSON.stringify(wrongTokenEnvelope),
  );
  expect(wrongTokenResult.status).toBe(401);
  const rejectedInvalidSnapshots = await protectedStagingRows<{ id: string }>('mobile_snapshots', {
    select: 'id',
    device_id: `eq.${deviceId}`,
    snapshot_id: `in.(${wrongSchemaEnvelope.snapshot_id},${wrongTokenEnvelope.snapshot_id})`,
  });
  expect(rejectedInvalidSnapshots).toHaveLength(0);

  const retryEvent = eventRecord(
    `${titlePrefix}_interrupted`,
    `${runTag}-event-retry`,
    new Date().toISOString(),
  );
  const retryEnvelope = envelope([retryEvent]);
  await seedAcceptedRawBeforeAdaptation(token!, retryEnvelope);
  const retryResult = await mobileRequest(token!, JSON.stringify(retryEnvelope));
  expect(retryResult.status).toBe(200);
  expect(retryResult.body.replay).toBe(true);
  expect(retryResult.body.adaptation).toMatchObject({ adapted: 1, duplicate: 0, rejected: 0 });
  const retrySnapshots = await protectedStagingRows<RawSnapshot>('mobile_snapshots', {
    select:
      'id,snapshot_id,request_id,device_id,received_at,received_count,client_type,client_version,status',
    device_id: `eq.${deviceId}`,
    snapshot_id: `eq.${retryEnvelope.snapshot_id}`,
  });
  expect(retrySnapshots).toHaveLength(1);
  const retryRawRows = await protectedStagingRows<{ id: string }>('mobile_ingestion_records', {
    select: 'id',
    snapshot_internal_id: `eq.${retrySnapshots[0]!.id}`,
  });
  expect(retryRawRows).toHaveLength(1);
  const retryProvenance = await protectedStagingRows<{
    id: string;
    status: string;
    derived_row_id: string | null;
  }>('mobile_record_adaptations', {
    select: 'id,status,derived_row_id',
    record_internal_id: `eq.${retryRawRows[0]!.id}`,
    adapter_name: 'eq.calendar',
    adapter_version: 'eq.v1',
  });
  expect(retryProvenance).toHaveLength(1);
  expect(retryProvenance[0]?.status).toBe('adapted');
  const retryCanonical = await ownerRows<{ id: string }>(page, 'mobile_calendar_event_items', {
    select: 'id',
    user_id: `eq.${userId}`,
    raw_record_id: `eq.${retryRawRows[0]!.id}`,
  });
  expect(retryCanonical).toHaveLength(1);
  expect(retryCanonical[0]?.id).toBe(retryProvenance[0]?.derived_row_id);

  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: deviceLabel }) });
  const beforeRevokeMfa = mfaRoutes.length;
  await card.getByRole('button', { name: 'Revoke Apple bridge' }).click();
  await card.getByRole('button', { name: 'Confirm Apple revoke' }).click();
  await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
  expect(mfaRoutes.length).toBeGreaterThan(beforeRevokeMfa);
  process.stdout.write(
    '\nRevocation MFA checkpoint: complete the fresh challenge in this visible staging browser.\n',
  );
  await expect(page).toHaveURL(/\/data-sources\?resume=source_revoke/, { timeout: 5 * 60_000 });
  await expect(
    page.getByText(
      'Source revoked. Existing retained data is unchanged, and future syncs are blocked.',
    ),
  ).toBeVisible();
  const revokedRequestEnvelope = envelope([]);
  const revokedResult = await mobileRequest(token!, JSON.stringify(revokedRequestEnvelope));
  expect(revokedResult.status).toBe(401);
  const revokedWrites = await protectedStagingRows<{ id: string }>('mobile_snapshots', {
    select: 'id',
    device_id: `eq.${deviceId}`,
    snapshot_id: `eq.${revokedRequestEnvelope.snapshot_id}`,
  });
  expect(revokedWrites).toHaveLength(0);

  const releaseGate = (await import('../../infrastructure/scripts/release-gate.js')) as unknown as {
    MobileShortcutStagingEvidenceSchema: { parse(value: unknown): unknown };
  };
  const evidence = releaseGate.MobileShortcutStagingEvidenceSchema.parse({
    schemaVersion: 1,
    state: 'MOBILE_SHORTCUTS_STAGING_ACCEPTED',
    acceptanceProfile: 'mobile-shortcuts',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: Number(pullRequestNumber),
    deploymentRunId,
    stagingOrigin: stagingTarget.origin,
    humanMfa: 'user-completed',
    checks: {
      supportedDevicePairing: 'passed',
      validSnapshotProvenance: 'passed',
      replayNoDuplicateCanonicalRows: 'passed',
      updatedSnapshotOnlyChanges: 'passed',
      revokedDeviceRejectedWithoutWrites: 'passed',
      invalidInputsRejected: 'passed',
      interruptedIngestRecovery: 'passed',
      freshnessTransitions: 'passed',
    },
    proof: {
      deviceId,
      shortcutRun: 'operator-confirmed',
      pairingMfa: 'user-completed',
      revocationMfa: 'user-completed',
      pairingRequestId: shortcutSnapshot.request_id,
      validRequestId: validResult.correlationId,
      replayRequestId: replayResult.correlationId,
      updatedRequestId: updatedResult.correlationId,
      revokedRequestId: revokedResult.correlationId,
      wrongSchemaRequestId: wrongSchemaResult.correlationId,
      malformedRequestId: malformedResult.correlationId,
      oversizedRequestId: oversizedResult.correlationId,
      wrongTokenRequestId: wrongTokenResult.correlationId,
      retryRequestId: retryResult.correlationId,
      rawSnapshotId: validRaw.id,
      canonicalRecordId: canonical[0]!.id,
      provenanceRecordId: provenance[0]!.id,
      replayCreatedCanonicalRows: 0,
      updatedChangedRecordCount: updatedResult.body.adaptation!.adapted,
      updatedUnchangedRecordCount: updatedResult.body.adaptation!.duplicate,
      revokedSubmissionStatus: revokedResult.status,
      revokedSubmissionCreatedRows: 0,
      invalidStatuses: {
        wrongSchema: wrongSchemaResult.status,
        malformed: malformedResult.status,
        oversized: oversizedResult.status,
        wrongToken: wrongTokenResult.status,
      },
      retryCreatedCanonicalRows: retryCanonical.length,
      freshnessStaleObserved: true,
      freshnessRecoveredAt: freshRows[0]!.last_success_at!,
    },
    correlationIds: [
      shortcutSnapshot.request_id,
      validResult.correlationId,
      replayResult.correlationId,
      updatedResult.correlationId,
      revokedResult.correlationId,
      wrongSchemaResult.correlationId,
      malformedResult.correlationId,
      oversizedResult.correlationId,
      wrongTokenResult.correlationId,
      retryResult.correlationId,
    ],
    acceptedAt: new Date().toISOString(),
  });
  await mkdir(dirname(mobileResultPath), { recursive: true });
  await writeFile(mobileResultPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
});
