import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  Ai44ActionProofSchema,
  MobileShortcutStagingEvidenceSchema,
  createHostedStagingSuiteEvidence,
} from './release-gate.js';

export function combineMobileActionResults(mobileResult: unknown, actionResult: unknown) {
  const mobile = MobileShortcutStagingEvidenceSchema.parse(mobileResult);
  const action = Ai44ActionProofSchema.parse(actionResult);
  return createHostedStagingSuiteEvidence({
    schemaVersion: 1,
    state: 'MOBILE_ACTION_STAGING_ACCEPTED',
    acceptanceProfile: 'mobile-shortcuts-action',
    candidateSha: mobile.candidateSha,
    candidateTreeSha: mobile.candidateTreeSha,
    pullRequestNumber: mobile.pullRequestNumber,
    deploymentRunId: mobile.deploymentRunId,
    stagingOrigin: mobile.stagingOrigin,
    humanMfa: 'user-completed',
    checks: { mobileShortcutJourney: 'passed', canonicalActionJourney: 'passed' },
    mobileEvidence: mobile,
    actionEvidence: action,
    correlationIds: [...mobile.correlationIds, ...action.correlationIds],
    acceptedAt: new Date().toISOString(),
  });
}

async function main() {
  const [mobilePath, actionPath, outputPath] = process.argv.slice(2);
  if (!mobilePath || !actionPath || !outputPath) {
    throw new Error(
      'Usage: mobile-action-staging-result <mobile-result.json> <action-result.json> <output.json>',
    );
  }
  const result = combineMobileActionResults(
    JSON.parse(await readFile(mobilePath, 'utf8')),
    JSON.parse(await readFile(actionPath, 'utf8')),
  );
  await writeFile(outputPath, `${JSON.stringify(result)}\n`, { flag: 'wx' });
  process.stdout.write('Mobile and action tests passed on the same staging candidate.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => {
    process.stderr.write(
      'Mobile/action test results are missing, invalid, or belong to different candidates.\n',
    );
    process.exitCode = 1;
  });
}
