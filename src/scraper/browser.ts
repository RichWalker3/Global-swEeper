/**
 * Browser setup and stealth configuration
 * Handles Playwright browser launch with anti-detection measures
 */

import { chromium, BrowserContext, Page } from 'playwright';
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

export interface LaunchOptions {
  verbose?: boolean;
  proxyUrl?: string;
}

/**
 * Launch browser with stealth configuration to avoid bot detection
 */
export async function launchStealthBrowser(options: LaunchOptions | boolean = false): Promise<LaunchResult> {
  // Handle legacy boolean verbose parameter
  const opts: LaunchOptions = typeof options === 'boolean' ? { verbose: options } : options;
  const verbose = opts.verbose ?? false;
  const proxyUrl = opts.proxyUrl || process.env.PROXY_URL;

  const userAgent = getRandomUserAgent();
  const viewport = getRandomViewport();
  const isChrome = userAgent.includes('Chrome');
  const chromeVersion = userAgent.match(/Chrome\/(\d+)/)?.[1] || '122';

  if (verbose) {
    console.log(`  ✓ Using viewport ${viewport.width}x${viewport.height}`);
    if (proxyUrl) {
      console.log(`  ✓ Using proxy: ${proxyUrl.replace(/:[^:@]+@/, ':****@')}`);
    }
  }

  // Build launch options
  const launchOptions: Parameters<typeof chromium.launch>[0] = {
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
  };

  // Add proxy if configured
  if (proxyUrl) {
    launchOptions.proxy = parseProxyUrl(proxyUrl);
  }

  const browser = await chromium.launch(launchOptions);

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

/**
 * Parse proxy URL into Playwright proxy config
 */
function parseProxyUrl(url: string): { server: string; username?: string; password?: string } {
  try {
    const parsed = new URL(url);
    const server = `${parsed.protocol}//${parsed.host}`;
    if (parsed.username && parsed.password) {
      return { server, username: parsed.username, password: parsed.password };
    }
    return { server };
  } catch {
    return { server: url };
  }
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

// Common cookie consent selectors (ordered by specificity)
const COOKIE_CONSENT_SELECTORS = [
  // OneTrust (very common)
  '#onetrust-accept-btn-handler',
  '.onetrust-accept-btn-handler',
  '[data-testid="accept-all-cookies"]',
  
  // Cookiebot
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  
  // Generic accept buttons (text-based)
  'button:has-text("Accept All")',
  'button:has-text("Accept all")',
  'button:has-text("Accept Cookies")',
  'button:has-text("Accept cookies")',
  'button:has-text("Allow All")',
  'button:has-text("Allow all")',
  'button:has-text("I Accept")',
  'button:has-text("I agree")',
  'button:has-text("Got it")',
  'button:has-text("OK")',
  
  // Common class/id patterns
  '[class*="cookie-accept"]',
  '[class*="cookie-consent"] button[class*="accept"]',
  '[class*="cookieConsent"] button[class*="accept"]',
  '[id*="cookie-accept"]',
  '[data-action="accept-cookies"]',
  '[data-testid="cookie-accept"]',
  
  // GDPR banners
  '.gdpr-accept',
  '.cc-accept',
  '.cc-dismiss',
  '[aria-label="Accept cookies"]',
  
  // Shopify-specific
  '.shopify-privacy-banner button',
  '[class*="privacy-banner"] button:first-of-type',
];

/**
 * Attempt to dismiss cookie consent banners
 * Returns true if a banner was dismissed
 */
export async function dismissCookieConsent(page: Page, verbose = false): Promise<boolean> {
  try {
    for (const selector of COOKIE_CONSENT_SELECTORS) {
      try {
        const button = page.locator(selector).first();
        const isVisible = await button.isVisible({ timeout: 100 }).catch(() => false);
        
        if (isVisible) {
          await button.click({ timeout: 2000 });
          if (verbose) {
            console.log(`    → Dismissed cookie consent: ${selector}`);
          }
          await page.waitForTimeout(500);
          return true;
        }
      } catch {
        // Selector not found or not clickable, continue
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Slowly scroll the page to mimic human behavior and trigger lazy loading
 */
export async function slowScroll(page: Page, options: { steps?: number; verbose?: boolean } = {}): Promise<void> {
  const steps = options.steps ?? 3;
  const verbose = options.verbose ?? false;
  
  try {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    
    // Skip if page is too short
    if (scrollHeight <= viewportHeight) {
      return;
    }
    
    const stepSize = Math.floor(scrollHeight / (steps + 1));
    
    for (let i = 1; i <= steps; i++) {
      const scrollTo = Math.min(stepSize * i, scrollHeight - viewportHeight);
      
      await page.evaluate((y) => {
        window.scrollTo({ top: y, behavior: 'smooth' });
      }, scrollTo);
      
      // Random delay between scrolls (200-500ms)
      await page.waitForTimeout(200 + Math.random() * 300);
    }
    
    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    await page.waitForTimeout(300);
    
    if (verbose) {
      console.log(`    → Scrolled page (${steps} steps)`);
    }
  } catch {
    // Scroll failed, continue without error
  }
}
