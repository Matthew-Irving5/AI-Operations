import { execFileSync } from 'node:child_process';

if (process.platform === 'win32') {
  const distro = process.env.LOCAL_QA_WSL_DISTRO?.trim() || 'Ubuntu';
  let wslHome: string;
  try {
    wslHome = execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-lc', 'printf %s "$HOME"'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(
      `OpenNext Worker preview requires an available WSL distribution named ${distro}.`,
    );
  }
  if (!wslHome.startsWith('/home/'))
    throw new Error(
      'OpenNext Worker preview requires a Linux user home in the selected WSL distribution.',
    );

  const buildRoot = `${wslHome}/aiops-wsl-20261020`;
  const sourceRoot = process.cwd();
  const wslEnvNames = new Set(process.env.WSLENV?.split(':').filter(Boolean) ?? []);
  wslEnvNames.add('LOCAL_QA_SOURCE_ROOT/p');
  wslEnvNames.add('LOCAL_QA_WSL_BUILD_ROOT');
  try {
    execFileSync(
      'wsl.exe',
      [
        '-d',
        distro,
        '--',
        'bash',
        '-lc',
        'mkdir -p "$LOCAL_QA_WSL_BUILD_ROOT" && rsync -a --exclude=.git --exclude=node_modules --exclude=.env --exclude="**/.env" --exclude="apps/web/.next" --exclude="apps/web/.next-*" --exclude="apps/web/.open-next" --exclude=test-results --exclude=playwright-report --exclude=coverage "$LOCAL_QA_SOURCE_ROOT/" "$LOCAL_QA_WSL_BUILD_ROOT/"',
      ],
      {
        env: {
          ...process.env,
          LOCAL_QA_SOURCE_ROOT: sourceRoot,
          LOCAL_QA_WSL_BUILD_ROOT: buildRoot,
          WSLENV: [...wslEnvNames].join(':'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    throw new Error('Could not synchronize the source tree to the local WSL OpenNext workspace.');
  }

  process.env.LOCAL_QA_WSL_DISTRO = distro;
  process.env.LOCAL_QA_WSL_BUILD_ROOT = buildRoot;
  process.env.LOCAL_QA_WSL_NODE_BIN = `${wslHome}/.local/node-v24.18.0-linux-x64/bin`;
} else if (process.platform !== 'linux') {
  throw new Error('OpenNext Worker preview supports Windows with WSL or a native Linux host.');
}

process.env.LOCAL_QA_WORKER_PREVIEW = 'true';
void import('./run-e2e');
