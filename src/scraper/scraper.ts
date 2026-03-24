/**
 * Main scraper orchestration
 * Coordinates browser, crawling, extraction, and analysis
 */

import type { ScrapeResult, ScrapeOptions, PageData, CrawlSummary, NetworkRequest, DGFinding, DetectedTechnology, ExtractedPolicyInfo, CheckoutFlowInfo, CatalogFeaturesInfo, LoyaltyProgramInfo, LocalizationDetected, MarketplacePresence } from './types.js';
import { detectThirdParty, isRedFlag, scanForDangerousGoods, detectB2B, extractProductLinks } from './detectors.js';
import { initWappalyzer, analyzeWithWappalyzer, filterEcommerceRelevant } from './wappalyzer.js';
import { extractPolicyInfo, mergePolicies, type ExtractedPolicy } from './policyExtractor.js';
import { detectBundles, detectCustomizableProducts, detectVirtualProducts, detectGiftCards, detectSubscriptions, detectPreOrders, detectLoyaltyProgram, detectLocalization, detectMarketplaces, detectGWP, detectBNPLWidgets } from './catalogDetector.js';
import { logAssessment, type DebugInfo } from '../logger/index.js';
import { gotoWithRetry, classifyError, randomDelay } from './helpers.js';
import { launchStealthBrowser, dismissCookieConsent, slowScroll } from './browser.js';
import { discoverCrawlTargets, getFallbackTargets, type CrawlTarget } from './crawler.js';
import { extractPageData, detectPlatform, detectHeadless } from './pageExtractor.js';
import { testCheckoutFlow } from './checkoutTester.js';

const DEFAULT_OPTIONS: Required<ScrapeOptions> = {
  maxPages: 50,
  timeout: 15000,
  scrapeTimeout: 120000,
  takeScreenshots: true,
  verbose: false,
  onProgress: () => {},
};

let scrapeProgress = { phase: 'initializing', pagesScraped: 0, currentUrl: '' };

export async function scrape(seedUrl: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  scrapeProgress = { phase: 'initializing', pagesScraped: 0, currentUrl: seedUrl };

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

  // Initialize services
  const wappalyzerReady = await initWappalyzer();
  if (opts.verbose && wappalyzerReady) console.log('  ✓ Wappalyzer initialized');

  // Launch browser with stealth config
  const { browser, context, config } = await launchStealthBrowser(opts.verbose);

  // Initialize accumulators
  const state = createInitialState(seedUrl, config);
  const debugInfo = createDebugInfo(config);

  try {
    // Phase 0: Discover pages
    const targets = await discoverPages(context, seedUrl, opts);

    // Phase 1: Scrape discovered pages
    await scrapeDiscoveredPages(context, targets, state, opts, debugInfo, wappalyzerReady, startedAt);

    // Phase 2: Scrape product pages
    await scrapeProductPages(context, state, opts, startedAt);

    // Phase 3: Test checkout
    await testCheckout(context, seedUrl, state, opts, startedAt);

  } finally {
    await browser.close();
  }

  return buildResult(seedUrl, startedAt, state, debugInfo);
}

// ============ State Management ============

interface ScrapeState {
  pages: PageData[];
  visited: Set<string>;
  thirdParties: Set<string>;
  allTechnologies: Map<string, DetectedTechnology>;
  redFlags: Set<string>;
  b2bIndicators: Set<string>;
  dangerousGoods: DGFinding[];
  errors: CrawlSummary['errors'];
  platformDetected?: string;
  globalEDetected: boolean;
  returngoDetected: boolean;
  shopPayDetected: boolean;
  checkoutReached: boolean;
  checkoutStoppedAt?: string;
  productPagesScraped: number;
  extractedPolicies: ExtractedPolicy[];
  checkoutInfo?: CheckoutFlowInfo;
  bundleEvidence: string[];
  bundlesDetected: boolean;
  customizationTypes: Set<string>;
  customizableProducts: boolean;
  virtualProductTypes: Set<string>;
  virtualProducts: boolean;
  giftCardTypes: Set<string>;
  giftCardsDetected: boolean;
  subscriptionsDetected: boolean;
  subscriptionProvider?: string;
  preOrdersDetected: boolean;
  gwpDetected: boolean;
  loyaltyInfo: LoyaltyProgramInfo;
  localizationInfo: LocalizationDetected;
  marketplaceInfo: MarketplacePresence;
  discoveredProductUrls: string[];
  domain: string;
}

