import assert from 'node:assert/strict';
import test from 'node:test';
import { assertIsolatedRestoreTarget } from './backup-restore.js';

test('staging restore requires a known production project and distinct target', () => {
  assert.doesNotThrow(() =>
    assertIsolatedRestoreTarget(
      'staging-project-ref',
      'recovery-project-ref',
      'production-project-ref',
    ),
  );
  assert.throws(
    () =>
      assertIsolatedRestoreTarget(
        'staging-project-ref',
        'production-project-ref',
        'production-project-ref',
      ),
    /restore_target_project_not_isolated/,
  );
  assert.throws(
    () =>
      assertIsolatedRestoreTarget(
        'staging-project-ref',
        'staging-project-ref',
        'production-project-ref',
      ),
    /restore_target_project_not_isolated/,
  );
  assert.throws(
    () => assertIsolatedRestoreTarget('staging-project-ref', 'recovery-project-ref', ''),
    /restore_target_project_not_isolated/,
  );
});
