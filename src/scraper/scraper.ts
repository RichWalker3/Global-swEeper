/**
 * Main scraper implementation using Playwright
 * Uses Wappalyzer + pattern-based detection for comprehensive third-party identification
 */

import { chromium, Page, Response } from 'playwright';
import type { ScrapeResult, ScrapeOptions, PageData, CrawlSummary, NetworkRequest, DGFinding, DetectedTechnology } from './types.js';
import { detectThirdParty, isRedFlag, scanForDangerousGoods, detectB2B, extractProductLinks } from './detectors.js';
import { tagPage } from '../prefilter/tagger.js';
import { initWappalyzer, analyzeWithWappalyzer, filterEcommerceRelevant } from './wappalyzer.js';

const DEFAULT_OPTIONS: Required<ScrapeOptions> = {
  maxPages: 30,
  timeout: 15000,
  takeScreenshots: true,
  verbose: false,
};

export async function scrape(seedUrl: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startedAt = new Date().toISOString();
  
  // Initialize Wappalyzer
  const wappalyzerReady = await initWappalyzer();
  if (opts.verbose && wappalyzerReady) {
    console.log('  ✓ Wappalyzer initialized');
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  const pages: PageData[] = [];
  const visited = new Set<string>();
  const thirdParties = new Set<string>();
  const allTechnologies = new Map<string, DetectedTechnology>(); // Wappalyzer results
  const redFlags = new Set<string>();
  const b2bIndicators = new Set<string>();
  const dangerousGoods: DGFinding[] = [];
  const errors: CrawlSummary['errors'] = [];
  
  let platformDetected: string | undefined;
  let globalEDetected = false;
  let returngoDetected = false;
  let shopPayDetected = false;
  let checkoutReached = false;
  let checkoutStoppedAt: string | undefined;
  let productPagesScraped = 0;
  
  const discoveredProductUrls: string[] = [];
  const domain = new URL(seedUrl).hostname;

  try {
    const targets = buildCrawlTargets(seedUrl);
    
    // Phase 1: Scrape main pages
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
            
            // Check for red flags
            if (isRedFlag(detected)) {
              redFlags.add(detected);
            }
            
            // Special detections
            if (detected === 'Global-e') globalEDetected = true;
            if (detected === 'ReturnGO') returngoDetected = true;
            if (detected === 'Shop Pay') shopPayDetected = true;
          } else {
            // Still track request even without match for debugging
            networkRequests.push({ url: reqUrl, type: request.resourceType() });
          }
        });

        const response = await page.goto(target.url, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
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
        const pageData = await extractPageData(page, response, networkRequests, opts);
        pages.push(pageData);
        
        // Run Wappalyzer analysis on homepage and collection pages (most representative)
        if (wappalyzerReady && pageData.rawHtml && (target.type === 'home' || target.type === 'collection')) {
          const wapResultsRaw = await analyzeWithWappalyzer(pageData.url, pageData.rawHtml, pageData.headers);
          // Filter to only e-commerce relevant technologies (exclude jQuery, Cloudflare, etc.)
          const wapResults = filterEcommerceRelevant(wapResultsRaw);
          
          for (const tech of wapResults) {
            const techNameLower = tech.name.toLowerCase();
            // Skip if it's the same as detected platform (avoid duplication)
            if (platformDetected && techNameLower === platformDetected.toLowerCase()) {
              continue;
            }
            
            if (!allTechnologies.has(techNameLower)) {
              allTechnologies.set(techNameLower, {
                name: tech.name,
                confidence: String(tech.confidence),
                version: tech.version || null,
                icon: tech.icon,
                website: tech.website,
                categories: tech.categories.map(c => ({ [String(c.id)]: c.name })),
              });
              // Also add to thirdParties for UI display
              thirdParties.add(tech.name);
            }
          }
          if (opts.verbose && wapResults.length > 0) {
            console.log(`    → Wappalyzer found ${wapResults.length} relevant technologies`);
          }
        }
        
        // Scan for DG keywords
        const dgMatches = scanForDangerousGoods(pageData.cleanedText);
        for (const match of dgMatches) {
          dangerousGoods.push({ ...match, foundOnUrl: pageData.url });
        }
        
        // Detect B2B indicators
        const b2b = detectB2B(pageData.cleanedText, pageData.url);
        for (const indicator of b2b.evidence) {
          b2bIndicators.add(indicator);
        }
        
        // Extract product links from collection pages
        if (target.type === 'collection' && pageData.rawHtml) {
          const productUrls = extractProductLinks(pageData.rawHtml, seedUrl);
          for (const url of productUrls) {
            if (!discoveredProductUrls.includes(url)) {
              discoveredProductUrls.push(url);
            }
          }
        }

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
    
    // Phase 2: Scrape discovered product pages (up to 5)
    const maxProducts = Math.min(5, opts.maxPages - visited.size);
    for (let i = 0; i < Math.min(discoveredProductUrls.length, maxProducts); i++) {
      const productUrl = discoveredProductUrls[i];
      if (visited.has(productUrl)) continue;
      
      try {
        const page = await context.newPage();
        const networkRequests: NetworkRequest[] = [];
        
        page.on('request', (request) => {
          const reqUrl = request.url();
          const detected = detectThirdParty(reqUrl);
          if (detected) {
            thirdParties.add(detected);
            networkRequests.push({ url: reqUrl, type: request.resourceType(), thirdParty: detected });
            if (isRedFlag(detected)) redFlags.add(detected);
            if (detected === 'Shop Pay') shopPayDetected = true;
          } else {
            networkRequests.push({ url: reqUrl, type: request.resourceType() });
          }
        });

        const response = await page.goto(productUrl, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        visited.add(productUrl);
        productPagesScraped++;
        
        const pageData = await extractPageData(page, response, networkRequests, opts);
        pageData.matchedCategories.push('pdp');
        pages.push(pageData);
        
        // Scan PDP for DG keywords
        const dgMatches = scanForDangerousGoods(pageData.cleanedText);
        for (const match of dgMatches) {
          if (!dangerousGoods.some(d => d.category === match.category)) {
            dangerousGoods.push({ ...match, foundOnUrl: pageData.url });
          }
        }

        if (opts.verbose) {
          console.log(`  ✓ PDP: ${pageData.url}`);
        }

        await page.close();
      } catch (error) {
        errors.push({
          url: productUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
          type: 'other',
        });
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
      headlessDetected: detectHeadless(pages),
      globalEDetected,
      returngoDetected,
      shopPayDetected,
      errors,
      thirdPartiesDetected: Array.from(thirdParties),
      technologies: Array.from(allTechnologies.values()),
      redFlags: Array.from(redFlags),
      dangerousGoods,
      b2bIndicators: Array.from(b2bIndicators),
      productPagesScraped,
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
    { url: `${base}/pages/wholesale`, type: 'other' },
    { url: `${base}/cart`, type: 'cart' },
  ];
}

async function extractPageData(
  page: Page, 
  response: Response | null, 
  networkRequests: NetworkRequest[], 
  opts: Required<ScrapeOptions>
): Promise<PageData> {
  const url = page.url();
  const title = await page.title();
  const rawHtml = await page.content();
  
  const statusCode = response?.status();
  const responseHeaders = response?.headers() || {};
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(responseHeaders)) {
    headers[key] = String(value);
  }
  
  const cleanedText = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, [hidden], [aria-hidden="true"]').forEach(el => el.remove());
    return clone.innerText.replace(/\s+/g, ' ').trim();
  });

  const excerpt = cleanedText.slice(0, 500);
  const { categories, keyPhrases } = tagPage(cleanedText, url, title);

  let screenshot: string | undefined;
  if (opts.takeScreenshots) {
    // TODO: Implement screenshot saving
  }

  return {
    url,
    title,
    rawHtml,
    cleanedText,
    excerpt,
    screenshot,
    matchedCategories: categories,
    keyPhrases,
    networkRequests,
    timestamp: new Date().toISOString(),
    statusCode,
    headers,
  };
}

async function detectPlatform(page: Page): Promise<string | undefined> {
  return await page.evaluate(() => {
    if ((window as any).Shopify || document.querySelector('[data-shopify]') || document.body.innerHTML.includes('cdn.shopify.com')) {
      return 'Shopify';
    }
    if (document.body.innerHTML.includes('demandware')) {
      return 'SFCC';
    }
    if ((window as any).Mage || document.body.innerHTML.includes('mage/')) {
      return 'Magento';
    }
    if (document.body.innerHTML.includes('bigcommerce.com')) {
      return 'BigCommerce';
    }
    return undefined;
  });
}

function detectHeadless(pages: PageData[]): boolean {
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
