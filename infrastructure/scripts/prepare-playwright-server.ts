import { cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const webRoot = join(process.cwd(), 'apps', 'web');
const standaloneRoot = join(webRoot, '.next', 'standalone');
const standaloneAppRoot = join(standaloneRoot, 'apps', 'web');

for (const source of [join(webRoot, '.next', 'static'), join(webRoot, 'public')]) {
  if (existsSync(source))
    cpSync(source, join(standaloneAppRoot, source.endsWith('static') ? '.next/static' : 'public'), {
      recursive: true,
    });
}

async function startServer(): Promise<void> {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: standaloneAppRoot,
    env: process.env,
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => server.kill(signal));
  }
  const exitCode = await new Promise<number | null>((resolve) => server.on('exit', resolve));
  process.exitCode = exitCode ?? 1;
}

void startServer();
