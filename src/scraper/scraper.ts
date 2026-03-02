/**
 * Main scraper implementation using Playwright
 * Uses Wappalyzer + pattern-based detection for comprehensive third-party identification
 */

import { chromium, Page, Response } from 'playwright';
import type { ScrapeResult, ScrapeOptions, PageData, CrawlSummary, NetworkRequest, DGFinding, DetectedTechnology, ExtractedPolicyInfo, CheckoutFlowInfo, CatalogFeaturesInfo, LoyaltyProgramInfo, LocalizationDetected, MarketplacePresence } from './types.js';
import { detectThirdParty, isRedFlag, scanForDangerousGoods, detectB2B, extractProductLinks } from './detectors.js';
import { tagPage } from '../prefilter/tagger.js';
import { initWappalyzer, analyzeWithWappalyzer, filterEcommerceRelevant } from './wappalyzer.js';
import { extractPolicyInfo, extractCheckoutInfo, mergePolicies, type ExtractedPolicy } from './policyExtractor.js';
import { detectBundles, detectCustomizableProducts, detectVirtualProducts, detectGiftCards, detectSubscriptions, detectPreOrders, detectLoyaltyProgram, detectLocalization, detectMarketplaces, detectGWP, detectBNPLWidgets } from './catalogDetector.js';
import { logAssessment, type DebugInfo } from '../logger/index.js';

const DEFAULT_OPTIONS: Required<ScrapeOptions> = {
  maxPages: 50,
  timeout: 15000,
  scrapeTimeout: 120000, // 2 minutes overall timeout
  takeScreenshots: true,
  verbose: false,
};

// Track scrape progress for timeout reporting
let scrapeProgress = { phase: 'initializing', pagesScraped: 0, currentUrl: '' };

export async function scrape(seedUrl: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Reset progress tracking
  scrapeProgress = { phase: 'initializing', pagesScraped: 0, currentUrl: seedUrl };
  
  // Wrap entire scrape in an overall timeout to prevent hung scrapes
  const scrapePromise = scrapeInternal(seedUrl, opts);
  const timeoutPromise = new Promise<ScrapeResult>((_, reject) => {
    setTimeout(() => {
      const timeoutSecs = (opts.scrapeTimeout / 1000).toFixed(0);
      const reason = `Timed out after ${timeoutSecs}s during "${scrapeProgress.phase}" phase. ` +
        `Progress: ${scrapeProgress.pagesScraped} pages scraped. ` +
        (scrapeProgress.currentUrl ? `Last URL: ${scrapeProgress.currentUrl}` : '');
      reject(new Error(`Scrape timeout: ${reason}`));
    }, opts.scrapeTimeout);
  });
  
  return Promise.race([scrapePromise, timeoutPromise]);
}

