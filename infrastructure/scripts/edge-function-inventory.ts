import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function localFunctionDirectories(root = 'supabase/functions'): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('_') &&
        entry.name !== 'node_modules' &&
        existsSync(join(root, entry.name, 'index.ts')),
    )
    .map(({ name }) => name)
    .sort();
}
