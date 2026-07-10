import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { ensurePlaywrightBrowsersPath, resolveChromiumExecutable, validateChromiumInstall } from '../playwright/paths.js';
import { detectReturnPortal } from '../scraper/policyExtractor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '../../tests/fixtures/returns-portal.html');
const fixtureUrl = pathToFileURL(fixturePath).href;

describe('playwright smoke', () => {
  let browser: Browser;

  beforeAll(async () => {
    ensurePlaywrightBrowsersPath();
    const install = validateChromiumInstall();
    if (!install.ok) {
      throw new Error(`${install.error}\nRun: npm run playwright:install`);
    }

    browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
    });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('loads a local fixture page in Chromium', async () => {
    const page = await browser.newPage();
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });

    const title = await page.title();
    expect(title).toBe('Returns Policy');
    await page.close();
  });

  it('detects Loop Returns from rendered page hrefs', async () => {
    const html = readFileSync(fixturePath, 'utf8');
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
    const result = detectReturnPortal(hrefs);

    expect(result.returnProvider).toBe('Loop Returns');
  });
});
