import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeIntegratedMainPromotion } from './integrated-main-gate.js';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const repo = 'Matthew-Irving5/AI-Operations';
const origin = 'https://ai-operations-staging.ai-operations.workers.dev';

function valid() {
  return {
    repositoryFullName: repo,
    requestedSha: sha,
    currentMainSha: sha,
    mainTreeSha: tree,
    stagingRun: {
      repositoryFullName: repo,
      name: 'Deploy staging',
      path: '.github/workflows/deploy-staging.yml',
      headBranch: 'main',
      headSha: sha,
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'success',
      runId: '40000000000',
      runAttempt: 1,
    },
    evidence: {
      schemaVersion: 2,
      state: 'INTEGRATED_MAIN_STAGING_VERIFIED',
      repositoryFullName: repo,
      mainSha: sha,
      mainTreeSha: tree,
      stagingRunId: '40000000000',
      stagingRunAttempt: 1,
      stagingOrigin: origin,
      checks: {
        migrations: 'passed',
        edgeFunctions: 'passed',
        sourceDrift: 'passed',
        readinessSmoke: 'passed',
      },
    },
  };
}

test('exact successful main staging run authorises the integrated release', () => {
  const evidence = authorizeIntegratedMainPromotion(valid());
  assert.equal(evidence.releaseMode, 'integrated_main');
  assert.equal(evidence.mainSha, sha);
  assert.equal(evidence.mainTreeSha, tree);
  assert.equal(evidence.stagingDeploymentRunId, '40000000000');
});

test('stale main, wrong tree or wrong request SHA cannot be promoted', () => {
  for (const corrupt of [
    (v: ReturnType<typeof valid>) => (v.currentMainSha = 'c'.repeat(40)),
    (v: ReturnType<typeof valid>) => (v.mainTreeSha = 'c'.repeat(40)),
    (v: ReturnType<typeof valid>) => (v.requestedSha = 'd'.repeat(40)),
    (v: ReturnType<typeof valid>) => (v.stagingRun.headSha = 'c'.repeat(40)),
  ]) {
    const input = valid();
    corrupt(input);
    assert.throws(() => authorizeIntegratedMainPromotion(input));
  }
});

test('failed, rerun, wrong branch, repo or staging mode is rejected', () => {
  for (const corrupt of [
    (v: ReturnType<typeof valid>) => (v.stagingRun.conclusion = 'failure'),
    (v: ReturnType<typeof valid>) => (v.stagingRun.event = 'push'),
    (v: ReturnType<typeof valid>) => (v.stagingRun.headBranch = 'candidate'),
    (v: ReturnType<typeof valid>) => (v.stagingRun.repositoryFullName = 'attacker/repo'),
    (v: ReturnType<typeof valid>) => (v.stagingRun.runAttempt = 2),
    (v: ReturnType<typeof valid>) => (v.evidence.stagingRunId = '40000000001'),
    (v: ReturnType<typeof valid>) => (v.evidence.stagingOrigin = 'https://attacker.example'),
    (v: ReturnType<typeof valid>) => (v.evidence.checks.migrations = 'failed'),
    (v: ReturnType<typeof valid>) => (v.evidence.checks.sourceDrift = 'failed'),
  ]) {
    const input = valid();
    corrupt(input);
    assert.throws(() => authorizeIntegratedMainPromotion(input));
  }
});

test('unexpected extra fields and duplicate identities are rejected', () => {
  assert.throws(() => authorizeIntegratedMainPromotion({ ...valid(), injected: 'true' }));
  const input = valid();
  assert.throws(() =>
    authorizeIntegratedMainPromotion({
      ...input,
      evidence: { ...input.evidence, injected: 'true' },
    }),
  );
});