function createInitialState(seedUrl: string, _config: { userAgent: string }): ScrapeState {
  return {
    pages: [],
    visited: new Set(),
    thirdParties: new Set(),
    allTechnologies: new Map(),
    redFlags: new Set(),
    b2bIndicators: new Set(),
    dangerousGoods: [],
    errors: [],
    globalEDetected: false,
    returngoDetected: false,
    shopPayDetected: false,
    checkoutReached: false,
    productPagesScraped: 0,
    extractedPolicies: [],
    bundleEvidence: [],
    bundlesDetected: false,
    customizationTypes: new Set(),
    customizableProducts: false,
    virtualProductTypes: new Set(),
    virtualProducts: false,
    giftCardTypes: new Set(),
    giftCardsDetected: false,
    subscriptionsDetected: false,
    preOrdersDetected: false,
    gwpDetected: false,
    loyaltyInfo: { detected: false, evidence: [] },
    localizationInfo: { countrySelector: false, multiLanguage: false, languagesDetected: [], multiCurrency: false, currenciesDetected: [] },
    marketplaceInfo: { detected: false, marketplaces: [] },
    discoveredProductUrls: [],
    domain: new URL(seedUrl).hostname,
  };
}

function createDebugInfo(config: { userAgent: string; viewport: { width: number; height: number } }): Partial<DebugInfo> {
  return {
    userAgent: config.userAgent,
    viewportSize: config.viewport,
    totalRequestsIntercepted: 0,
    redirectsDetected: [],
    blockedRequests: [],
    consoleErrors: [],
  };
}

// ============ Discovery Phase ============

async function discoverPages(
  context: Awaited<ReturnType<typeof launchStealthBrowser>>['context'],
  seedUrl: string,
  opts: Required<ScrapeOptions>
): Promise<CrawlTarget[]> {
  scrapeProgress.phase = 'discovery';
  opts.onProgress({ phase: 'init', message: 'Discovering site structure...' });
  if (opts.verbose) console.log('  Discovering site structure...');

  const discoveryPage = await context.newPage();
  const seedResponse = await discoveryPage.goto(seedUrl, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });

  // Same as gotoWithRetry: error pages (400, 402, 404, …) often never hit network idle — don't wait 5s per seed.
  if (!seedResponse || seedResponse.status() < 400) {
    try {
      await discoveryPage.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Network idle timeout is fine
    }
    await discoveryPage.waitForTimeout(1000);
  } else if (opts.verbose) {
    console.log(`  ⚠ Seed URL HTTP ${seedResponse.status()} — skipping network idle wait`);
  }

  // Dismiss cookie consent banner if present
  await dismissCookieConsent(discoveryPage, opts.verbose);

  let targets: CrawlTarget[];
  try {
    const discoveryPromise = discoverCrawlTargets(discoveryPage, seedUrl, opts.verbose);
    const timeoutPromise = new Promise<CrawlTarget[]>((_, reject) =>
      setTimeout(() => reject(new Error('Discovery timeout')), 10000)
    );
    targets = await Promise.race([discoveryPromise, timeoutPromise]);
  } catch (discoveryError) {
    if (opts.verbose) console.log(`  ⚠ Discovery failed (${discoveryError}), using fallback targets`);
    targets = getFallbackTargets(seedUrl);
  }

  await discoveryPage.close();
  if (opts.verbose) console.log(`  Found ${targets.length} pages to crawl`);
  return targets;
}

