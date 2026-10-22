import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure, sanitize, sanitizeCommandError } from './qa-debug';

test('debugger classifies contract failures before generic code failures', () => {
  assert.equal(classifyFailure('Zod schema expected object received undefined'), 'CONTRACT');
});

test('debugger classifies environment failures', () => {
  assert.equal(classifyFailure('Docker ECONNREFUSED on port 54321'), 'ENVIRONMENT');
});

test('debugger redacts bearer-like secrets', () => {
  assert.equal(sanitize('password=hunter2'), 'password=[REDACTED]');
});

test('isolated Supabase failures retain sanitized stdout and stderr diagnostics', () => {
  const output = sanitizeCommandError({
    stderr: Buffer.from('warning: isolated start diagnostic'),
    stdout: Buffer.from(
      'UnknownError: failed to read file: open packages/manager-core/src/action-execution.ts: no such file or directory',
    ),
  });
  assert.match(output, /warning: isolated start diagnostic/);
  assert.match(
    output,
    /UnknownError: failed to read file: open packages\/manager-core\/src\/action-execution\.ts: no such file or directory/,
  );
  assert.equal(
    classifyFailure('Local Supabase could not start. Confirm Docker is ready.\n' + output),
    'CONTRACT',
  );
});
