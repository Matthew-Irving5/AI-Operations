import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  fingerprintGoogleResourceId,
  parseGoogleOAuthStagingEvidence,
  writeGoogleOAuthStagingEvidence,
} from './google-oauth-staging-acceptance.js';

const acceptedEvidence = () => ({
  schemaVersion: 1,
  state: 'GOOGLE_OAUTH_STAGING_ACCEPTED',
  acceptanceProfile: 'google-oauth',
  candidateSha: '1'.repeat(40),
  candidateTreeSha: '2'.repeat(40),
  pullRequestNumber: 179,
  deploymentRunId: '39772633090',
  stagingOrigin: 'https://ai-operations-staging.ai-operations.workers.dev',
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
    selectedFile: fingerprintGoogleResourceId('selected-test-file'),
    unselectedFile: fingerprintGoogleResourceId('unselected-test-file'),
    deselectedFile: fingerprintGoogleResourceId('deselected-test-file'),
  },
  correlationIds: ['google-oauth-acceptance-probe'],
  acceptedAt: '2026-10-22T12:00:00.000Z',
});

test('Google OAuth staging evidence requires the exact candidate and every ticket-specific pass', () => {
  const evidence = parseGoogleOAuthStagingEvidence(acceptedEvidence());
  assert.equal(evidence.acceptanceProfile, 'google-oauth');
  assert.equal(evidence.checks.selectedOnlySync, 'passed');
  assert.equal(evidence.checks.reconnectRecoveredSync, 'passed');

  const missingProof = acceptedEvidence();
  delete (missingProof.checks as Partial<typeof missingProof.checks>).unrelatedResourceUntouched;
  assert.throws(() => parseGoogleOAuthStagingEvidence(missingProof));

  const wrongCandidate = { ...acceptedEvidence(), candidateSha: 'not-the-candidate' };
  assert.throws(() => parseGoogleOAuthStagingEvidence(wrongCandidate));
});

test('Google OAuth evidence rejects identity, provider data, secrets, and raw resource IDs', () => {
  const withAccount = { ...acceptedEvidence(), accountEmail: 'person@example.test' };
  assert.throws(() => parseGoogleOAuthStagingEvidence(withAccount));

  const withToken = {
    ...acceptedEvidence(),
    checks: { ...acceptedEvidence().checks, accessToken: 'secret-token' },
  };
  assert.throws(() => parseGoogleOAuthStagingEvidence(withToken));

  const rawResourceId = {
    ...acceptedEvidence(),
    resourceFingerprints: {
      selectedFile: 'drive-file-id',
      unselectedFile: fingerprintGoogleResourceId('unselected-test-file'),
      deselectedFile: fingerprintGoogleResourceId('deselected-test-file'),
    },
  };
  assert.throws(() => parseGoogleOAuthStagingEvidence(rawResourceId));
  assert.equal(
    fingerprintGoogleResourceId('selected-test-file'),
    fingerprintGoogleResourceId('selected-test-file'),
  );
  assert.notEqual(
    fingerprintGoogleResourceId('selected-test-file'),
    fingerprintGoogleResourceId('unselected-test-file'),
  );
});

test('Google OAuth evidence writer emits only the validated exact-candidate envelope', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai27-google-evidence-'));
  const path = join(directory, 'acceptance.json');
  try {
    await writeGoogleOAuthStagingEvidence(path, acceptedEvidence());
    const written = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    assert.equal(written.acceptanceProfile, 'google-oauth');
    assert.equal(written.candidateSha, '1'.repeat(40));
    assert.equal(Object.hasOwn(written, 'accountEmail'), false);
    assert.equal(Object.hasOwn(written, 'accessToken'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