// ============ Page Scraping Phase ============

async function scrapeDiscoveredPages(
  context: Awaited<ReturnType<typeof launchStealthBrowser>>['context'],
  targets: CrawlTarget[],
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  debugInfo: Partial<DebugInfo>,
  wappalyzerReady: boolean,
  startedAt: string
): Promise<void> {
  const totalTargets = Math.min(targets.length, opts.maxPages);
  let pageIndex = 0;
  let lastVisitedUrl: string | undefined;

  for (const target of targets) {
    if (state.visited.size >= opts.maxPages) break;
    if (state.visited.has(target.url)) continue;

    pageIndex++;
    scrapeProgress.phase = 'page-scraping';
    scrapeProgress.currentUrl = target.url;
    scrapeProgress.pagesScraped = pageIndex;

    opts.onProgress({
      phase: 'scraping',
      message: `Scraping ${target.type} page...`,
      current: pageIndex,
      total: totalTargets,
      url: new URL(target.url).pathname,
    });

    if (opts.verbose) {
      const elapsed = ((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1);
      console.log(`  [${pageIndex}/${totalTargets}] ${target.type}: ${new URL(target.url).pathname} (${elapsed}s)`);
    }

    try {
      if (pageIndex > 1) await randomDelay(500, 1500);

      const page = await context.newPage();
      const networkRequests: NetworkRequest[] = [];

      // Set up network tracking
      setupNetworkTracking(page, state, networkRequests, debugInfo);

      // Navigate with retry, including referer from last visited page
      const navResult = await gotoWithRetry(page, target.url, {
        timeout: opts.timeout,
        maxRetries: 2,
        verbose: opts.verbose,
        referer: lastVisitedUrl,
        waitForNetworkIdle: true,
      });

      // Handle errors
      if (navResult.error || navResult.blocked) {
        handleNavigationError(target, navResult, state, opts);
        await page.close();
        continue;
      }

      // Check HTTP status
      const statusCode = navResult.response?.status();
      if (statusCode && statusCode >= 400) {
        state.errors.push({ url: target.url, error: `HTTP ${statusCode}`, type: classifyError('', statusCode) });
        if (opts.verbose) console.log(`  ✗ ${target.type}: ${target.url} - HTTP ${statusCode}`);
        await page.close();
        continue;
      }

      // Check for cross-domain redirects
      if (!validateRedirect(page, target, state, debugInfo)) {
        await page.close();
        continue;
      }

      state.visited.add(target.url);
      lastVisitedUrl = page.url();

      // Dismiss cookie consent on first few pages (may appear after navigation)
      if (pageIndex <= 3) {
        await dismissCookieConsent(page, opts.verbose);
      }

      // Slow scroll to trigger lazy loading and mimic human behavior
      if (target.type === 'home' || target.type === 'collection' || target.type === 'policy') {
        await slowScroll(page, { steps: 3, verbose: opts.verbose });
      }

      // Detect platform
      if (!state.platformDetected) {
        state.platformDetected = await detectPlatform(page);
      }

      // Track checkout
      if (target.type === 'checkout') {
        state.checkoutReached = true;
        state.checkoutStoppedAt = page.url();
      }

      // Extract page data
      const pageData = await extractPageData(page, navResult.response, networkRequests, opts);
      state.pages.push(pageData);
      scrapeProgress.pagesScraped = state.pages.length;

      // Process page content
      await processPageContent(target, pageData, state, wappalyzerReady, opts);

      if (opts.verbose) console.log(`  ✓ ${target.type}: ${pageData.url}`);
      await page.close();

    } catch (error) {
      handlePageError(error, target, state, opts);
    }
  }
}

function setupNetworkTracking(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof launchStealthBrowser>>['context']['newPage']>>,
  state: ScrapeState,
  networkRequests: NetworkRequest[],
  debugInfo: Partial<DebugInfo>
): void {
  page.on('request', (request) => {
    const reqUrl = request.url();
    debugInfo.totalRequestsIntercepted = (debugInfo.totalRequestsIntercepted || 0) + 1;

    const detected = detectThirdParty(reqUrl);
    if (detected) {
      state.thirdParties.add(detected);
      networkRequests.push({ url: reqUrl, type: request.resourceType(), thirdParty: detected });

      if (isRedFlag(detected)) state.redFlags.add(detected);
      if (detected === 'Global-e') state.globalEDetected = true;
      if (detected === 'ReturnGO') state.returngoDetected = true;
      if (detected === 'Shop Pay') state.shopPayDetected = true;
    } else {
      networkRequests.push({ url: reqUrl, type: request.resourceType() });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      debugInfo.consoleErrors?.push(msg.text());
    }
  });
}

function handleNavigationError(
  target: CrawlTarget,
  navResult: { error?: string | null; blocked?: boolean; blockType?: string | null },
  state: ScrapeState,
  opts: Required<ScrapeOptions>
): void {
  if (navResult.error) {
    state.errors.push({ url: target.url, error: navResult.error, type: classifyError(navResult.error) });
    if (opts.verbose) console.log(`  ✗ ${target.type}: ${target.url} - ${navResult.error}`);
  } else if (navResult.blocked) {
    state.errors.push({ url: target.url, error: `Bot detection: ${navResult.blockType}`, type: 'blocked' });
    if (opts.verbose) console.log(`  ⚠️ ${target.type}: ${target.url} - Blocked by ${navResult.blockType}`);
  }
}

function validateRedirect(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof launchStealthBrowser>>['context']['newPage']>>,
  target: CrawlTarget,
  state: ScrapeState,
  debugInfo: Partial<DebugInfo>
): boolean {
  const finalUrl = page.url();
  const targetDomain = new URL(target.url).hostname;
  const finalDomain = new URL(finalUrl).hostname;

  if (finalUrl !== target.url) {
    debugInfo.redirectsDetected?.push(`${target.url} → ${finalUrl}`);

    if (finalDomain !== targetDomain && !finalDomain.includes(targetDomain.replace('www.', ''))) {
      console.warn(`  ⚠️ REDIRECT TO DIFFERENT DOMAIN: ${target.url} → ${finalUrl}`);
      state.errors.push({ url: target.url, error: `Redirected to different domain: ${finalUrl}`, type: 'other' });
      return false;
    }
  }
  return true;
}

async function processPageContent(
  target: CrawlTarget,
  pageData: PageData,
  state: ScrapeState,
  wappalyzerReady: boolean,
  opts: Required<ScrapeOptions>
): Promise<void> {
  const networkUrls = pageData.networkRequests.map(r => r.url);

  // Policy extraction
  if ((target.type === 'policy' || target.type === 'other') && pageData.cleanedText.length > 100) {
    const policyInfo = extractPolicyInfo(pageData.cleanedText, pageData.url);
    state.extractedPolicies.push(policyInfo);
    if (policyInfo.returnProvider) state.thirdParties.add(policyInfo.returnProvider);

    const marketplace = detectMarketplaces(pageData.cleanedText, pageData.rawHtml || '');
    if (marketplace.detected) {
      state.marketplaceInfo.detected = true;
      marketplace.marketplaces.forEach(m => {
        if (!state.marketplaceInfo.marketplaces.includes(m)) {
          state.marketplaceInfo.marketplaces.push(m);
        }
      });
    }
  }

  // Catalog detection on home/collection pages
  if (target.type === 'home' || target.type === 'collection') {
    runCatalogDetection(pageData, state, networkUrls);

    if (target.type === 'home') {
      state.localizationInfo = detectLocalization(pageData.cleanedText, pageData.rawHtml || '');
    }

    // Wappalyzer analysis
    if (wappalyzerReady && pageData.rawHtml) {
      await runWappalyzerAnalysis(pageData, state, opts);
    }
  }

  // Loyalty detection on rewards pages
  if (target.type === 'rewards') {
    const loyalty = detectLoyaltyProgram(pageData.cleanedText, pageData.rawHtml || '', networkUrls);
    if (loyalty.detected) {
      state.loyaltyInfo.detected = true;
      if (loyalty.provider) state.loyaltyInfo.provider = loyalty.provider;
      if (loyalty.programName) state.loyaltyInfo.programName = loyalty.programName;
      loyalty.evidence.forEach(e => {
        if (!state.loyaltyInfo.evidence.includes(e)) state.loyaltyInfo.evidence.push(e);
      });
    }
  }

  // DG and B2B scanning
  const dgMatches = scanForDangerousGoods(pageData.cleanedText);
  for (const match of dgMatches) {
    state.dangerousGoods.push({ ...match, foundOnUrl: pageData.url });
  }

  const b2b = detectB2B(pageData.cleanedText, pageData.url);
  for (const indicator of b2b.evidence) {
    state.b2bIndicators.add(indicator);
  }

  // Product link extraction
  if (target.type === 'collection' && pageData.rawHtml) {
    const productUrls = extractProductLinks(pageData.rawHtml, pageData.url);
    for (const url of productUrls) {
      if (!state.discoveredProductUrls.includes(url)) {
        state.discoveredProductUrls.push(url);
      }
    }

    const bnplWidgets = detectBNPLWidgets(pageData.cleanedText, pageData.rawHtml);
    if (bnplWidgets.detected) {
      for (const provider of bnplWidgets.providers) {
        if (provider !== 'BNPL (unspecified)') state.thirdParties.add(provider);
      }
    }
  }
}

function runCatalogDetection(pageData: PageData, state: ScrapeState, networkUrls: string[]): void {
  const bundles = detectBundles(pageData.cleanedText, pageData.url);
  if (bundles.detected) {
    state.bundlesDetected = true;
    bundles.evidence.forEach(e => {
      if (!state.bundleEvidence.includes(e)) state.bundleEvidence.push(e);
    });
  }

  const virtual = detectVirtualProducts(pageData.cleanedText, pageData.url);
  if (virtual.detected) {
    state.virtualProducts = true;
    virtual.types.forEach(t => state.virtualProductTypes.add(t));
  }

  const subs = detectSubscriptions(pageData.cleanedText, pageData.rawHtml || '', networkUrls);
  if (subs.detected) {
    state.subscriptionsDetected = true;
    if (subs.provider) state.subscriptionProvider = subs.provider;
  }

  const loyalty = detectLoyaltyProgram(pageData.cleanedText, pageData.rawHtml || '', networkUrls);
  if (loyalty.detected) {
    state.loyaltyInfo.detected = true;
    if (loyalty.provider) state.loyaltyInfo.provider = loyalty.provider;
    if (loyalty.programName) state.loyaltyInfo.programName = loyalty.programName;
    loyalty.evidence.forEach(e => {
      if (!state.loyaltyInfo.evidence.includes(e)) state.loyaltyInfo.evidence.push(e);
    });
  }

  const gwp = detectGWP(pageData.cleanedText);
  if (gwp.detected) state.gwpDetected = true;
}

async function runWappalyzerAnalysis(
  pageData: PageData,
  state: ScrapeState,
  opts: Required<ScrapeOptions>
): Promise<void> {
  const wapResultsRaw = await analyzeWithWappalyzer(pageData.url, pageData.rawHtml!, pageData.headers);
  const wapResults = filterEcommerceRelevant(wapResultsRaw);

  for (const tech of wapResults) {
    const techNameLower = tech.name.toLowerCase();
    if (state.platformDetected && techNameLower === state.platformDetected.toLowerCase()) continue;

    if (!state.allTechnologies.has(techNameLower)) {
      state.allTechnologies.set(techNameLower, {
        name: tech.name,
        confidence: String(tech.confidence),
        version: tech.version || null,
        icon: tech.icon,
        website: tech.website,
        categories: tech.categories.map(c => ({ [String(c.id)]: c.name })),
      });
      state.thirdParties.add(tech.name);
    }
  }

  if (opts.verbose && wapResults.length > 0) {
    console.log(`    → Wappalyzer found ${wapResults.length} relevant technologies`);
  }
}

function handlePageError(error: unknown, target: CrawlTarget, state: ScrapeState, opts: Required<ScrapeOptions>): void {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';
  state.errors.push({ url: target.url, error: errorMsg, type: 'other' });
  if (opts.verbose) console.log(`  ✗ ${target.type}: ${target.url} - ${error}`);
}

// ============ Product Pages Phase ============

async function scrapeProductPages(
  context: Awaited<ReturnType<typeof launchStealthBrowser>>['context'],
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  startedAt: string
): Promise<void> {
  scrapeProgress.phase = 'product-pages';
  const maxProducts = Math.min(5, opts.maxPages - state.visited.size);
  const productCount = Math.min(state.discoveredProductUrls.length, maxProducts);

  opts.onProgress({
    phase: 'scraping',
    message: `Scraping ${productCount} product pages...`,
    current: state.visited.size,
    total: state.visited.size + productCount + 1,
  });

  if (opts.verbose && state.discoveredProductUrls.length > 0) {
    const elapsed = ((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1);
    console.log(`  [products] Scraping ${productCount} product pages... (${elapsed}s)`);
  }

  // Use last collection URL as referer for product pages
  const collectionPage = state.pages.find(p => p.url.includes('/collection'));
  let lastProductUrl = collectionPage?.url;

  for (let i = 0; i < Math.min(state.discoveredProductUrls.length, maxProducts); i++) {
    const productUrl = state.discoveredProductUrls[i];
    if (state.visited.has(productUrl)) continue;

    try {
      await randomDelay(500, 1200);
      const page = await context.newPage();
      const networkRequests: NetworkRequest[] = [];

      page.on('request', (request) => {
        const reqUrl = request.url();
        const detected = detectThirdParty(reqUrl);
        if (detected) {
          state.thirdParties.add(detected);
          networkRequests.push({ url: reqUrl, type: request.resourceType(), thirdParty: detected });
          if (isRedFlag(detected)) state.redFlags.add(detected);
          if (detected === 'Shop Pay') state.shopPayDetected = true;
        } else {
          networkRequests.push({ url: reqUrl, type: request.resourceType() });
        }
      });

      const navResult = await gotoWithRetry(page, productUrl, {
        timeout: opts.timeout,
        maxRetries: 1,
        verbose: opts.verbose,
        referer: lastProductUrl,
        waitForNetworkIdle: true,
      });

      if (navResult.error || navResult.blocked) {
        state.errors.push({
          url: productUrl,
          error: navResult.error || `Bot detection: ${navResult.blockType}`,
          type: navResult.blocked ? 'blocked' : classifyError(navResult.error || ''),
        });
        await page.close();
        continue;
      }

      const productStatus = navResult.response?.status();
      if (productStatus && productStatus >= 400) {
        state.errors.push({
          url: productUrl,
          error: `HTTP ${productStatus}`,
          type: classifyError('', productStatus),
        });
        if (opts.verbose) console.log(`  ✗ PDP: ${productUrl} - HTTP ${productStatus}`);
        await page.close();
        continue;
      }

      state.visited.add(productUrl);
      state.productPagesScraped++;
      lastProductUrl = page.url();

      // Slow scroll on product pages to trigger lazy images and BNPL widgets
      await slowScroll(page, { steps: 2, verbose: opts.verbose });

      const pageData = await extractPageData(page, navResult.response, networkRequests, opts);
      pageData.matchedCategories.push('pdp');
      state.pages.push(pageData);

      // PDP-specific processing
      await processProductPage(pageData, state, opts);

      if (opts.verbose) console.log(`  ✓ PDP: ${pageData.url}`);
      await page.close();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      state.errors.push({ url: productUrl, error: errorMsg, type: 'other' });

      if (errorMsg.includes('context has been closed') || errorMsg.includes('Browser has been closed')) {
        console.warn(`  ⚠️ Browser context closed - stopping product scraping`);
        break;
      }
    }
  }
}

async function processProductPage(pageData: PageData, state: ScrapeState, opts: Required<ScrapeOptions>): Promise<void> {
  const networkUrls = pageData.networkRequests.map(r => r.url);

  // DG scanning
  const dgMatches = scanForDangerousGoods(pageData.cleanedText);
  for (const match of dgMatches) {
    if (!state.dangerousGoods.some(d => d.category === match.category)) {
      state.dangerousGoods.push({ ...match, foundOnUrl: pageData.url });
    }
  }

  // BNPL widgets
  const bnplWidgets = detectBNPLWidgets(pageData.cleanedText, pageData.rawHtml || '');
  if (bnplWidgets.detected) {
    for (const provider of bnplWidgets.providers) {
      if (provider !== 'BNPL (unspecified)') {
        state.thirdParties.add(provider);
        if (opts.verbose && !state.thirdParties.has(provider)) {
          console.log(`    → BNPL widget: ${provider}`);
        }
      }
    }
  }

  // Customization
  const custom = detectCustomizableProducts(pageData.cleanedText, pageData.rawHtml || '');
  if (custom.detected) {
    state.customizableProducts = true;
    custom.types.forEach(t => state.customizationTypes.add(t));
  }

  // Pre-orders
  const preOrder = detectPreOrders(pageData.cleanedText, pageData.rawHtml || '');
  if (preOrder.detected) state.preOrdersDetected = true;

  // Subscriptions
  const subs = detectSubscriptions(pageData.cleanedText, pageData.rawHtml || '', networkUrls);
  if (subs.detected) {
    state.subscriptionsDetected = true;
    if (subs.provider) state.subscriptionProvider = subs.provider;
  }

  // Bundles
  const bundles = detectBundles(pageData.cleanedText, pageData.url);
  if (bundles.detected) {
    state.bundlesDetected = true;
    bundles.evidence.forEach(e => {
      if (!state.bundleEvidence.includes(e)) state.bundleEvidence.push(e);
    });
  }

  // Virtual products
  const virtual = detectVirtualProducts(pageData.cleanedText, pageData.url);
  if (virtual.detected) {
    state.virtualProducts = true;
    virtual.types.forEach(t => state.virtualProductTypes.add(t));
  }

  // Gift cards
  const giftCards = detectGiftCards(pageData.cleanedText, pageData.url);
  if (giftCards.detected) {
    state.giftCardsDetected = true;
    giftCards.types.forEach(t => state.giftCardTypes.add(t));
  }
}

// ============ Checkout Phase ============

async function testCheckout(
  context: Awaited<ReturnType<typeof launchStealthBrowser>>['context'],
  seedUrl: string,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  startedAt: string
): Promise<void> {
  scrapeProgress.phase = 'checkout';
  scrapeProgress.currentUrl = `${seedUrl}/checkout`;

  opts.onProgress({ phase: 'checkout', message: 'Testing checkout flow...' });

  if (opts.verbose) {
    const elapsed = ((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1);
    console.log(`  [checkout] Testing checkout flow... (${elapsed}s)`);
  }

  try {
    const checkoutPromise = testCheckoutFlow(context, seedUrl, { timeout: opts.timeout, verbose: opts.verbose });
    const checkoutTimeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
    const checkoutResult = await Promise.race([checkoutPromise, checkoutTimeoutPromise]);

    if (checkoutResult) {
      state.checkoutInfo = checkoutResult.checkoutInfo;
      state.checkoutReached = checkoutResult.reachedCheckout;
      state.checkoutStoppedAt = checkoutResult.stoppedAt;

      for (const wallet of checkoutResult.checkoutInfo.expressWallets) {
        state.thirdParties.add(wallet);
      }
      for (const bnpl of checkoutResult.checkoutInfo.bnplOptions) {
        state.thirdParties.add(bnpl);
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

  if (opts.verbose && !state.checkoutReached) {
    console.log(`  ⚠ Checkout not reached (may have timed out or cart was empty)`);
  }
}

// ============ Result Building ============

function buildResult(
  seedUrl: string,
  startedAt: string,
  state: ScrapeState,
  debugInfo: Partial<DebugInfo>
): ScrapeResult {
  const completedAt = new Date().toISOString();

  // Add providers to third parties
  if (state.subscriptionsDetected && state.subscriptionProvider) {
    state.thirdParties.add(state.subscriptionProvider);
    if (state.subscriptionProvider === 'Recharge') state.redFlags.add('Recharge');
  }
  if (state.loyaltyInfo.detected && state.loyaltyInfo.provider) {
    state.thirdParties.add(state.loyaltyInfo.provider);
    if (state.loyaltyInfo.provider === 'Smile.io') state.redFlags.add('Smile.io');
  }

  // Merge policies
  const mergedPolicy = mergePolicies(state.extractedPolicies);
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
    giftWithPurchase: mergedPolicy.giftWithPurchase || state.gwpDetected,
    priceAdjustmentWindow: mergedPolicy.priceAdjustmentWindow,
  };

  const catalogFeatures: CatalogFeaturesInfo = {
    bundlesDetected: state.bundlesDetected,
    bundleEvidence: state.bundleEvidence.slice(0, 3),
    customizableProducts: state.customizableProducts,
    customizationTypes: Array.from(state.customizationTypes),
    virtualProducts: state.virtualProducts,
    virtualProductTypes: Array.from(state.virtualProductTypes),
    giftCardsDetected: state.giftCardsDetected,
    giftCardTypes: Array.from(state.giftCardTypes),
    subscriptionsDetected: state.subscriptionsDetected,
    subscriptionProvider: state.subscriptionProvider,
    preOrdersDetected: state.preOrdersDetected,
    gwpDetected: state.gwpDetected || mergedPolicy.giftWithPurchase || false,
  };

  const result: ScrapeResult = {
    summary: {
      seedUrl,
      domain: state.domain,
      startedAt,
      completedAt,
      pagesVisited: state.pages.length,
      pagesBlocked: state.errors.length,
      checkoutReached: state.checkoutReached,
      checkoutStoppedAt: state.checkoutStoppedAt,
      platformDetected: state.platformDetected,
      headlessDetected: detectHeadless(state.pages),
      globalEDetected: state.globalEDetected,
      returngoDetected: state.returngoDetected,
      shopPayDetected: state.shopPayDetected,
      errors: state.errors,
      thirdPartiesDetected: Array.from(state.thirdParties),
      technologies: Array.from(state.allTechnologies.values()),
      redFlags: Array.from(state.redFlags),
      dangerousGoods: state.dangerousGoods,
      b2bIndicators: Array.from(state.b2bIndicators),
      productPagesScraped: state.productPagesScraped,
      policyInfo,
      checkoutInfo: state.checkoutInfo,
      catalogFeatures,
      loyaltyProgram: state.loyaltyInfo,
      localization: state.localizationInfo,
      marketplacePresence: state.marketplaceInfo,
    },
    pages: state.pages,
  };

  // Log for debugging
  try {
    logAssessment(result, debugInfo);
  } catch (logError) {
    console.warn(`  ⚠️ Failed to log assessment: ${logError}`);
  }

  return result;
}
