import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  GOOGLE_ACCOUNT_EMAILS,
  GOOGLE_ROLE_SCOPES,
} from '../../supabase/functions/_shared/google-account-config';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import {
  fingerprintGoogleResourceId,
  writeGoogleOAuthStagingEvidence,
} from '../../infrastructure/scripts/google-oauth-staging-acceptance.js';

const env = parseLiveE2eEnvironment(process.env, 'auth-acceptance');
const selectedFileId = process.env.LIVE_E2E_GOOGLE_SELECTED_FILE_ID;
const unselectedFileId = process.env.LIVE_E2E_GOOGLE_UNSELECTED_FILE_ID;
const selectedFileName = process.env.LIVE_E2E_GOOGLE_SELECTED_FILE_NAME;
const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA?.toLowerCase();
const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA?.toLowerCase();
const pullRequestNumber = Number(process.env.LIVE_E2E_PULL_REQUEST_NUMBER);
const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;

type ConnectionRow = {
  id: string;
  user_id: string;
  account_role: string;
  account_label: string;
  environment: string;
  status: string;
  sync_enabled: boolean;
  scopes: string[];
};
type DriveRow = {
  id: string;
  drive_file_id: string;
  mime_type: string;
  selected: boolean;
  checksum: string | null;
  modified_at: string | null;
  updated_at: string;
  deleted_at: string | null;
};
type SyncRequestRow = { id: string; idempotency_key: string; status: string; request_hash: string };
type FreshnessRow = { source: string; state: string; last_success_at: string | null };

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Google OAuth acceptance requires ${name}.`);
  return value;
}

function requireProof(condition: boolean, invariant: string): asserts condition {
  if (!condition) throw new Error(`Google OAuth acceptance failed: ${invariant}.`);
}

async function serviceRows<T>(
  table:
    | 'connections'
    | 'google_drive_files'
    | 'google_sync_requests'
    | 'connection_credentials'
    | 'data_freshness',
  query: URLSearchParams,
): Promise<T[]> {
  const response = await fetch(
    `${env.LIVE_E2E_SUPABASE_URL}/rest/v1/${table}?${query.toString()}`,
    {
      headers: {
        apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: 'no-store',
    },
  );
  if (!response.ok)
    throw new Error(`Google acceptance read of ${table} failed (${response.status}).`);
  return (await response.json()) as T[];
}

async function connectionRows(): Promise<ConnectionRow[]> {
  const query = new URLSearchParams({
    select: 'id,user_id,account_role,account_label,environment,status,sync_enabled,scopes',
    provider: 'eq.google',
    account_role: 'eq.personal_data_source',
    environment: 'eq.staging',
    account_label: `eq.${GOOGLE_ACCOUNT_EMAILS.personal_data_source}`,
  });
  return serviceRows<ConnectionRow>('connections', query);
}

async function driveRows(connectionId: string, fileId: string): Promise<DriveRow[]> {
  const query = new URLSearchParams({
    select: 'id,drive_file_id,mime_type,selected,checksum,modified_at,updated_at,deleted_at',
    connection_id: `eq.${connectionId}`,
    drive_file_id: `eq.${fileId}`,
  });
  return serviceRows<DriveRow>('google_drive_files', query);
}

async function freshnessRows(userId: string): Promise<FreshnessRow[]> {
  const query = new URLSearchParams({
    select: 'source,state,last_success_at',
    user_id: `eq.${userId}`,
    source: 'eq.google_drive',
  });
  return serviceRows<FreshnessRow>('data_freshness', query);
}

async function syncRequestRows(
  connectionId: string,
  idempotencyKey: string,
): Promise<SyncRequestRow[]> {
  const query = new URLSearchParams({
    select: 'id,idempotency_key,status,request_hash',
    connection_id: `eq.${connectionId}`,
    idempotency_key: `eq.${idempotencyKey}`,
  });
  return serviceRows<SyncRequestRow>('google_sync_requests', query);
}

async function signInWithManualMfa(page: Page): Promise<boolean> {
  let sawMfa = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      if (new URL(frame.url()).pathname === '/mfa') sawMfa = true;
    } catch {
      // A non-URL navigation cannot satisfy the MFA proof.
    }
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  if (env.LIVE_E2E_EMAIL && env.LIVE_E2E_PASSWORD) {
    await page.getByLabel('Email').fill(env.LIVE_E2E_EMAIL);
    await page.getByLabel('Password').fill(env.LIVE_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
  }
  process.stdout.write(
    '\nSign into the staging account and complete Microsoft Authenticator in this headed browser. The Google OAuth acceptance will resume after Overview loads.\n',
  );
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  requireProof(sawMfa, 'the real app MFA route was observed');
  return sawMfa;
}

async function completeActionMfa(page: Page, returnPath: RegExp): Promise<void> {
  await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
  process.stdout.write(
    '\nComplete the requested fresh Microsoft Authenticator challenge in this headed browser.\n',
  );
  await expect(page).toHaveURL(returnPath, { timeout: 5 * 60_000 });
}

async function selectDedicatedPickerFile(page: Page): Promise<void> {
  const fileLabel = page.locator('.resource-list label').filter({ hasText: selectedFileName! });
  if ((await fileLabel.count()) > 0 && (await fileLabel.locator('input').isChecked())) {
    await fileLabel.locator('input').uncheck();
    await page.getByRole('button', { name: 'Save selection (fresh MFA required)' }).click();
    await completeActionMfa(page, /\/data-sources(?:\?.*)?$/);
    await expect(page.getByText('Google source selection saved', { exact: false })).toBeVisible();
  }

  const pickerButton = page.getByRole('button', { name: 'Choose Drive files' });
  await expect(pickerButton).toBeEnabled();
  await pickerButton.click();
  process.stdout.write(
    '\nIn the Google Picker, select only the dedicated synthetic Drive file for this acceptance run.\n',
  );
  await expect(fileLabel.locator('input')).toBeChecked({ timeout: 5 * 60_000 });
}

async function savePickerSelection(page: Page, connectionId: string): Promise<void> {
  const selectionRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/connections/sources',
    { timeout: 7 * 60_000 },
  );
  await page.getByRole('button', { name: 'Save selection (fresh MFA required)' }).click();
  await completeActionMfa(page, /\/data-sources(?:\?.*)?$/);
  const request = await selectionRequestPromise;
  const body = request.postDataJSON() as {
    connectionId?: string;
    selectedDriveFileIds?: unknown;
  };
  requireProof(
    body.connectionId === connectionId,
    'Picker selection was saved for the connected account',
  );
  requireProof(
    Array.isArray(body.selectedDriveFileIds) && body.selectedDriveFileIds.includes(selectedFileId),
    'the dedicated Picker file ID was persisted as selected',
  );
  requireProof(
    Array.isArray(body.selectedDriveFileIds) &&
      !body.selectedDriveFileIds.includes(unselectedFileId),
    'the unrelated file was not selected',
  );
  await expect(page.getByText('Google source selection saved', { exact: false })).toBeVisible();
}

async function runSync(
  page: Page,
  connectionId: string,
): Promise<{
  key: string;
  body: Record<string, unknown>;
}> {
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/connections/sync',
    { timeout: 5 * 60_000 },
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/connections/sync',
    { timeout: 5 * 60_000 },
  );
  await page.getByRole('button', { name: 'Google Sync now' }).click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  const requestBody = request.postDataJSON() as { connectionId?: string; idempotencyKey?: string };
  requireProof(
    requestBody.connectionId === connectionId,
    'sync targeted the selected Google account',
  );
  requireProof(Boolean(requestBody.idempotencyKey), 'sync included its idempotency key');
  const body = (await response.json()) as Record<string, unknown>;
  requireProof(response.ok() && body.ok === true, 'selected Google sync completed');
  return { key: requestBody.idempotencyKey!, body };
}

async function waitForOperatorSync(
  page: Page,
  connectionId: string,
): Promise<{
  key: string;
  body: Record<string, unknown>;
}> {
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/connections/sync',
    { timeout: 10 * 60_000 },
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/connections/sync',
    { timeout: 10 * 60_000 },
  );
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  const requestBody = request.postDataJSON() as { connectionId?: string; idempotencyKey?: string };
  requireProof(
    requestBody.connectionId === connectionId,
    'operator sync targeted the selected Google account',
  );
  requireProof(Boolean(requestBody.idempotencyKey), 'operator sync included its idempotency key');
  const body = (await response.json()) as Record<string, unknown>;
  requireProof(response.ok() && body.ok === true, 'provider update sync completed');
  return { key: requestBody.idempotencyKey!, body };
}

async function waitForNextRateLimitWindow(): Promise<void> {
  const nextWindow = Math.ceil(Date.now() / 60_000) * 60_000 + 2_000;
  const delay = Math.max(0, nextWindow - Date.now());
  if (delay > 0) {
    process.stdout.write(
      `Waiting ${Math.ceil(delay / 1000)}s for the next staging Google sync quota window.\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function replaySync(
  page: Page,
  connectionId: string,
  key: string,
  originalBody: Record<string, unknown>,
) {
  const replay = await page.evaluate(
    async (body) => {
      const response = await fetch('/api/connections/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    { connectionId, provider: 'google', idempotencyKey: key },
  );
  requireProof(replay.status === 200, 'idempotency replay returned the settled sync');
  requireProof(
    JSON.stringify(replay.body) === JSON.stringify(originalBody),
    'idempotency replay returned the original result without a second sync',
  );
  const requests = await syncRequestRows(connectionId, key);
  requireProof(
    requests.length === 1 && requests[0]?.status === 'succeeded',
    'one sync request was persisted',
  );
  return requests[0]!.id;
}

test('Google OAuth exact-candidate staging acceptance proves Picker, selected sync and recovery', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(35 * 60_000);
  requireProof(env.LIVE_E2E_BASE_URL === stagingTarget.origin, 'fixed staging origin was selected');
  const selectedId = required(selectedFileId, 'LIVE_E2E_GOOGLE_SELECTED_FILE_ID');
  const unselectedId = required(unselectedFileId, 'LIVE_E2E_GOOGLE_UNSELECTED_FILE_ID');
  required(selectedFileName, 'LIVE_E2E_GOOGLE_SELECTED_FILE_NAME');
  requireProof(
    selectedId !== unselectedId,
    'dedicated selected and unselected fixtures are distinct',
  );
  required(candidateSha, 'LIVE_E2E_CANDIDATE_SHA');
  required(candidateTreeSha, 'LIVE_E2E_CANDIDATE_TREE_SHA');
  required(deploymentRunId, 'LIVE_E2E_DEPLOYMENT_RUN_ID');
  requireProof(pullRequestNumber > 0, 'candidate PR number is present');

  const manualMfaChallengeObserved = await signInWithManualMfa(page);
  await page.goto('/data-sources');
  await expect(page.getByRole('heading', { name: 'Data Sources' })).toBeVisible();
  const connections = await connectionRows();
  requireProof(
    connections.length === 1,
    'one staging personal Google connection matches the locked account',
  );
  let connection = connections[0]!;
  requireProof(
    connection.account_role === 'personal_data_source',
    'connection role is personal_data_source',
  );
  requireProof(
    connection.account_label === GOOGLE_ACCOUNT_EMAILS.personal_data_source,
    'expected personal account matches',
  );
  requireProof(connection.environment === 'staging', 'connection belongs to staging');
  requireProof(
    [...connection.scopes].sort().join('|') ===
      [...GOOGLE_ROLE_SCOPES.personal_data_source].sort().join('|'),
    'connection has the exact approved personal-data scopes',
  );
  requireProof(
    connection.status === 'connected' && connection.sync_enabled,
    'connection is ready to sync',
  );
  await expect(page.locator(`#google-${connection.id}`)).toBeVisible();

  const pickerConfig = await page.request.get(
    `/api/connections/sources?connectionId=${encodeURIComponent(connection.id)}&operation=picker_config`,
  );
  requireProof(pickerConfig.ok(), 'Picker configuration is available for staging');
  await selectDedicatedPickerFile(page);
  await savePickerSelection(page, connection.id);

  const firstSync = await runSync(page, connection.id);
  const beforeUpdate = await driveRows(connection.id, selectedId);
  requireProof(
    beforeUpdate.length === 1 &&
      beforeUpdate[0]?.selected === true &&
      beforeUpdate[0].mime_type === 'application/vnd.google-apps.document',
    'the selected synthetic Google document metadata was persisted',
  );
  const untouchedBefore = await driveRows(connection.id, unselectedId);
  requireProof(untouchedBefore.length === 0, 'unselected file metadata was not stored');

  const documentTab = await page.context().newPage();
  await documentTab.goto(
    `https://docs.google.com/document/d/${encodeURIComponent(selectedId)}/edit`,
  );
  process.stdout.write(
    '\nMake one small change to the selected synthetic Google document, save it, return to the AI Operations tab, then click Google Sync now once. The acceptance will continue after that request completes.\n',
  );
  const updateSync = await waitForOperatorSync(page, connection.id);
  await documentTab.close();
  const afterUpdate = await driveRows(connection.id, selectedId);
  requireProof(
    afterUpdate.length === 1 &&
      afterUpdate[0]?.selected === true &&
      afterUpdate[0].id === beforeUpdate[0]?.id &&
      afterUpdate[0].modified_at !== beforeUpdate[0]?.modified_at,
    'one selected-file provider update refreshed the existing metadata row',
  );
  const firstSyncRequestId = await replaySync(page, connection.id, firstSync.key, firstSync.body);
  const updateSyncRows = await syncRequestRows(connection.id, updateSync.key);
  requireProof(
    updateSyncRows.length === 1 && updateSyncRows[0]?.status === 'succeeded',
    'provider update was applied by one sync request',
  );
  const updateSyncRequestId = updateSyncRows[0]!.id;

  const deselectedLabel = page
    .locator('.resource-list label')
    .filter({ hasText: selectedFileName! });
  await deselectedLabel.locator('input').uncheck();
  await page.getByRole('button', { name: 'Save selection (fresh MFA required)' }).click();
  await completeActionMfa(page, /\/data-sources(?:\?.*)?$/);
  const deselected = await driveRows(connection.id, selectedId);
  requireProof(
    deselected.length === 1 &&
      !deselected[0]?.selected &&
      deselected[0]?.id === afterUpdate[0]?.id &&
      deselected[0]?.checksum === afterUpdate[0]?.checksum,
    'selection revoke stopped import while retaining the original provenance row',
  );
  await waitForNextRateLimitWindow();
  const unselectedSync = await page.evaluate(
    async ({ connectionId, idempotencyKey }) => {
      const response = await fetch('/api/connections/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId, provider: 'google', idempotencyKey }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { datasets?: { drive?: { count?: number } } },
      };
    },
    { connectionId: connection.id, idempotencyKey: `ai27:${randomUUID()}` },
  );
  requireProof(unselectedSync.status === 200, 'sync after deselection completed');
  requireProof(
    unselectedSync.body.datasets?.drive?.count === 0,
    'deselected file was not imported again',
  );
  const untouchedAfter = await driveRows(connection.id, unselectedId);
  requireProof(untouchedAfter.length === 0, 'unselected file remained absent after sync');

  const revokeResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/connections/revoke',
    { timeout: 7 * 60_000 },
  );
  await page.getByRole('button', { name: 'Revoke Google' }).click();
  await page.getByRole('button', { name: 'Confirm Google revoke' }).click();
  await completeActionMfa(page, /\/data-sources(?:\?.*)?$/);
  const revokeResponse = await revokeResponsePromise;
  const revokeBody = (await revokeResponse.json()) as {
    provider_revoked?: boolean;
    credential_deleted?: boolean;
  };
  requireProof(
    revokeResponse.ok() &&
      revokeBody.provider_revoked === true &&
      revokeBody.credential_deleted === true,
    'Google confirmed OAuth credential revocation',
  );
  const revokedRows = await connectionRows();
  requireProof(
    revokedRows.length === 1 &&
      revokedRows[0]?.status === 'revoked' &&
      !revokedRows[0]?.sync_enabled,
    'OAuth revocation disabled future sync',
  );
  const remainingCredential = await serviceRows<{ connection_id: string }>(
    'connection_credentials',
    new URLSearchParams({ select: 'connection_id', connection_id: `eq.${connection.id}` }),
  );
  requireProof(remainingCredential.length === 0, 'revoked OAuth credential was removed');
  const freshnessAfterRevoke = await freshnessRows(connection.user_id);
  requireProof(
    freshnessAfterRevoke.some((row) => row.state === 'not_connected'),
    'revocation exposed a degraded freshness state',
  );
  const retainedAfterRevoke = await driveRows(connection.id, selectedId);
  requireProof(
    retainedAfterRevoke.length === 1 && retainedAfterRevoke[0]?.id === afterUpdate[0]?.id,
    'OAuth revocation retained prior Drive provenance',
  );
  await waitForNextRateLimitWindow();
  const rejectedSync = await page.evaluate(
    async ({ connectionId, idempotencyKey }) => {
      const response = await fetch('/api/connections/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId, provider: 'google', idempotencyKey }),
      });
      return { status: response.status, body: (await response.json()) as { code?: string } };
    },
    { connectionId: connection.id, idempotencyKey: `ai27:${randomUUID()}` },
  );
  requireProof(
    rejectedSync.status === 404 && rejectedSync.body.code === 'connection_unavailable',
    'revoked OAuth token cannot sync',
  );

  await page.getByRole('button', { name: 'Reconnect personal Google data' }).click();
  process.stdout.write(
    '\nComplete Google OAuth consent in this headed browser to reconnect the personal data source.\n',
  );
  await expect(page).toHaveURL(/\/data-sources(?:\?.*)?$/, { timeout: 5 * 60_000 });
  const reconnectedRows = await connectionRows();
  requireProof(
    reconnectedRows.length === 1 &&
      reconnectedRows[0]?.status === 'connected' &&
      reconnectedRows[0]?.sync_enabled,
    'Google reconnect restored the source',
  );
  connection = reconnectedRows[0]!;
  requireProof(
    [...connection.scopes].sort().join('|') ===
      [...GOOGLE_ROLE_SCOPES.personal_data_source].sort().join('|'),
    'reconnected account retained the exact approved scopes',
  );

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data Sources' })).toBeVisible();
  await selectDedicatedPickerFile(page);
  await savePickerSelection(page, connection.id);
  const recoverySync = await runSync(page, connection.id);
  const recoveredFile = await driveRows(connection.id, selectedId);
  requireProof(
    recoveredFile.length === 1 && recoveredFile[0]?.selected === true,
    'reconnected sync recovered the selected file',
  );
  const recoveredFreshness = await freshnessRows(connection.user_id);
  requireProof(
    recoveredFreshness.some(
      (row) => row.source === 'google_drive' && row.state === 'fresh' && row.last_success_at,
    ),
    'reconnect restored truthful Drive freshness',
  );
  requireProof(
    (await driveRows(connection.id, unselectedId)).length === 0,
    'unselected resource remained untouched after reconnect',
  );
  const recoveryRequestId = await replaySync(
    page,
    connection.id,
    recoverySync.key,
    recoverySync.body,
  );

  const outputPath = process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH;
  if (!outputPath) throw new Error('Google OAuth acceptance evidence output path is missing.');
  await writeGoogleOAuthStagingEvidence(outputPath, {
    schemaVersion: 1,
    state: 'GOOGLE_OAUTH_STAGING_ACCEPTED',
    acceptanceProfile: 'google-oauth',
    candidateSha: candidateSha!,
    candidateTreeSha: candidateTreeSha!,
    pullRequestNumber,
    deploymentRunId: deploymentRunId!,
    stagingOrigin: stagingTarget.origin,
    humanMfa: 'user-completed',
    checks: {
      accountRole: 'personal_data_source',
      expectedAccountMatched: 'passed',
      approvedScopesMatched: 'passed',
      pickerSelectedDedicatedFile: 'passed',
      selectedOnlySync: 'passed',
      idempotencyReplay: 'passed',
      providerUpdateAppliedOnce: 'passed',
      selectionRevokeStoppedImport: 'passed',
      deselectedProvenanceRetained: 'passed',
      oauthRevokeDegradedWithoutDataLoss: 'passed',
      reconnectRecoveredSync: 'passed',
      freshnessRecovered: 'passed',
      unrelatedResourceUntouched: 'passed',
    },
    resourceFingerprints: {
      selectedFile: fingerprintGoogleResourceId(selectedId),
      unselectedFile: fingerprintGoogleResourceId(unselectedId),
      deselectedFile: fingerprintGoogleResourceId(selectedId),
    },
    correlationIds: [firstSyncRequestId, updateSyncRequestId, recoveryRequestId],
    acceptedAt: new Date().toISOString(),
  });
});
