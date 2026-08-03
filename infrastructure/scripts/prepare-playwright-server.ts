import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const webRoot = join(process.cwd(), 'apps', 'web');
const standaloneRoot = join(webRoot, '.next', 'standalone');

for (const source of [join(webRoot, '.next', 'static'), join(webRoot, 'public')]) {
  if (existsSync(source)) cpSync(source, join(standaloneRoot, source.endsWith('static') ? '.next/static' : 'public'), { recursive: true });
}
