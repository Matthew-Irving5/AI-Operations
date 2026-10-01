import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type FailureClass =
  | 'CODE'
  | 'CONTRACT'
  | 'ENVIRONMENT'
  | 'INFRASTRUCTURE'
  | 'FLAKE'
  | 'UNKNOWN';

export function sanitize(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s]+/gi, '$1=[REDACTED]')
    .slice(-12_000);
}

export function classifyFailure(text: string): FailureClass {
  if (/zod|schema|shape mismatch|expected.+received|serialization|deserializ/i.test(text)) {
    return 'CONTRACT';
  }
  if (
    /docker|ECONNREFUSED|EADDRINUSE|command not found|not recognized|ENOENT|port .*in use/i.test(
      text,
    )
  ) {
    return 'ENVIRONMENT';
  }
  if (
    /github actions|cloudflare|supabase.*(?:50[0234]|timeout)|runner|deployment.*failed/i.test(text)
  ) {
    return 'INFRASTRUCTURE';
  }
  if (/ECONNRESET|socket hang up|timed out waiting|flaky/i.test(text)) return 'FLAKE';
  if (
    /AssertionError|expected|TypeError|ReferenceError|SyntaxError|test failed|FAIL /i.test(text)
  ) {
    return 'CODE';
  }
  return 'UNKNOWN';
}

function runGit(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return sanitize(`${result.stdout ?? ''}${result.stderr ?? ''}`).trim();
}

function extractLocations(text: string): string[] {
  const locations = new Set<string>();
  const matcher =
    /(?:^|\s)((?:[A-Za-z]:\\|\.?\.?\/)?[^\s:()]+\.(?:ts|tsx|js|jsx|py|sql|yml|yaml))(?:[:(](\d+))?/gm;
  for (const match of text.matchAll(matcher)) {
    const value = match[2] ? `${match[1]}:${match[2]}` : match[1];
    locations.add(value);
  }
  return [...locations].slice(0, 12);
}

function shellCommand(command: string): ReturnType<typeof spawnSync> {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8' });
  }
  return spawnSync('sh', ['-lc', command], { encoding: 'utf8' });
}

function main(): void {
  const commandArgs = process.argv.slice(2);
  if (commandArgs[0] === '--') commandArgs.shift();
  const command = commandArgs.join(' ').trim();
  if (!command) {
    process.stderr.write('Usage: pnpm qa:debug -- <narrow reproduction command>\n');
    process.exitCode = 2;
    return;
  }
  const started = Date.now();
  const result = shellCommand(command);
  const combined = sanitize(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  const failureClass = result.status === 0 ? 'UNKNOWN' : classifyFailure(combined);
  const locations = extractLocations(combined);
  const changed = runGit(['diff', '--name-only', 'origin/main...HEAD']);
  const diff = runGit(['diff', '--stat', 'origin/main...HEAD']);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join('.qa', 'debug');
  mkdirSync(directory, { recursive: true });
  const report = [
    '# QA debug bundle',
    '',
    `- command: \`${command}\``,
    `- exit: ${result.status ?? 'signal'}`,
    `- duration_ms: ${Date.now() - started}`,
    `- class: **${failureClass}**`,
    '',
    '## Likely locations',
    locations.length
      ? locations.map((location) => `- \`${location}\``).join('\n')
      : '- none extracted',
    '',
    '## Changed files',
    changed || '(none)',
    '',
    '## Diff summary',
    diff || '(none)',
    '',
    '## Sanitized failure output',
    '```text',
    combined || '(no output)',
    '```',
    '',
    '## Required next action',
    'Reproduce this exact failure narrowly. Inspect the extracted location/contract before broad searching.',
    'After two unsupported fix hypotheses, revert speculative patches and reduce to a smaller reproducer before editing again.',
    'Do not run a broad suite until this narrow reproducer is green.',
    '',
  ].join('\n');
  const file = join(directory, `${timestamp}.md`);
  writeFileSync(file, report, 'utf8');
  process.stdout.write(`Failure class: ${failureClass}\nDebug bundle: ${file}\n`);
  if (locations.length) process.stdout.write(`Start at: ${locations.join(', ')}\n`);
  process.stdout.write(report.slice(report.indexOf('## Required next action')) + '\n');
  process.exitCode = result.status ?? 1;
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/qa-debug.ts')) main();
