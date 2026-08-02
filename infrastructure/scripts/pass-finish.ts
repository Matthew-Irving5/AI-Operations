import { execFileSync } from 'node:child_process';
execFileSync('pnpm', ['verify'], { stdio: 'inherit' });
console.log(
  'Local pass validation passed. Create and monitor the pull request before marking a pass complete.',
);
