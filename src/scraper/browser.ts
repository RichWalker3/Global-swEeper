/**
 * Browser setup and stealth configuration
 * Handles Playwright browser launch with anti-detection measures
 */

import { chromium, BrowserContext } from 'playwright';
import { getRandomUserAgent, getRandomViewport } from './helpers.js';

export interface BrowserConfig {
  userAgent: string;
  viewport: { width: number; height: number };
  chromeVersion: string;
}

export interface LaunchResult {
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  context: BrowserContext;
  config: BrowserConfig;
}

/**
 * Launch browser with stealth configuration to avoid bot detection
 */
export async function launchStealthBrowser(verbose = false): Promise<LaunchResult> {
  const userAgent = getRandomUserAgent();
  const viewport = getRandomViewport();
  const isChrome = userAgent.includes('Chrome');
  const chromeVersion = userAgent.match(/Chrome\/(\d+)/)?.[1] || '122';

  if (verbose) {
    console.log(`  ✓ Using viewport ${viewport.width}x${viewport.height}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-infobars',
      '--window-size=' + viewport.width + ',' + viewport.height,
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const context = await browser.newContext({
    userAgent,
    viewport,
    extraHTTPHeaders: buildHeaders(userAgent, chromeVersion, isChrome),
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
    permissions: ['geolocation'],
  });

  await addStealthScripts(context);

  return {
    browser,
    context,
    config: { userAgent, viewport, chromeVersion },
  };
}

function buildHeaders(userAgent: string, chromeVersion: string, isChrome: boolean): Record<string, string> {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': isChrome ? `"Chromium";v="${chromeVersion}", "Not(A:Brand";v="24", "Google Chrome";v="${chromeVersion}"` : '',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': userAgent.includes('Mac') ? '"macOS"' : '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}

async function addStealthScripts(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // Hide webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Hide automation Chrome properties
    const win = window as unknown as { chrome?: { runtime?: unknown } };
    if (win.chrome) {
      win.chrome.runtime = {
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
        OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
      };
    }
  });
}
