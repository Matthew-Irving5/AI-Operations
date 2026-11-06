import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHostedStagingSuiteEvidence } from './release-gate.js';

export function combineCareerAuthStagingResults(careerInput: unknown, authInput: unknown) {
  const career = createHostedStagingSuiteEvidence(careerInput);
  const auth = createHostedStagingSuiteEvidence(authInput);
  if (career.acceptanceProfile !== 'career' || auth.acceptanceProfile !== 'auth-browser') {
    throw new Error('Expected separate real Career and auth-browser results.');
  }
  return createHostedStagingSuiteEvidence({
    schemaVersion: 1,
    state: 'CAREER_AUTH_BROWSER_STAGING_ACCEPTED',
    acceptanceProfile: 'career-auth-browser',
    candidateSha: career.candidateSha,
    candidateTreeSha: career.candidateTreeSha,
    pullRequestNumber: career.pullRequestNumber,
    deploymentRunId: career.deploymentRunId,
    stagingOrigin: career.stagingOrigin,
    humanMfa: career.humanMfa,
    checks: career.checks,
    correlationIds: career.correlationIds,
    acceptedAt: career.acceptedAt,
    careerEvidence: career,
    authBrowserEvidence: auth,
  });
}

async function main() {
  const [careerPath, authPath, outputPath] = process.argv.slice(2);
  if (!careerPath || !authPath || !outputPath)
    throw new Error('Provide Career JSON, auth-browser JSON and output JSON paths.');
  const [career, auth] = await Promise.all([
    readFile(careerPath, 'utf8'),
    readFile(authPath, 'utf8'),
  ]);
  await writeFile(
    outputPath,
    JSON.stringify(combineCareerAuthStagingResults(JSON.parse(career), JSON.parse(auth)), null, 2) +
      '\n',
    { flag: 'wx' },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Career result combination failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
