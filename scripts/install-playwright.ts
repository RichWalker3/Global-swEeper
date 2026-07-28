import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensurePlaywrightBrowsersPath,
  findProjectRoot,
  formatPlaywrightInstallHelp,
  validateChromiumInstall,
} from '../src/playwright/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = findProjectRoot(__dirname);

function playwrightCli(): string {
  const cliName = process.platform === 'win32' ? 'playwright.cmd' : 'playwright';
  return join(root, 'node_modules', '.bin', cliName);
}

function clearStaleLocks(browsersPath: string): void {
  const lockPath = join(browsersPath, '__dirlock');
  if (!existsSync(lockPath)) return;
  console.log(`Removing stale Playwright lock: ${lockPath}`);
  rmSync(lockPath, { recursive: true, force: true });
}

function removeWrongBrowserVariants(browsersPath: string): void {
  if (!existsSync(browsersPath)) return;

  for (const entry of readdirSync(browsersPath)) {
    if (!/chromium[-_]headless[-_]shell/i.test(entry)) continue;
    const target = join(browsersPath, entry);
    console.log(`Removing incompatible browser install: ${target}`);
    rmSync(target, { recursive: true, force: true });
  }
}

function runInstall(browsersPath: string): void {
  const cli = playwrightCli();
  if (!existsSync(cli)) {
    throw new Error('Playwright CLI not found. Run npm install first.');
  }

  console.log(`Installing Chromium into ${browsersPath}`);
  execFileSync(cli, ['install', 'chromium', '--no-shell'], {
    cwd: root,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    },
    stdio: 'inherit',
  });
}

function main(): void {
  if (process.env.SKIP_PLAYWRIGHT_INSTALL === '1') {
    console.log('Skipping Playwright install (SKIP_PLAYWRIGHT_INSTALL=1).');
    return;
  }

  const browsersPath = ensurePlaywrightBrowsersPath();
  const existing = validateChromiumInstall(root);

  if (existing.ok) {
    console.log(`Chromium already installed: ${existing.executablePath}`);
    return;
  }

  clearStaleLocks(browsersPath);
  removeWrongBrowserVariants(browsersPath);

  try {
    runInstall(browsersPath);
  } catch (error) {
    clearStaleLocks(browsersPath);
    try {
      console.log('Retrying Playwright install after clearing lock...');
      runInstall(browsersPath);
    } catch (retryError) {
      const detail = retryError instanceof Error ? retryError.message : String(retryError);
      throw new Error(`${detail}\n\n${formatPlaywrightInstallHelp(root)}`);
    }
  }

  const installed = validateChromiumInstall(root);
  if (!installed.ok) {
    throw new Error(`${installed.error}\n\n${formatPlaywrightInstallHelp(root)}`);
  }

  console.log(`Chromium ready: ${installed.executablePath}`);
}

main();
