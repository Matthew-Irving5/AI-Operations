import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const requiredSpecifications = [
  'AI_OPERATIONS_AGENT_SPEC.md',
  'AI_OPERATIONS_BUILD_SPEC.md',
  'AI_OPERATIONS_FRONTEND_DESIGN_CONSTITUTION.md',
] as const;

export function assertRequiredSpecificationsPresent(repositoryRoot: string): void {
  const missing = requiredSpecifications.filter((file) => {
    try {
      return readFileSync(join(repositoryRoot, file), 'utf8').trim().length === 0;
    } catch {
      return true;
    }
  });

  if (missing.length > 0) {
    throw new Error(
      `Required authoritative specification${missing.length === 1 ? '' : 's'} missing or empty: ${missing.join(', ')}. Restore the approved file(s) at the repository root before starting production-completion work.`,
    );
  }
}
