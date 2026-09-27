import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { assertRequiredSpecificationsPresent, requiredSpecifications } from './required-specs.js';

const temporaryRoots: string[] = [];

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'ai-operations-preflight-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('accepts all three non-empty root specifications', () => {
  const root = createRepository();
  for (const file of requiredSpecifications) writeFileSync(join(root, file), '# approved spec\n');

  assert.doesNotThrow(() => assertRequiredSpecificationsPresent(root));
});

test('fails with the exact missing specification and recovery action', () => {
  const root = createRepository();
  for (const file of requiredSpecifications.slice(1))
    writeFileSync(join(root, file), '# approved spec\n');

  assert.throws(
    () => assertRequiredSpecificationsPresent(root),
    /AI_OPERATIONS_AGENT_SPEC\.md.*Restore the approved file\(s\) at the repository root/,
  );
});

test('fails when a required specification exists but is empty', () => {
  const root = createRepository();
  for (const file of requiredSpecifications) writeFileSync(join(root, file), '# approved spec\n');
  writeFileSync(join(root, requiredSpecifications[2]), '   \n');

  assert.throws(
    () => assertRequiredSpecificationsPresent(root),
    /AI_OPERATIONS_FRONTEND_DESIGN_CONSTITUTION\.md/,
  );
});
