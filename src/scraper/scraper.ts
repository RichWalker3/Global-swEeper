/**
 * Main scraper implementation using Playwright
 */

import { chromium, Browser, Page } from 'playwright';
import type { ScrapeResult, ScrapeOptions, PageData, CrawlSummary, NetworkRequest } from './types.js';
import { detectThirdParty } from './detectors.js';
import { tagPage } from '../prefilter/tagger.js';

const DEFAULT_OPTIONS: Required<ScrapeOptions> = {
  maxPages: 30,
  timeout: 30000,
  takeScreenshots: true,
  verbose: false,
};

export async function scrape(seedUrl: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startedAt = new Date().toISOString();
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  const pages: PageData[] = [];
  const visited = new Set<string>();
  const thirdParties = new Set<string>();
  const errors: CrawlSummary['errors'] = [];
  
  let platformDetected: string | undefined;
  let globalEDetected = false;
  let returngoDetected = false;
  let checkoutReached = false;
  let checkoutStoppedAt: string | undefined;

  const domain = new URL(seedUrl).hostname;

  try {
    // Define crawl targets based on e-commerce site structure
    const targets = buildCrawlTargets(seedUrl);
    
    for (const target of targets) {
      if (visited.size >= opts.maxPages) break;
      if (visited.has(target.url)) continue;
      
      try {
        const page = await context.newPage();
        const networkRequests: NetworkRequest[] = [];
        
        // Capture network requests for third-party detection
        page.on('request', (request) => {
          const reqUrl = request.url();
          const detected = detectThirdParty(reqUrl);
          if (detected) {
            thirdParties.add(detected);
            networkRequests.push({ url: reqUrl, type: request.resourceType(), thirdParty: detected });
            
            // Special detections
            if (detected === 'Global-e') globalEDetected = true;
            if (detected === 'ReturnGO') returngoDetected = true;
          }
        });

        await page.goto(target.url, { timeout: opts.timeout, waitUntil: 'networkidle' });
        visited.add(target.url);
        
        // Detect platform from page
        if (!platformDetected) {
          platformDetected = await detectPlatform(page);
        }

        // Track checkout progress
        if (target.type === 'checkout') {
          checkoutReached = true;
          checkoutStoppedAt = page.url();
        }

        // Extract page data
        const pageData = await extractPageData(page, networkRequests, opts);
        pages.push(pageData);

        if (opts.verbose) {
          console.log(`  ✓ ${target.type}: ${pageData.url}`);
        }

        await page.close();
      } catch (error) {
        errors.push({
          url: target.url,
          error: error instanceof Error ? error.message : 'Unknown error',
          type: 'other',
        });
        if (opts.verbose) {
          console.log(`  ✗ ${target.type}: ${target.url} - ${error}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const completedAt = new Date().toISOString();

  return {
    summary: {
      seedUrl,
      domain,
      startedAt,
      completedAt,
      pagesVisited: pages.length,
      pagesBlocked: errors.length,
      checkoutReached,
      checkoutStoppedAt,
      platformDetected,
      headlessDetected: await detectHeadless(pages),
      globalEDetected,
      returngoDetected,
      errors,
      thirdPartiesDetected: Array.from(thirdParties),
    },
    pages,
  };
}

interface CrawlTarget {
  url: string;
  type: 'home' | 'pdp' | 'collection' | 'cart' | 'checkout' | 'policy' | 'other';
}

function buildCrawlTargets(seedUrl: string): CrawlTarget[] {
  const base = seedUrl.replace(/\/$/, '');
  
  // Standard e-commerce page patterns
  return [
    { url: base, type: 'home' },
    { url: `${base}/collections/all`, type: 'collection' },
    { url: `${base}/products`, type: 'collection' },
    { url: `${base}/policies/shipping-policy`, type: 'policy' },
    { url: `${base}/policies/refund-policy`, type: 'policy' },
    { url: `${base}/pages/shipping`, type: 'policy' },
    { url: `${base}/pages/returns`, type: 'policy' },
    { url: `${base}/pages/faq`, type: 'other' },
    { url: `${base}/pages/rewards`, type: 'other' },
    { url: `${base}/cart`, type: 'cart' },
    // PDPs will be discovered dynamically from collection pages
  ];
}

async function extractPageData(page: Page, networkRequests: NetworkRequest[], opts: Required<ScrapeOptions>): Promise<PageData> {
  const url = page.url();
  const title = await page.title();
  
  // Get cleaned text content
  const cleanedText = await page.evaluate(() => {
    // Remove script, style, and hidden elements
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, [hidden], [aria-hidden="true"]').forEach(el => el.remove());
    return clone.innerText.replace(/\s+/g, ' ').trim();
  });

  const excerpt = cleanedText.slice(0, 500);
  
  // Tag page with categories
  const { categories, keyPhrases } = tagPage(cleanedText, url, title);

  // Take screenshot if enabled
  let screenshot: string | undefined;
  if (opts.takeScreenshots) {
    // TODO: Implement screenshot saving
    // screenshot = await page.screenshot({ path: `screenshots/${Date.now()}.png` });
  }

  return {
    url,
    title,
    cleanedText,
    excerpt,
    screenshot,
    matchedCategories: categories,
    keyPhrases,
    networkRequests,
    timestamp: new Date().toISOString(),
  };
}

async function detectPlatform(page: Page): Promise<string | undefined> {
  return await page.evaluate(() => {
    // Shopify detection
    if ((window as any).Shopify || document.querySelector('[data-shopify]') || document.body.innerHTML.includes('cdn.shopify.com')) {
      return 'Shopify';
    }
    // SFCC detection
    if (document.body.innerHTML.includes('demandware')) {
      return 'SFCC';
    }
    // Magento detection
    if ((window as any).Mage || document.body.innerHTML.includes('mage/')) {
      return 'Magento';
    }
    // BigCommerce detection
    if (document.body.innerHTML.includes('bigcommerce.com')) {
      return 'BigCommerce';
    }
    return undefined;
  });
}

async function detectHeadless(pages: PageData[]): Promise<boolean> {
  // Check for headless framework signals in page content
  const headlessSignals = ['__NEXT_DATA__', '_next/', 'gatsby', '_nuxt/', 'hydrogen'];
  
  for (const page of pages) {
    for (const signal of headlessSignals) {
      if (page.cleanedText.includes(signal) || page.url.includes(signal)) {
        return true;
      }
    }
  }
  return false;
}

