import { execFileSync } from 'node:child_process';
import { assertRequiredSpecificationsPresent } from './required-specs.js';
const allowed = 'Matthew-Irving5/AI-Operations';
const repo = JSON.parse(
  execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], { encoding: 'utf8' }),
) as { nameWithOwner: string };
if (repo.nameWithOwner !== allowed) throw new Error(`Unsafe repository: ${repo.nameWithOwner}`);
assertRequiredSpecificationsPresent(process.cwd());
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw new Error('Working tree must be clean before a pass.');
console.log('Pass preflight passed for verified repository.');
