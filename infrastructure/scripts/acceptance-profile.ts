import { appendFileSync, readFileSync } from 'node:fs';
import { selectHostedAcceptanceProfile } from './release-gate';

const source = process.argv[2];
if (!source)
  throw new Error(
    'Usage: acceptance-profile.ts <changed-files.txt> [auto|targeted|auth-browser|cost-runtime|career|career-auth-browser|procurement]',
  );
const files = readFileSync(source, 'utf8').split(/\r?\n/).filter(Boolean);
const profile = selectHostedAcceptanceProfile(files, process.argv[3] ?? 'auto');

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `acceptance_profile=${profile}\n`);
}
process.stdout.write(`${profile}\n`);
