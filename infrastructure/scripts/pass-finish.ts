import { execFileSync } from 'node:child_process';
execFileSync('corepack', ['pnpm', 'verify:ci'], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
console.log(
  'Local CI-equivalent validation passed. Create and monitor the pull request before marking a pass complete.',
);
