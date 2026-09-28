import { assertNoLocalTestAuthInBuild } from '../../apps/web/lib/local-test-auth';

try {
  assertNoLocalTestAuthInBuild(process.env);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Hosted auth configuration rejected.'}\n`,
  );
  process.exitCode = 1;
}
