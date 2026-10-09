import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  copyLocalSupabaseWorkspaceFiles,
  localSupabaseWorkspaceFiles,
} from './qa-workspace-dependencies';

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
