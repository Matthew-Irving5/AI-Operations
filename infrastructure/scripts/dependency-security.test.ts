import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';

test('Node and deployed Edge boundaries use the patched Zod release', () => {
  for (const path of [
    'package.json',
    'apps/web/package.json',
    'packages/contracts/package.json',
    'packages/ai-runtime/package.json',
  ]) {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal(manifest.dependencies?.zod ?? manifest.devDependencies?.zod, '4.6.6', path);
  }
  function inspect(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.(ts|json)$/.test(entry.name)) {
        const imports = [...readFileSync(path, 'utf8').matchAll(/(?:npm:|esm\.sh\/)zod@([\d.]+)/g)];
        for (const match of imports) assert.equal(match[1], '4.6.6', path);
      }
    }
  }
  inspect('supabase/functions');
  const oversized = z.array(z.string()).max(2).safeParse(Array<number>(5000).fill(1));
  assert.equal(oversized.success, false);
  assert.equal(oversized.error?.issues.length, 1);
  assert.equal(oversized.error?.issues[0]?.code, 'too_big');
});

test('tooling transitive security patches remain pinned', () => {
  const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
  assert.match(workspace, /undici: 7\.30\.1/);
  assert.match(workspace, /'body-parser@>=2\.0\.0 <2\.4\.0': 2\.4\.0/);
  assert.match(workspace, /'zod@<4\.6\.6': 4\.6\.6/);
});
