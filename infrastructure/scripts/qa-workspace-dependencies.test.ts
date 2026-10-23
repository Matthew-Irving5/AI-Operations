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
  const sync = script.indexOf('rsync -a --delete');
  for (const guard of ['resolved_build_root=', 'disposable repository copy']) {
    const guardIndex = script.indexOf(guard);
    assert.ok(guardIndex >= 0 && sync > guardIndex);
  }
  assert.ok(script.includes('--exclude=node_modules'));
});

test('isolated Supabase workdir includes canonical runtime workspace imports', () => {
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
