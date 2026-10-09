import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const localSupabaseWorkspaceFiles = [
  'packages/contracts/src/agents.ts',
  'packages/contracts/src/conversations.ts',
  'packages/contracts/src/evidence.ts',
  'packages/contracts/src/execution.ts',
  'packages/contracts/src/index.ts',
  'packages/db/src/database.types.ts',
  'packages/test-fixtures/src/agent-runtime.ts',
] as const;

export function copyLocalSupabaseWorkspaceFiles(
  repositoryRoot: string,
  temporaryRoot: string,
): void {
  for (const relativePath of localSupabaseWorkspaceFiles) {
    const destinationPath = join(temporaryRoot, relativePath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    cpSync(join(repositoryRoot, relativePath), destinationPath);
  }
}
