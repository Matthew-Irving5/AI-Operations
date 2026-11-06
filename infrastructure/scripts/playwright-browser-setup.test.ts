import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isMissingBrowserDependencies,
  playwrightInstallArgs,
  playwrightInstallDepsArgs,
  setupPlaywrightBrowsers,
} from './playwright-browser-setup';

test('CI installs browser binaries without apt and launches the selected browser', async () => {
  const installs: string[][] = [];
  const launches: string[] = [];

  await setupPlaywrightBrowsers(['chromium'], {
    platform: 'linux',
    ci: true,
    isInstalled: () => false,
    install: (args) => installs.push(args),
    launch: async (browser) => launches.push(browser),
  });

  assert.deepEqual(installs, [['pnpm', 'exec', 'playwright', 'install', 'chromium']]);
  assert.deepEqual(launches, ['chromium']);
});

test('Linux OS packages install only after browser launch reports a missing shared library', async () => {
  const installs: string[][] = [];
  let launchAttempts = 0;

  await setupPlaywrightBrowsers(['webkit'], {
    platform: 'linux',
    ci: true,
    isInstalled: () => true,
    install: (args) => installs.push(args),
    launch: async () => {
      launchAttempts += 1;
      if (launchAttempts === 1) {
        throw new Error('error while loading shared libraries: libgtk-3.so.0');
      }
    },
  });

  assert.deepEqual(installs, [['pnpm', 'exec', 'playwright', 'install-deps', 'webkit']]);
  assert.equal(launchAttempts, 2);
});

test('unrelated browser launch failures do not trigger OS package installation', async () => {
  const installs: string[][] = [];

  await assert.rejects(
    setupPlaywrightBrowsers(['chromium'], {
      platform: 'linux',
      ci: true,
      isInstalled: () => true,
      install: (args) => installs.push(args),
      launch: async () => {
        throw new Error('browser closed unexpectedly');
      },
    }),
    /browser closed unexpectedly/,
  );

  assert.deepEqual(installs, []);
});

test('fresh non-CI Linux browser setup retains Playwright OS dependency installation', () => {
  assert.deepEqual(playwrightInstallArgs(['chromium'], 'linux', false), [
    'pnpm',
    'exec',
    'playwright',
    'install',
    '--with-deps',
    'chromium',
  ]);
  assert.deepEqual(playwrightInstallDepsArgs('chromium'), [
    'pnpm',
    'exec',
    'playwright',
    'install-deps',
    'chromium',
  ]);
  assert.equal(
    isMissingBrowserDependencies(
      new Error('Missing system dependencies required to run browser chromium.'),
    ),
    true,
  );
  assert.equal(isMissingBrowserDependencies(new Error('browser closed unexpectedly')), false);
});
