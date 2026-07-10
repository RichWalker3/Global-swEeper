/**
 * Playwright browser path resolution
 * Keeps Chromium installs in the project folder regardless of shell or cwd.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PROJECT_NAME = 'global-sweep';
const BROWSERS_DIR = '.playwright-browsers';

export function findProjectRoot(startDir = process.cwd()): string {
  let dir = resolve(startDir);
  while (true) {
    const packagePath = join(dir, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: string };
        if (pkg.name === PROJECT_NAME) return dir;
      } catch {
        // Ignore invalid package.json and keep walking up.
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return resolve(startDir);
}

export function getPlaywrightBrowsersPath(projectRoot?: string): string {
  const root = projectRoot ?? findProjectRoot(dirname(fileURLToPath(import.meta.url)));
  return join(root, BROWSERS_DIR);
}

function findInstalledChromiumExecutable(browserRoot: string): string | undefined {
  return fullChromiumExecutableCandidates(browserRoot).find((candidate) => existsSync(candidate));
}

export function ensurePlaywrightBrowsersPath(): string {
  const projectBrowsersPath = getPlaywrightBrowsersPath();
  const projectChromium = findInstalledChromiumExecutable(projectBrowsersPath);
  if (projectChromium) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = projectBrowsersPath;
    return projectBrowsersPath;
  }

  const configuredPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (configuredPath && isAbsolute(configuredPath)) {
    return configuredPath;
  }

  process.env.PLAYWRIGHT_BROWSERS_PATH = projectBrowsersPath;
  return projectBrowsersPath;
}

export function fullChromiumExecutableCandidates(browserRoot: string): string[] {
  if (!existsSync(browserRoot)) return [];

  return readdirSync(browserRoot)
    .filter((entry) => /^chromium-\d+/.test(entry))
    .flatMap((entry) => {
      const chromiumRoot = join(browserRoot, entry);
      return [
        join(chromiumRoot, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(chromiumRoot, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(chromiumRoot, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        join(chromiumRoot, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        join(chromiumRoot, 'chrome-linux', 'chrome'),
        join(chromiumRoot, 'chrome-win', 'chrome.exe'),
      ];
    });
}

function isHeadlessShellPath(executablePath: string): boolean {
  return /headless.?shell/i.test(executablePath);
}

export function resolveChromiumExecutable(): string | undefined {
  const projectBrowsersPath = getPlaywrightBrowsersPath();
  const projectChromium = findInstalledChromiumExecutable(projectBrowsersPath);
  if (projectChromium) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = projectBrowsersPath;
    return projectChromium;
  }

  ensurePlaywrightBrowsersPath();

  const playwrightPath = chromium.executablePath();
  if (playwrightPath && existsSync(playwrightPath) && !isHeadlessShellPath(playwrightPath)) {
    return playwrightPath;
  }

  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || projectBrowsersPath;
  const resolvedBrowserRoot = isAbsolute(browsersPath) ? browsersPath : resolve(process.cwd(), browsersPath);
  const fallback = findInstalledChromiumExecutable(resolvedBrowserRoot);
  if (fallback) return fallback;

  return playwrightPath && existsSync(playwrightPath) ? playwrightPath : undefined;
}

export interface ChromiumInstallStatus {
  ok: boolean;
  projectRoot: string;
  browsersPath: string;
  executablePath?: string;
  hasHeadlessShellOnly: boolean;
  error?: string;
}

export function validateChromiumInstall(projectRoot?: string): ChromiumInstallStatus {
  const root = projectRoot ?? findProjectRoot(dirname(fileURLToPath(import.meta.url)));
  const browsersPath = getPlaywrightBrowsersPath(root);
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  const executablePath = resolveChromiumExecutable();
  const browserEntries = existsSync(browsersPath) ? readdirSync(browsersPath) : [];
  const hasHeadlessShellOnly = browserEntries.some((entry) => /chromium[-_]headless[-_]shell/i.test(entry))
    && !browserEntries.some((entry) => /^chromium-\d+/.test(entry));

  if (executablePath) {
    return { ok: true, projectRoot: root, browsersPath, executablePath, hasHeadlessShellOnly: false };
  }

  let error = `Chromium is not installed in ${browsersPath}.`;
  if (hasHeadlessShellOnly) {
    error += ' Found only headless-shell browsers; Sweep needs full Chromium.';
  }

  return { ok: false, projectRoot: root, browsersPath, hasHeadlessShellOnly, error };
}

export function formatPlaywrightInstallHelp(projectRoot?: string): string {
  const root = projectRoot ?? findProjectRoot(dirname(fileURLToPath(import.meta.url)));
  const browsersPath = getPlaywrightBrowsersPath(root);
  const isWindows = process.platform === 'win32';

  const lines = [
    'Playwright Chromium is missing or incomplete for this Sweep folder.',
    `Project folder: ${root}`,
    `Expected browsers folder: ${browsersPath}`,
    '',
    'Fix it from this exact folder:',
    isWindows
      ? `  cd "${root}"`
      : `  cd "${root}"`,
    '  npm run playwright:install',
    '',
    'If install keeps failing with a lock file, run this first:',
    isWindows
      ? `  Remove-Item -Recurse -Force "${join(browsersPath, '__dirlock')}" -ErrorAction SilentlyContinue`
      : `  rm -rf "${join(browsersPath, '__dirlock')}"`,
    '',
    'Then restart Sweep: npm run web',
  ];

  return lines.join('\n');
}
