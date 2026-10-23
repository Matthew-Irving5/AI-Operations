import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';

export type PlaywrightBrowserName = 'chromium' | 'webkit';

const browserTypes = { chromium, webkit };

export function playwrightInstallArgs(
  browsers: PlaywrightBrowserName[],
  platform = process.platform,
  ci = process.env.CI === 'true',
): string[] {
  const args = ['pnpm', 'exec', 'playwright', 'install'];
  if (platform === 'linux' && !ci) args.push('--with-deps');
  args.push(...browsers);
  return args;
}

export function playwrightInstallDepsArgs(browser: PlaywrightBrowserName): string[] {
  return ['pnpm', 'exec', 'playwright', 'install-deps', browser];
}

export function isMissingBrowserDependencies(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Host system is missing dependencies to run browsers|Missing system dependencies required to run browser|error while loading shared libraries:|cannot open shared object file/i.test(
    message,
  );
}

type SetupOptions = {
  platform?: string;
  ci?: boolean;
  isInstalled?: (browser: PlaywrightBrowserName) => boolean;
  install?: (args: string[], timeoutMs: number) => void;
  launch?: (browser: PlaywrightBrowserName) => Promise<void>;
};

function install(args: string[], timeoutMs: number): void {
  process.stdout.write(`\n$ corepack ${args.join(' ')}\n`);
  execFileSync('corepack', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: timeoutMs,
  });
}

async function launch(browser: PlaywrightBrowserName): Promise<void> {
  const instance = await browserTypes[browser].launch({ headless: true });
  await instance.close();
}

export async function setupPlaywrightBrowsers(
  browsers: PlaywrightBrowserName[],
  options: SetupOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const ci = options.ci ?? process.env.CI === 'true';
  const isInstalled =
    options.isInstalled ?? ((browser) => existsSync(browserTypes[browser].executablePath()));
  const installCommand = options.install ?? install;
  const launchBrowser = options.launch ?? launch;
  const missingBrowsers = browsers.filter((browser) => !isInstalled(browser));
  if (missingBrowsers.length) {
    installCommand(playwrightInstallArgs(missingBrowsers, platform, ci), 1_200_000);
  }

  for (const browser of browsers) {
    try {
      await launchBrowser(browser);
    } catch (error) {
      if (platform !== 'linux' || !isMissingBrowserDependencies(error)) throw error;
      installCommand(playwrightInstallDepsArgs(browser), ci ? 300_000 : 1_200_000);
      await launchBrowser(browser);
    }
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/playwright-browser-setup.ts')) {
  const browsers = process.argv.slice(2);
  if (
    !browsers.length ||
    browsers.some((browser) => browser !== 'chromium' && browser !== 'webkit')
  ) {
    process.stderr.write('Pass one or more supported Playwright browsers: chromium, webkit.\n');
    process.exitCode = 2;
  } else {
    setupPlaywrightBrowsers(browsers as PlaywrightBrowserName[]).catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
  }
}