async function scrapeInternal(seedUrl: string, opts: Required<ScrapeOptions>): Promise<ScrapeResult> {
  const startedAt = new Date().toISOString();
  
  // Initialize Wappalyzer
  const wappalyzerReady = await initWappalyzer();
  if (opts.verbose && wappalyzerReady) {
    console.log('  ✓ Wappalyzer initialized');
  }
  
  // Use "new" headless mode which is harder to detect than the old "headless: true"
  // Also add anti-detection arguments to avoid bot detection
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // Hide automation
      '--disable-features=IsolateOrigins,site-per-process', // Sometimes helps with complex sites
      '--disable-web-security', // Disable CORS for scraping
    ],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    // Add standard browser headers to look more like a real browser
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 40.7128, longitude: -74.0060 }, // New York
    permissions: ['geolocation'],
  });
  
  // Add script to hide automation indicators
  await context.addInitScript(() => {
    // Override the webdriver property
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
    
    // Hide automation-related Chrome properties
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
  
  // Policy and checkout extraction
  const extractedPolicies: ExtractedPolicy[] = [];
  let checkoutInfo: CheckoutFlowInfo | undefined;
  
  // Catalog feature detection accumulators
  const bundleEvidence: string[] = [];
  let bundlesDetected = false;
  const customizationTypes = new Set<string>();
  let customizableProducts = false;
  const virtualProductTypes = new Set<string>();
  let virtualProducts = false;
  const giftCardTypes = new Set<string>();
  let giftCardsDetected = false;
  let subscriptionsDetected = false;
  let subscriptionProvider: string | undefined;
  let preOrdersDetected = false;
  let gwpDetected = false;
  let loyaltyInfo: LoyaltyProgramInfo = { detected: false, evidence: [] };
  let localizationInfo: LocalizationDetected = { countrySelector: false, multiLanguage: false, languagesDetected: [], multiCurrency: false, currenciesDetected: [] };
  let marketplaceInfo: MarketplacePresence = { detected: false, marketplaces: [] };
  
  const discoveredProductUrls: string[] = [];
  const domain = new URL(seedUrl).hostname;
  
  // Debug tracking for logging
  const debugInfo: Partial<DebugInfo> = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewportSize: { width: 1440, height: 900 },
    totalRequestsIntercepted: 0,
    redirectsDetected: [],
    blockedRequests: [],
    consoleErrors: [],
  };

  try {
    // Phase 0: Load homepage first to discover links
    const discoveryPage = await context.newPage();
    
    scrapeProgress.phase = 'discovery';
    if (opts.verbose) {
      console.log('  Discovering site structure...');
    }
    
    await discoveryPage.goto(seedUrl, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
    await discoveryPage.waitForTimeout(1500); // Discovery page needs time for nav/footer to load

    // Discover crawl targets from homepage links (footer, nav, sitemap)
    // Use a timeout to avoid hanging on complex pages
    let targets: CrawlTarget[];
    try {
      const discoveryPromise = discoverCrawlTargets(discoveryPage, seedUrl, opts.verbose);
      const timeoutPromise = new Promise<CrawlTarget[]>((_, reject) => 
        setTimeout(() => reject(new Error('Discovery timeout')), 10000)
      );
      targets = await Promise.race([discoveryPromise, timeoutPromise]);
    } catch (discoveryError) {
      if (opts.verbose) {
        console.log(`  ⚠ Discovery failed (${discoveryError}), using fallback targets`);
      }
      // Fallback to minimal static targets
      targets = getFallbackTargets(seedUrl);
    }
    await discoveryPage.close();
    
    if (opts.verbose) {
      console.log(`  Found ${targets.length} pages to crawl`);
    }
    
    // Phase 1: Scrape discovered pages
    const totalTargets = Math.min(targets.length, opts.maxPages);
    let pageIndex = 0;
    
    for (const target of targets) {
      if (visited.size >= opts.maxPages) break;
      if (visited.has(target.url)) continue;
      
      pageIndex++;
      scrapeProgress.phase = 'page-scraping';
      scrapeProgress.currentUrl = target.url;
      if (opts.verbose) {
        const elapsed = ((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1);
        console.log(`  [${pageIndex}/${totalTargets}] ${target.type}: ${new URL(target.url).pathname} (${elapsed}s)`);
      }
      
      try {
        const page = await context.newPage();
        const networkRequests: NetworkRequest[] = [];
        
        // Capture network requests for third-party detection
        page.on('request', (request) => {
          const reqUrl = request.url();
          debugInfo.totalRequestsIntercepted = (debugInfo.totalRequestsIntercepted || 0) + 1;
          
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
        
        // Track console errors
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            debugInfo.consoleErrors?.push(`${target.url}: ${msg.text()}`);
          }
        });

        const response = await page.goto(target.url, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000); // Reduced from 2s to 1s for faster scraping
        
        // Check for redirects - CRITICAL for debugging scraping issues
        const finalUrl = page.url();
        const targetDomain = new URL(target.url).hostname;
        const finalDomain = new URL(finalUrl).hostname;
        
        if (finalUrl !== target.url) {
          const redirectInfo = `${target.url} → ${finalUrl}`;
          debugInfo.redirectsDetected?.push(redirectInfo);
          
          // Log warning if redirected to different domain (like Google)
          if (finalDomain !== targetDomain && !finalDomain.includes(targetDomain.replace('www.', ''))) {
            console.warn(`  ⚠️ REDIRECT TO DIFFERENT DOMAIN: ${redirectInfo}`);
            errors.push({
              url: target.url,
              error: `Redirected to different domain: ${finalUrl}`,
              type: 'other',
            });
            await page.close();
            continue; // Skip this page - it's not from our target site
          }
        }
        
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
        scrapeProgress.pagesScraped = pages.length;

        // Extract policy info from policy and FAQ pages
        if ((target.type === 'policy' || target.type === 'other') && pageData.cleanedText.length > 100) {
          const policyInfo = extractPolicyInfo(pageData.cleanedText, pageData.url);
          extractedPolicies.push(policyInfo);
          
          // If return provider detected, add to third parties
          if (policyInfo.returnProvider) {
            thirdParties.add(policyInfo.returnProvider);
          }
          
          // Detect marketplace presence from FAQ/policy pages
          const marketplace = detectMarketplaces(pageData.cleanedText, pageData.rawHtml || '');
          if (marketplace.detected) {
            marketplaceInfo.detected = true;
            marketplace.marketplaces.forEach(m => {
              if (!marketplaceInfo.marketplaces.includes(m)) {
                marketplaceInfo.marketplaces.push(m);
              }
            });
          }
        }
        
        // Run catalog detection on home and collection pages
        if (target.type === 'home' || target.type === 'collection') {
          const networkUrls = pageData.networkRequests.map(r => r.url);
          
          // Bundles
          const bundles = detectBundles(pageData.cleanedText, pageData.url);
          if (bundles.detected) {
            bundlesDetected = true;
            bundles.evidence.forEach(e => { if (!bundleEvidence.includes(e)) bundleEvidence.push(e); });
          }
          
          // Virtual products
          const virtual = detectVirtualProducts(pageData.cleanedText, pageData.url);
          if (virtual.detected) {
            virtualProducts = true;
            virtual.types.forEach(t => virtualProductTypes.add(t));
          }
          
          // Subscriptions
          const subs = detectSubscriptions(pageData.cleanedText, pageData.rawHtml || '', networkUrls);
          if (subs.detected) {
            subscriptionsDetected = true;
            if (subs.provider) subscriptionProvider = subs.provider;
          }
          
          // Loyalty program (also run on home/collection to catch nav links)
          const loyalty = detectLoyaltyProgram(pageData.cleanedText, pageData.rawHtml || '', networkUrls);
          if (loyalty.detected) {
            loyaltyInfo.detected = true;
            if (loyalty.provider) loyaltyInfo.provider = loyalty.provider;
            if (loyalty.programName) loyaltyInfo.programName = loyalty.programName;
            loyalty.evidence.forEach(e => { if (!loyaltyInfo.evidence.includes(e)) loyaltyInfo.evidence.push(e); });
          }
          
          // GWP
          const gwp = detectGWP(pageData.cleanedText);
          if (gwp.detected) gwpDetected = true;
          
          // Localization (only on home page)
          if (target.type === 'home') {
            const loc = detectLocalization(pageData.cleanedText, pageData.rawHtml || '');
            localizationInfo = loc;
          }
        }
        
        // Run loyalty detection on dedicated rewards/loyalty pages (most authoritative source)
        if (target.type === 'rewards') {
          const networkUrls = pageData.networkRequests.map(r => r.url);
          const loyalty = detectLoyaltyProgram(pageData.cleanedText, pageData.rawHtml || '', networkUrls);
          if (loyalty.detected) {
            loyaltyInfo.detected = true;
            if (loyalty.provider) loyaltyInfo.provider = loyalty.provider;
            if (loyalty.programName) loyaltyInfo.programName = loyalty.programName;
            loyalty.evidence.forEach(e => { if (!loyaltyInfo.evidence.includes(e)) loyaltyInfo.evidence.push(e); });
          }
        }
        
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
          
          // Check for BNPL widgets on collection pages too
          const bnplWidgets = detectBNPLWidgets(pageData.cleanedText, pageData.rawHtml);
          if (bnplWidgets.detected) {
            for (const provider of bnplWidgets.providers) {
              if (provider !== 'BNPL (unspecified)') {
                thirdParties.add(provider);
              }
            }
          }
        }

        if (opts.verbose) {
          console.log(`  ✓ ${target.type}: ${pageData.url}`);
        }

        await page.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          url: target.url,
          error: errorMsg,
          type: 'other',
        });
        if (opts.verbose) {
          console.log(`  ✗ ${target.type}: ${target.url} - ${error}`);
        }
        
        // If browser context is closed, stop trying to open new pages
        if (errorMsg.includes('Target page, context or browser has been closed') ||
            errorMsg.includes('Browser has been closed') ||
            errorMsg.includes('context has been closed')) {
          console.warn(`  ⚠️ Browser context closed - stopping page scraping`);
          break;
        }
      }
    }
    
    // Phase 2: Scrape discovered product pages (up to 5)
    scrapeProgress.phase = 'product-pages';
    const maxProducts = Math.min(5, opts.maxPages - visited.size);
    if (opts.verbose && discoveredProductUrls.length > 0) {
      const elapsed = ((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1);
      console.log(`  [products] Scraping ${Math.min(discoveredProductUrls.length, maxProducts)} product pages... (${elapsed}s)`);
    }
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
        await page.waitForTimeout(1000); // Reduced from 2s
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

        // Detect BNPL widgets on product pages (Afterpay, Klarna, Affirm badges)
        const bnplWidgets = detectBNPLWidgets(pageData.cleanedText, pageData.rawHtml || '');
        if (bnplWidgets.detected) {
          for (const provider of bnplWidgets.providers) {
            if (provider !== 'BNPL (unspecified)') {
              thirdParties.add(provider);
              if (opts.verbose && !thirdParties.has(provider)) {
                console.log(`    → BNPL widget: ${provider}`);
              }
            }
          }
        }

        // PDP-specific catalog detection
        const networkUrls = pageData.networkRequests.map(r => r.url);
        
        // Customizable products (most common on PDPs)
        const custom = detectCustomizableProducts(pageData.cleanedText, pageData.rawHtml || '');
        if (custom.detected) {
          customizableProducts = true;
          custom.types.forEach(t => customizationTypes.add(t));
        }
        
        // Pre-orders
        const preOrder = detectPreOrders(pageData.cleanedText, pageData.rawHtml || '');
        if (preOrder.detected) preOrdersDetected = true;
        
        // Subscriptions on PDP
        const subs = detectSubscriptions(pageData.cleanedText, pageData.rawHtml || '', networkUrls);
        if (subs.detected) {
          subscriptionsDetected = true;
          if (subs.provider) subscriptionProvider = subs.provider;
        }
        
        // Bundles on PDP
        const bundles = detectBundles(pageData.cleanedText, pageData.url);
        if (bundles.detected) {
          bundlesDetected = true;
          bundles.evidence.forEach(e => { if (!bundleEvidence.includes(e)) bundleEvidence.push(e); });
        }
        
        // Virtual products on PDP (e.g., membership, downloads)
        const virtual = detectVirtualProducts(pageData.cleanedText, pageData.url);
        if (virtual.detected) {
          virtualProducts = true;
          virtual.types.forEach(t => virtualProductTypes.add(t));
        }
        
        // Gift cards on PDP (separate from virtual products)
        const giftCards = detectGiftCards(pageData.cleanedText, pageData.url);
        if (giftCards.detected) {
          giftCardsDetected = true;
          giftCards.types.forEach(t => giftCardTypes.add(t));
        }

        if (opts.verbose) {
          console.log(`  ✓ PDP: ${pageData.url}`);
        }

        await page.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          url: productUrl,
          error: errorMsg,
          type: 'other',
        });
        
        // If browser context is closed, stop trying
        if (errorMsg.includes('Target page, context or browser has been closed') ||
            errorMsg.includes('context has been closed')) {
          console.warn(`  ⚠️ Browser context closed - stopping product scraping`);
          break;
        }
      }
    }
    
    // Phase 3: Checkout flow testing
    // Try to add an item and navigate to checkout
    // Limit checkout test to 30 seconds to avoid timeouts
    scrapeProgress.phase = 'checkout';
    scrapeProgress.currentUrl = `${seedUrl}/checkout`;
    if (opts.verbose) {
      const elapsed = ((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1);
      console.log(`  [checkout] Testing checkout flow... (${elapsed}s)`);
    }
    try {
      const checkoutPromise = testCheckoutFlow(context, seedUrl, opts);
      const checkoutTimeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 30000); // 30 second max for checkout
      });
      const checkoutResult = await Promise.race([checkoutPromise, checkoutTimeoutPromise]);
      if (checkoutResult) {
        checkoutInfo = checkoutResult.checkoutInfo;
        checkoutReached = checkoutResult.reachedCheckout;
        checkoutStoppedAt = checkoutResult.stoppedAt;
        
        // Add any express wallets/BNPL to third parties
        for (const wallet of checkoutResult.checkoutInfo.expressWallets) {
          thirdParties.add(wallet);
        }
        for (const bnpl of checkoutResult.checkoutInfo.bnplOptions) {
          thirdParties.add(bnpl);
        }
        
        if (opts.verbose) {
          console.log(`  ✓ Checkout: ${checkoutResult.stoppedAt || 'reached'}`);
          if (checkoutResult.checkoutInfo.expressWallets.length > 0) {
            console.log(`    → Express wallets: ${checkoutResult.checkoutInfo.expressWallets.join(', ')}`);
          }
          if (checkoutResult.checkoutInfo.bnplOptions.length > 0) {
            console.log(`    → BNPL options: ${checkoutResult.checkoutInfo.bnplOptions.join(', ')}`);
          }
        }
      }
    } catch (error) {
      if (opts.verbose) {
        console.log(`  ⚠ Checkout test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (opts.verbose && !checkoutReached) {
      console.log(`  ⚠ Checkout not reached (may have timed out or cart was empty)`);
    }
    
  } finally {
    await browser.close();
  }

  const completedAt = new Date().toISOString();
  
  // Add subscription/loyalty providers to thirdParties for unified detection
  if (subscriptionsDetected && subscriptionProvider) {
    thirdParties.add(subscriptionProvider);
    // Recharge is a red flag
    if (subscriptionProvider === 'Recharge') {
      redFlags.add('Recharge');
    }
  }
  if (loyaltyInfo.detected && loyaltyInfo.provider) {
    thirdParties.add(loyaltyInfo.provider);
    // Smile.io is a red flag
    if (loyaltyInfo.provider === 'Smile.io') {
      redFlags.add('Smile.io');
    }
  }
  
  // Merge all extracted policies into one
  const mergedPolicy = mergePolicies(extractedPolicies);
  const policyInfo: ExtractedPolicyInfo = {
    returnWindow: mergedPolicy.returnWindow,
    returnFees: mergedPolicy.returnFees,
    freeReturns: mergedPolicy.freeReturns,
    freeExchanges: mergedPolicy.freeExchanges,
    finalSaleItems: mergedPolicy.finalSaleItems,
    restockingFee: mergedPolicy.restockingFee,
    returnPortal: mergedPolicy.returnPortal,
    returnProvider: mergedPolicy.returnProvider,
    shippingRestrictions: mergedPolicy.shippingRestrictions,
    giftWithPurchase: mergedPolicy.giftWithPurchase || gwpDetected,
    priceAdjustmentWindow: mergedPolicy.priceAdjustmentWindow,
  };
  
  // Build catalog features summary
  const catalogFeatures: CatalogFeaturesInfo = {
    bundlesDetected,
    bundleEvidence: bundleEvidence.slice(0, 3),
    customizableProducts,
    customizationTypes: Array.from(customizationTypes),
    virtualProducts,
    virtualProductTypes: Array.from(virtualProductTypes),
    giftCardsDetected,
    giftCardTypes: Array.from(giftCardTypes),
    subscriptionsDetected,
    subscriptionProvider,
    preOrdersDetected,
    gwpDetected: gwpDetected || mergedPolicy.giftWithPurchase || false,
  };

  const result: ScrapeResult = {
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
      // Extracted info
      policyInfo,
      checkoutInfo,
      catalogFeatures,
      loyaltyProgram: loyaltyInfo,
      localization: localizationInfo,
      marketplacePresence: marketplaceInfo,
    },
    pages,
  };
  
  // Log the assessment for debugging and audit
  try {
    await logAssessment(result, debugInfo);
  } catch (logError) {
    console.warn(`  ⚠️ Failed to log assessment: ${logError}`);
  }
  
  return result;
}

interface CrawlTarget {
  url: string;
  type: 'home' | 'pdp' | 'collection' | 'cart' | 'checkout' | 'policy' | 'rewards' | 'other';
  source?: string; // Where we found this link (footer, nav, sitemap)
}

// Patterns to classify discovered links
const LINK_CLASSIFIERS: { pattern: RegExp; type: CrawlTarget['type']; priority: number }[] = [
  // Policy pages (high priority)
  { pattern: /\/(policies?|terms|privacy|refund|return|shipping|exchange|warranty|guarantee)/i, type: 'policy', priority: 10 },
  { pattern: /\/(faq|help|support|contact)/i, type: 'other', priority: 5 },
  
  // Rewards/Loyalty pages (high priority)
  { pattern: /\/(rewards?|loyalty|points|vip|member)/i, type: 'rewards', priority: 10 },
  
  // Collection pages
  { pattern: /\/(collections?|shop|category|categories|products?)$/i, type: 'collection', priority: 8 },
  { pattern: /\/collections\/[^\/]+$/i, type: 'collection', priority: 7 },
  
  // Cart/Checkout
  { pattern: /\/(cart|bag|basket)$/i, type: 'cart', priority: 6 },
  { pattern: /\/checkout/i, type: 'checkout', priority: 6 },
  
  // Product pages (lower priority - we'll discover these from collections)
  { pattern: /\/products\/[^\/]+$/i, type: 'pdp', priority: 3 },
];

// Link text patterns that help classify ambiguous URLs
const TEXT_CLASSIFIERS: { pattern: RegExp; type: CrawlTarget['type'] }[] = [
  { pattern: /^(shipping|delivery)\s*(policy|info|information)?$/i, type: 'policy' },
  { pattern: /^return(s)?\s*((&|and)\s*exchange(s)?)?(\s*policy)?$/i, type: 'policy' },
  { pattern: /^refund\s*(policy)?$/i, type: 'policy' },
  { pattern: /^(terms|privacy|legal)/i, type: 'policy' },
  { pattern: /^(rewards?|loyalty|points|vip|perks)/i, type: 'rewards' },
  { pattern: /^(faq|help|support|contact)/i, type: 'other' },
  { pattern: /^(wholesale|trade|b2b)/i, type: 'other' },
  { pattern: /^(about|our\s*story)/i, type: 'other' },
  { pattern: /^(shop\s*all|all\s*products|collections?)/i, type: 'collection' },
];

/**
 * Discover crawl targets by extracting links from the homepage
 * Much more reliable than guessing URL patterns
 */
async function discoverCrawlTargets(page: Page, seedUrl: string, verbose: boolean): Promise<CrawlTarget[]> {
  const base = new URL(seedUrl).origin;
  const discovered = new Map<string, CrawlTarget>();
  
  // Always include homepage
  discovered.set(base, { url: base, type: 'home', source: 'seed' });
  discovered.set(base + '/', { url: base + '/', type: 'home', source: 'seed' });
  
  // Extract all links from the page, focusing on footer and nav
  // Note: Using Function constructor to avoid bundler transformation issues with page.evaluate
  const links = await page.evaluate(new Function(`
    var results = [];
    
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var anchor = anchors[i];
      var href = anchor.href;
      var text = (anchor.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 100);
      var ariaLabel = anchor.getAttribute('aria-label') || '';
      
      // Determine location
      var location = 'body';
      if (anchor.closest('footer, [class*="footer"], [id*="footer"], [role="contentinfo"]')) {
        location = 'footer';
      } else if (anchor.closest('nav, [class*="nav"], [id*="nav"], header, [role="navigation"]')) {
        location = 'nav';
      }
      
      if (href && (text || ariaLabel)) {
        results.push({
          href: href,
          text: text || ariaLabel,
          location: location
        });
      }
    }
    
    return results;
  `) as () => { href: string; text: string; location: string }[]);
  
  if (verbose) {
    console.log(`  → Found ${links.length} links on homepage`);
  }
  
  // Process discovered links
  for (const link of links) {
    try {
      const url = new URL(link.href);
      
      // Skip external links, anchors, and non-http(s)
      if (url.origin !== base) continue;
      if (url.hash && url.pathname === new URL(seedUrl).pathname) continue;
      if (!url.protocol.startsWith('http')) continue;
      
      // Skip common non-content paths
      if (/\.(jpg|jpeg|png|gif|svg|css|js|woff|ico|pdf)$/i.test(url.pathname)) continue;
      if (/\/(cdn|assets|static|media)\//i.test(url.pathname)) continue;
      if (/\/(account|login|register|cart\/add|checkout)/i.test(url.pathname)) continue;
      
      // Normalize URL (remove trailing slash for comparison, keep query params that matter)
      const normalizedUrl = url.origin + url.pathname.replace(/\/$/, '');
      
      // Skip if already discovered with same or higher priority
      if (discovered.has(normalizedUrl)) continue;
      
      // Classify the link
      let type: CrawlTarget['type'] = 'other';
      let priority = 0;
      
      // First try URL pattern matching
      for (const classifier of LINK_CLASSIFIERS) {
        if (classifier.pattern.test(url.pathname)) {
          type = classifier.type;
          priority = classifier.priority;
          break;
        }
      }
      
      // If still 'other', try text-based classification
      if (type === 'other' || priority < 5) {
        for (const classifier of TEXT_CLASSIFIERS) {
          if (classifier.pattern.test(link.text)) {
            type = classifier.type;
            priority = 8; // Text matches are reliable
            break;
          }
        }
      }
      
      // Boost priority for footer links (these are typically important policy/info pages)
      if (link.location === 'footer') {
        priority += 2;
      }
      
      discovered.set(normalizedUrl, {
        url: normalizedUrl,
        type,
        source: link.location,
      });
      
    } catch {
      // Invalid URL, skip
    }
  }
  
  // Sitemap fetching removed - footer links provide sufficient coverage
  
  // Convert to array and sort by priority/type
  let targets = Array.from(discovered.values());
  
  // Sort: home first, then by type priority
  // Policy and rewards are MORE important than bulk collections
  const typePriority: Record<CrawlTarget['type'], number> = {
    'home': 100,
    'policy': 95,      // Moved up - critical for assessment
    'rewards': 94,     // Moved up - often missed
    'cart': 90,
    'collection': 80,  // Moved down - we only need a few
    'checkout': 70,
    'other': 50,
    'pdp': 10, // PDPs will be discovered from collections
  };
  
  targets.sort((a, b) => (typePriority[b.type] || 0) - (typePriority[a.type] || 0));
  
  // Limit bulk page types to avoid wasting crawl budget
  const MAX_COLLECTIONS = 2;  // Just enough to detect bundles and find products
  const MAX_PDPS = 0;         // PDPs discovered from collections separately
  
  let collectionCount = 0;
  let pdpCount = 0;
  
  targets = targets.filter(t => {
    if (t.type === 'collection') {
      collectionCount++;
      return collectionCount <= MAX_COLLECTIONS;
    }
    if (t.type === 'pdp') {
      pdpCount++;
      return pdpCount <= MAX_PDPS;
    }
    return true;
  });
  
  if (verbose) {
    const byType = targets.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`  → Discovered targets: ${JSON.stringify(byType)}`);
  }
  
  return targets;
}

/**
 * Fallback targets when dynamic discovery fails
 * Uses common e-commerce URL patterns
 */
function getFallbackTargets(seedUrl: string): CrawlTarget[] {
  const base = seedUrl.replace(/\/$/, '');
  return [
    { url: base, type: 'home', source: 'fallback' },
    { url: `${base}/collections/all`, type: 'collection', source: 'fallback' },
    { url: `${base}/products`, type: 'collection', source: 'fallback' },
    { url: `${base}/policies/shipping-policy`, type: 'policy', source: 'fallback' },
    { url: `${base}/policies/refund-policy`, type: 'policy', source: 'fallback' },
    { url: `${base}/pages/faq`, type: 'other', source: 'fallback' },
    { url: `${base}/cart`, type: 'cart', source: 'fallback' },
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

interface CheckoutTestResult {
  reachedCheckout: boolean;
  stoppedAt?: string;
  checkoutInfo: CheckoutFlowInfo;
}

/**
 * Test checkout flow by adding an item to cart and navigating to checkout
 * Captures express wallets, payment methods, BNPL options, and shipping
 */
async function testCheckoutFlow(
  context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newContext']>>,
  seedUrl: string,
  opts: Required<ScrapeOptions>
): Promise<CheckoutTestResult | null> {
  const page = await context.newPage();
  const base = seedUrl.replace(/\/$/, '');
  
  try {
    // Step 1: Go to a product page (use a common path)
    const productPaths = [
      `${base}/collections/all`,
      `${base}/products`,
    ];
    
    let productUrl: string | null = null;
    
    for (const path of productPaths) {
      try {
        await page.goto(path, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        
        // Find a product link
        const productLink = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href*="/products/"]'));
          for (const link of links) {
            const href = (link as HTMLAnchorElement).href;
            // Skip collection links and variants
            if (!href.includes('?variant=') && !href.includes('/products?')) {
              return href;
            }
          }
          return null;
        });
        
        if (productLink) {
          productUrl = productLink;
          break;
        }
      } catch {
        continue;
      }
    }
    
    if (!productUrl) {
      await page.close();
      return null;
    }
    
    // Step 2: Go to the product page
    await page.goto(productUrl, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    
    // Step 3: Try to add to cart - expanded selectors for different themes
    const addToCartSelectors = [
      // Standard Shopify patterns
      'button[name="add"]',
      'button[type="submit"][form*="product"]',
      '.product-form__submit',
      '[data-add-to-cart]',
      '[data-action="add-to-cart"]',
      
      // Text-based selectors (case variations)
      'button:has-text("Add to cart")',
      'button:has-text("Add to Cart")',
      'button:has-text("ADD TO CART")',
      'button:has-text("Add to bag")',
      'button:has-text("Add to Bag")',
      'button:has-text("ADD TO BAG")',
      'button:has-text("Buy now")',
      'button:has-text("Buy Now")',
      'button:has-text("Add")',
      
      // Class-based selectors
      '.add-to-cart',
      '#add-to-cart',
      '.btn-add-to-cart',
      '.btn-addtocart',
      '.addtocart',
      '.add-to-cart-btn',
      '.product__add-to-cart',
      '.product-add-to-cart',
      '[class*="add-to-cart"]',
      '[class*="addToCart"]',
      
      // Dawn theme (Shopify 2.0)
      '.product-form__buttons button[type="submit"]',
      '.shopify-payment-button button',
      
      // Common theme patterns
      '#AddToCart',
      '#addToCart',
      '[id*="AddToCart"]',
      '[id*="add-to-cart"]',
      
      // Aria labels
      'button[aria-label*="Add to cart"]',
      'button[aria-label*="Add to bag"]',
    ];
    
    let addedToCart = false;
    for (const selector of addToCartSelectors) {
      try {
        const button = await page.$(selector);
        if (button && await button.isVisible()) {
          await button.click();
          await page.waitForTimeout(2000);
          addedToCart = true;
          break;
        }
      } catch {
        continue;
      }
    }
    
    if (!addedToCart) {
      // Try form submission
      try {
        const form = await page.$('form[action*="/cart/add"]');
        if (form) {
          await form.evaluate((f: HTMLFormElement) => f.submit());
          await page.waitForTimeout(2000);
          addedToCart = true;
        }
      } catch {
        // Continue anyway
      }
    }
    
    // Step 4: Navigate to checkout
    // Try direct checkout URL first (most reliable)
    const checkoutPaths = [
      `${base}/checkout`,
      `${base}/checkouts`,
    ];
    
    let checkoutHtml = '';
    let checkoutText = '';
    let reachedCheckout = false;
    let stoppedAt: string | undefined;
    
    // First try clicking checkout button from cart
    try {
      await page.goto(`${base}/cart`, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      
      // Capture cart page for payment info (often shows express wallets)
      checkoutHtml = await page.content();
      checkoutText = await page.evaluate(() => document.body.innerText);
      
      // Try to click checkout button
      const checkoutSelectors = [
        'button[name="checkout"]',
        'a[href*="/checkout"]',
        'button:has-text("Checkout")',
        'button:has-text("Check out")',
        'input[name="checkout"]',
        '.checkout-button',
        '#checkout',
      ];
      
      for (const selector of checkoutSelectors) {
        try {
          const button = await page.$(selector);
          if (button && await button.isVisible()) {
            await button.click();
            await page.waitForTimeout(3000);
            
            const currentUrl = page.url();
            if (currentUrl.includes('checkout') || currentUrl.includes('checkouts')) {
              reachedCheckout = true;
              stoppedAt = currentUrl;
              // Capture checkout page content
              checkoutHtml = await page.content();
              checkoutText = await page.evaluate(() => document.body.innerText);
            }
            break;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Cart navigation failed
    }
    
    // If we didn't reach checkout, try direct navigation
    if (!reachedCheckout) {
      for (const path of checkoutPaths) {
        try {
          await page.goto(path, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          
          const currentUrl = page.url();
          // Check if we're on a checkout page (not redirected to login/cart)
          if (currentUrl.includes('checkout')) {
            reachedCheckout = true;
            stoppedAt = currentUrl;
            checkoutHtml = await page.content();
            checkoutText = await page.evaluate(() => document.body.innerText);
            break;
          }
        } catch {
          continue;
        }
      }
    }
    
    // Extract checkout info from whatever we captured
    const checkoutInfo = extractCheckoutInfo(checkoutHtml, checkoutText);
    
    // If checkout reached but we got redirected (login required), note it
    if (!reachedCheckout && page.url().includes('account') || page.url().includes('login')) {
      stoppedAt = 'Login required';
    }
    
    await page.close();
    
    return {
      reachedCheckout,
      stoppedAt,
      checkoutInfo,
    };
    
  } catch (error) {
    await page.close();
    throw error;
  }
}
