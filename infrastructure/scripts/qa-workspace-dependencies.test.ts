import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  copyLocalSupabaseWorkspaceFiles,
  localSupabaseWorkspaceFiles,
} from './qa-workspace-dependencies';

test('Worker workspace sync removes stale sources only after disposable-target validation', () => {
  const script = readFileSync('infrastructure/scripts/wsl-worker-preview.sh', 'utf8');
  const acquire = script.indexOf('flock -x 9');
  const sync = script.indexOf('rsync -a --delete');
  const preview = script.lastIndexOf('bash infrastructure/scripts/local-worker-preview.sh');
  for (const guard of ['resolved_build_root=', 'disposable repository copy']) {
    const guardIndex = script.indexOf(guard);
    assert.ok(guardIndex >= 0 && acquire > guardIndex);
  }
  assert.ok(acquire >= 0 && sync > acquire && preview > sync);
  assert.ok(script.includes('exec 9>"$HOME/.cache/ai-operations-worker-preview.lock"'));
  assert.ok(
    !script.includes('flock -u'),
    'the process lock remains held through preview completion',
  );
  assert.ok(script.includes('--exclude=node_modules'));
});

test('Worker preview source sync and build share one exclusive WSL workspace lock', () => {
  const runner = readFileSync('infrastructure/scripts/run-worker-preview-e2e.ts', 'utf8');
  const lock = runner.indexOf('flock -x "$HOME/.cache/ai-operations-worker-preview.lock"');
  const sync = runner.indexOf('rsync -a --exclude=.git');
  assert.ok(lock >= 0 && sync > lock, 'the initial source sync must hold the shared lock');
  assert.ok(
    readFileSync('infrastructure/scripts/wsl-worker-preview.sh', 'utf8').includes('flock -x 9'),
    'the build and browser server must hold the same lock through preview completion',
  );
});

test('isolated Supabase workdir includes canonical runtime workspace imports', () => {
  for (const relativePath of [
    'packages/manager-core/src/delegation.ts',
    'packages/manager-core/src/delegation-runtime.ts',
    'packages/manager-core/src/delegation-persistence.ts',
    'packages/manager-core/src/handoff-runtime.ts',
    'packages/manager-core/src/handoff-persistence.ts',
  ]) {
    assert.ok(localSupabaseWorkspaceFiles.includes(relativePath));
  }
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'ai14-qa-workspace-test-'));
  try {
    copyLocalSupabaseWorkspaceFiles(process.cwd(), temporaryRoot);
    for (const relativePath of localSupabaseWorkspaceFiles) {
      const sourcePath = join(process.cwd(), relativePath);
      const copiedPath = join(temporaryRoot, relativePath);
      assert.equal(existsSync(copiedPath), true, `${relativePath} is staged`);
      assert.equal(readFileSync(copiedPath, 'utf8'), readFileSync(sourcePath, 'utf8'));
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
