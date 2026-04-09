/**
 * Main scraper orchestration
 * Coordinates browser, crawling, extraction, and analysis
 */

import type { ScrapeResult, ScrapeOptions, ScrapeProgress, PageData, CrawlSummary, NetworkRequest, DGFinding, DetectedTechnology, ExtractedPolicyInfo, CheckoutFlowInfo, CatalogFeaturesInfo, LoyaltyProgramInfo, LocalizationDetected, MarketplacePresence } from './types.js';
import { detectThirdParty, isRedFlag, scanForDangerousGoods, detectB2B, detectDropshipFulfillment, extractProductLinks } from './detectors.js';
import { initWappalyzer, analyzeWithWappalyzer, filterEcommerceRelevant } from './wappalyzer.js';
import { extractPolicyInfo, mergePolicies, type ExtractedPolicy } from './policyExtractor.js';
import { detectBundles, detectCustomizableProducts, detectVirtualProducts, detectGiftCards, detectSubscriptions, detectPreOrders, detectLoyaltyProgram, detectLocalization, detectMarketplaces, detectGWP, detectBNPLWidgets } from './catalogDetector.js';
import { logAssessment, type DebugInfo } from '../logger/index.js';
import { gotoWithRetry, classifyError, randomDelay } from './helpers.js';
import { launchStealthBrowser, createStealthContext, dismissCookieConsent, slowScroll } from './browser.js';
import { discoverCrawlTargets, getFallbackTargets, type CrawlTarget } from './crawler.js';
import { extractPageData, detectPlatform, detectHeadless } from './pageExtractor.js';
import { testCheckoutFlow } from './checkoutTester.js';
import type { Browser, BrowserContext } from 'playwright';

// ============ State Management (declared early for scrape snapshot typing) ============

interface ScrapeState {
  pages: PageData[];
  visited: Set<string>;
  thirdParties: Set<string>;
  allTechnologies: Map<string, DetectedTechnology>;
  redFlags: Set<string>;
  b2bIndicators: Set<string>;
  dropshipIndicators: Set<string>;
  dangerousGoods: DGFinding[];
  errors: CrawlSummary['errors'];
  platformDetected?: string;
  globalEDetected: boolean;
  returngoDetected: boolean;
  shopPayDetected: boolean;
  checkoutReached: boolean;
  checkoutSkipped: boolean;
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
    dropshipIndicators: new Set(),
    dangerousGoods: [],
    errors: [],
    globalEDetected: false,
    returngoDetected: false,
    shopPayDetected: false,
    checkoutReached: false,
    checkoutSkipped: false,
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

/** Max time for each teardown step (context vs browser). Avoids indefinite hang on stuck Chromium. */
const BROWSER_TEARDOWN_STEP_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryKillBrowserProcess(browser: Browser): void {
  try {
    const proc = (browser as unknown as { process?: () => import('child_process').ChildProcess }).process?.();
    proc?.kill?.('SIGKILL');
  } catch {
    // ignore
  }
}

/**
 * Tear down Playwright without hanging forever. A single stuck `page.close()` or `browser.close()` can block the
 * Node process until Chromium exits; we cap each step and SIGKILL the browser child if Playwright exposes it.
 */
async function closeBrowserWithTimeout(
  browser: Browser,
  context: BrowserContext,
  opts: { verbose: boolean; onProgress: Required<ScrapeOptions>['onProgress'] }
): Promise<void> {
  const step = async (label: string, fn: () => Promise<void>): Promise<void> => {
    const out = await Promise.race([
      fn().then(() => 'done' as const),
      sleep(BROWSER_TEARDOWN_STEP_MS).then(() => 'slow' as const),
    ]);
    if (out === 'slow' && opts.verbose) {
      console.warn(`  ⚠ ${label} exceeded ${BROWSER_TEARDOWN_STEP_MS / 1000}s; continuing`);
    }
  };

  // context.close() closes all pages; avoids N sequential page.close() calls that can each stall.
  await step('context.close', () => context.close().catch(() => {}));

  await step('browser.close', () => browser.close().catch(() => {}));

  if (browser.isConnected()) {
    if (opts.verbose) console.warn('  ⚠ Browser still connected after close; attempting SIGKILL');
    tryKillBrowserProcess(browser);
    // Do not await browser.close() without a cap — it can block like the first call.
    await Promise.race([browser.close().catch(() => {}), sleep(3000)]);
  }
}

const DEFAULT_OPTIONS: Required<ScrapeOptions> = {
  maxPages: 50,
  timeout: 15000,
  scrapeTimeout: 120000,
  takeScreenshots: true,
  verbose: false,
  skipCheckout: false,
  onProgress: () => {},
};

let scrapeProgress = { phase: 'initializing', pagesScraped: 0, currentUrl: '' };

/** True when the overall scrape timeout won the race; full run still finishes in the background. */
let scrapeRaceResolvedWithTimeout = false;

/** Live scrape bundle for timeout partials (state mutates in place until buildResult). */
let lastScrapeSnapshot: {
  seedUrl: string;
  startedAt: string;
  state: ScrapeState;
  debugInfo: Partial<DebugInfo>;
} | null = null;

function describeIncompletePhase(phase: string): string {
  switch (phase) {
    case 'initializing':
    case 'init':
      return 'Discovery and later steps did not finish.';
    case 'discovery':
      return 'Discovery did not finish; later steps were not started.';
    case 'scraping':
      return 'Some pages, product passes, or checkout may not have finished.';
    case 'page-scraping':
      return 'The crawl list was still being scraped when the time limit hit; dedicated product-page sampling did not run yet.';
    case 'product-pages':
      return 'Product URL sampling did not finish; checkout may not have run.';
    case 'checkout':
      return 'Checkout was not completed (listed pages may still be collected).';
    case 'analyzing':
      return 'The run ended during browser shutdown (data above was already collected).';
    default:
      return 'Not all steps completed.';
  }
}

/** Called when scrapeTimeout fires: returns partial data + warning (never rejects). */
function buildPartialTimeoutResult(seedUrl: string, opts: Required<ScrapeOptions>): ScrapeResult {
  const snap = lastScrapeSnapshot;
  const completedAt = new Date().toISOString();
  const domain = (() => {
    try {
      return new URL(seedUrl).hostname;
    } catch {
      return '';
    }
  })();

  if (!snap) {
    const warning = `Timed out after ${opts.scrapeTimeout / 1000}s before any pages were stored (still initializing).`;
    return {
      pages: [],
      summary: {
        seedUrl,
        domain,
        startedAt: completedAt,
        completedAt,
        pagesVisited: 0,
        pagesBlocked: 1,
        checkoutReached: false,
        checkoutSkipped: opts.skipCheckout,
        errors: [{ url: seedUrl, error: warning, type: 'timeout' }],
        scrapingCompletionWarning: warning,
        thirdPartiesDetected: [],
        technologies: [],
        redFlags: [],
        dangerousGoods: [],
        b2bIndicators: [],
        dropshipIndicators: [],
        productPagesScraped: 0,
      },
    };
  }

  const result = buildResult(snap.seedUrl, snap.startedAt, snap.state, snap.debugInfo, { skipLog: false });
  const warning =
    `Timed out after ${opts.scrapeTimeout / 1000}s during "${scrapeProgress.phase}" phase. ` +
    `Collected ${result.pages.length} page(s) and ${result.summary.productPagesScraped} product page(s). ` +
    describeIncompletePhase(scrapeProgress.phase);
  result.summary.scrapingCompletionWarning = warning;
  const timeoutErr = { url: seedUrl, error: warning, type: 'timeout' as const };
  result.summary.errors = [...result.summary.errors, timeoutErr];
  result.summary.pagesBlocked = result.summary.errors.length;
  return result;
}

const HEARTBEAT_MS = 12_000;

function formatDurationSeconds(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function mapProgressPhaseForUi(internal: string): ScrapeProgress['phase'] {
  switch (internal) {
    case 'discovery':
    case 'initializing':
      return 'init';
    case 'page-scraping':
    case 'product-pages':
      return 'scraping';
    case 'checkout':
      return 'checkout';
    case 'analyzing':
      return 'analyzing';
    default:
      return 'scraping';
  }
}

function humanizeScrapePhase(internal: string): string {
  switch (internal) {
    case 'discovery':
      return 'discovery';
    case 'page-scraping':
      return 'listing crawl targets';
    case 'product-pages':
      return 'product page samples';
    case 'checkout':
      return 'checkout';
    case 'analyzing':
      return 'wrapping up';
    case 'initializing':
      return 'starting';
    default:
      return internal;
  }
}

function emitScrapeHeartbeat(opts: Required<ScrapeOptions>, scrapeStartedAt: number): void {
  const elapsed = Date.now() - scrapeStartedAt;
  const remainingMs = Math.max(0, opts.scrapeTimeout - elapsed);
  const secondsRemaining = Math.ceil(remainingMs / 1000);
  const elapsedSeconds = Math.floor(elapsed / 1000);
  const phase = humanizeScrapePhase(scrapeProgress.phase);
  const pageHint = scrapeProgress.pagesScraped > 0 ? ` · ${scrapeProgress.pagesScraped} pages collected` : '';
  opts.onProgress({
    phase: mapProgressPhaseForUi(scrapeProgress.phase),
    message: `Still working — ${formatDurationSeconds(secondsRemaining)} left · ${phase}${pageHint}`,
    secondsRemaining,
    elapsedSeconds,
  });
}

export async function scrape(seedUrl: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  scrapeProgress = { phase: 'initializing', pagesScraped: 0, currentUrl: seedUrl };
  scrapeRaceResolvedWithTimeout = false;
  lastScrapeSnapshot = null;

  const scrapeStartedAt = Date.now();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let firstHeartbeat: ReturnType<typeof setTimeout> | undefined;
  const tickHeartbeat = (): void => {
    emitScrapeHeartbeat(opts, scrapeStartedAt);
  };
  firstHeartbeat = setTimeout(() => {
    firstHeartbeat = undefined;
    tickHeartbeat();
  }, 1000);
  heartbeat = setInterval(tickHeartbeat, HEARTBEAT_MS);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<ScrapeResult>((resolve) => {
    timeoutId = setTimeout(() => {
      scrapeRaceResolvedWithTimeout = true;
      resolve(buildPartialTimeoutResult(seedUrl, opts));
    }, opts.scrapeTimeout);
  });

  const scrapePromise = scrapeInternal(seedUrl, opts);

  try {
    const result = await Promise.race([scrapePromise, timeoutPromise]);
    return result;
  } finally {
    if (firstHeartbeat !== undefined) clearTimeout(firstHeartbeat);
    if (heartbeat) clearInterval(heartbeat);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
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
  lastScrapeSnapshot = { seedUrl, startedAt, state, debugInfo };

  try {
    // Phase 0: Discover pages
    const targets = await discoverPages(browser, context, seedUrl, state, opts);

    // Phase 1: Scrape discovered pages
    await scrapeDiscoveredPages(browser, context, targets, state, opts, debugInfo, wappalyzerReady, startedAt);

    // Phase 2: Scrape product pages
    await scrapeProductPages(context, state, opts, startedAt);

    // Phase 3: Test checkout (optional; web UI often skips to avoid long stalls)
    if (!opts.skipCheckout) {
      await testCheckout(browser, context, seedUrl, state, opts, startedAt);
    } else {
      state.checkoutSkipped = true;
      scrapeProgress.phase = 'checkout';
      scrapeProgress.currentUrl = '';
      opts.onProgress({ phase: 'checkout', message: 'Skipping checkout test (faster).' });
    }

    // Build result before browser teardown so the UI always receives data even if Chromium hangs on close.
    return buildResult(seedUrl, startedAt, state, debugInfo, { skipLog: scrapeRaceResolvedWithTimeout });
  } finally {
    scrapeProgress.phase = 'analyzing';
    scrapeProgress.currentUrl = '';
    void closeBrowserWithTimeout(browser, context, { verbose: opts.verbose, onProgress: () => {} }).catch(() => {});
  }
}

// ============ Discovery Phase ============

async function discoverPages(
  browser: Browser,
  context: Awaited<ReturnType<typeof launchStealthBrowser>>['context'],
  seedUrl: string,
  state: ScrapeState,
  opts: Required<ScrapeOptions>
): Promise<CrawlTarget[]> {
  scrapeProgress.phase = 'discovery';
  opts.onProgress({ phase: 'init', message: 'Discovering site structure...' });
  if (opts.verbose) console.log('  Discovering site structure...');

  const discoveryPage = await context.newPage();
  let navResult = await gotoWithRetry(discoveryPage, seedUrl, {
    timeout: opts.timeout,
    maxRetries: 2,
    verbose: opts.verbose,
    waitForNetworkIdle: true,
  });
  let activeContext: BrowserContext | undefined;

  if (navResult.blocked) {
    await discoveryPage.close().catch(() => {});
    const rotated = await createStealthContext(browser, { verbose: false });
    activeContext = rotated.context;
    const retryPage = await activeContext.newPage();
    if (opts.verbose) {
      console.log('  ↻ Seed URL hit a challenge, retrying discovery in a fresh context');
    }
    navResult = await gotoWithRetry(retryPage, seedUrl, {
      timeout: opts.timeout,
      maxRetries: 1,
      verbose: opts.verbose,
      waitForNetworkIdle: true,
    });
    if (!navResult.error && !navResult.blocked && (!navResult.response || navResult.response.status() < 400)) {
      await dismissCookieConsent(retryPage, opts.verbose);
      try {
        const discoveryPromise = discoverCrawlTargets(retryPage, seedUrl, opts.verbose);
        const timeoutPromise = new Promise<CrawlTarget[]>((_, reject) =>
          setTimeout(() => reject(new Error('Discovery timeout')), 10000)
        );
        const targets = await Promise.race([discoveryPromise, timeoutPromise]);
        await retryPage.close().catch(() => {});
        await activeContext.close().catch(() => {});
        if (opts.verbose) console.log(`  Found ${targets.length} pages to crawl`);
        return targets;
      } catch (discoveryError) {
        if (opts.verbose) console.log(`  ⚠ Discovery failed (${discoveryError}), using fallback targets`);
      }
    }
    await retryPage.close().catch(() => {});
  }

  if (navResult.error || navResult.blocked) {
    handleNavigationError({ url: seedUrl, type: 'home' }, navResult, state, opts);
    await activeContext?.close().catch(() => {});
    await discoveryPage.close().catch(() => {});
    if (opts.verbose) console.log('  ⚠ Discovery seed failed, using fallback targets');
    return getFallbackTargets(seedUrl);
  }

  const seedStatus = navResult.response?.status();
  if (seedStatus && seedStatus >= 400) {
    state.errors.push({ url: seedUrl, error: `HTTP ${seedStatus}`, type: classifyError('', seedStatus) });
    if (opts.verbose) console.log(`  ⚠ Seed URL HTTP ${seedStatus}, using fallback targets`);
    await activeContext?.close().catch(() => {});
    await discoveryPage.close().catch(() => {});
    return getFallbackTargets(seedUrl);
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

  await activeContext?.close().catch(() => {});
  await discoveryPage.close().catch(() => {});
  if (opts.verbose) console.log(`  Found ${targets.length} pages to crawl`);
  return targets;
}

async function scrapeTargetAttempt(
  context: BrowserContext,
  target: CrawlTarget,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  debugInfo: Partial<DebugInfo>,
  wappalyzerReady: boolean,
  lastVisitedUrl: string | undefined
): Promise<{ success: boolean; finalUrl?: string; blockedNav?: { blocked: boolean; blockType: string | null } }> {
  const page = await context.newPage();
  const networkRequests: NetworkRequest[] = [];

  try {
    setupNetworkTracking(page, state, networkRequests, debugInfo);

    const navResult = await gotoWithRetry(page, target.url, {
      timeout: opts.timeout,
      maxRetries: 2,
      verbose: opts.verbose,
      referer: lastVisitedUrl,
      waitForNetworkIdle: true,
    });

    if (navResult.error) {
      handleNavigationError(target, navResult, state, opts);
      return { success: false };
    }

    if (navResult.blocked) {
      return { success: false, blockedNav: { blocked: true, blockType: navResult.blockType } };
    }

    const statusCode = navResult.response?.status();
    if (statusCode && statusCode >= 400) {
      state.errors.push({ url: target.url, error: `HTTP ${statusCode}`, type: classifyError('', statusCode) });
      if (opts.verbose) console.log(`  ✗ ${target.type}: ${target.url} - HTTP ${statusCode}`);
      return { success: false };
    }

    if (!validateRedirect(page, target, state, debugInfo)) {
      return { success: false };
    }

    state.visited.add(target.url);

    await dismissCookieConsent(page, opts.verbose);
    if (target.type === 'home' || target.type === 'collection' || target.type === 'policy') {
      await slowScroll(page, { steps: 3, verbose: opts.verbose });
      await dismissCookieConsent(page, opts.verbose);
    }

    if (!state.platformDetected) {
      state.platformDetected = await detectPlatform(page);
    }

    if (target.type === 'checkout') {
      state.checkoutReached = true;
      state.checkoutStoppedAt = page.url();
    }

    const pageData = await extractPageData(page, navResult.response, networkRequests, opts);
    state.pages.push(pageData);
    scrapeProgress.pagesScraped = state.pages.length;

    await processPageContent(target, pageData, state, wappalyzerReady, opts);

    if (opts.verbose) console.log(`  ✓ ${target.type}: ${pageData.url}`);
    return { success: true, finalUrl: page.url() };
  } catch (error) {
    handlePageError(error, target, state, opts);
    return { success: false };
  } finally {
    await page.close().catch(() => {});
  }
}

// ============ Page Scraping Phase ============

async function scrapeDiscoveredPages(
  browser: Browser,
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
      const primaryAttempt = await scrapeTargetAttempt(
        context,
        target,
        state,
        opts,
        debugInfo,
        wappalyzerReady,
        lastVisitedUrl
      );
      if (primaryAttempt.success) {
        lastVisitedUrl = primaryAttempt.finalUrl;
        continue;
      }

      if (primaryAttempt.blockedNav) {
        if (opts.verbose) {
          console.log(`  ↻ ${target.type}: ${target.url} - Retrying in a fresh context`);
        }
        const rotated = await createStealthContext(browser, { verbose: false });
        try {
          const recoveryAttempt = await scrapeTargetAttempt(
            rotated.context,
            target,
            state,
            opts,
            debugInfo,
            wappalyzerReady,
            lastVisitedUrl
          );
          if (recoveryAttempt.success) {
            lastVisitedUrl = recoveryAttempt.finalUrl;
            continue;
          }
          if (recoveryAttempt.blockedNav) {
            handleNavigationError(target, recoveryAttempt.blockedNav, state, opts);
          }
        } finally {
          await rotated.context.close().catch(() => {});
        }
      }
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
    state.errors.push({
      url: target.url,
      error: `Bot detection: ${navResult.blockType}`,
      type: 'blocked',
      blockType: navResult.blockType || undefined,
    });
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

  const dropship = detectDropshipFulfillment(pageData.cleanedText, pageData.url);
  for (const indicator of dropship.evidence) {
    state.dropshipIndicators.add(indicator);
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
  const remainingBudget = Math.max(0, opts.maxPages - state.visited.size);
  const hasDedicatedPdpEvidence = state.pages.some(page =>
    page.matchedCategories.includes('pdp') || /\/products?\//i.test(page.url)
  );
  const desiredProducts = hasDedicatedPdpEvidence ? 6 : 8;
  const maxProducts = Math.min(desiredProducts, remainingBudget);
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
  const collectionPage = state.pages.find(page =>
    page.matchedCategories.includes('collection') ||
    /\/collections?\b/i.test(page.url) ||
    /\/shop\b/i.test(page.url)
  );
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
  browser: Browser,
  context: Awaited<ReturnType<typeof launchStealthBrowser>>['context'],
  seedUrl: string,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  startedAt: string
): Promise<void> {
  const checkoutUrl = new URL('/checkout', seedUrl).toString();
  const checkoutProductCandidates = collectCheckoutProductCandidates(state);
  scrapeProgress.phase = 'checkout';
  scrapeProgress.currentUrl = checkoutUrl;

  opts.onProgress({ phase: 'checkout', message: 'Testing checkout flow...' });

  if (opts.verbose) {
    const elapsed = ((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1);
    console.log(`  [checkout] Testing checkout flow... (${elapsed}s)`);
  }

  let checkoutTick: ReturnType<typeof setInterval> | undefined;
  try {
    // Keep progress/UI alive during long checkout (and help SSE stay meaningful)
    checkoutTick = setInterval(() => {
      opts.onProgress({ phase: 'checkout', message: 'Testing checkout flow…' });
    }, 12000);

    const abortController = new AbortController();
    const checkoutPromise = testCheckoutFlow(context, seedUrl, {
      timeout: opts.timeout,
      verbose: opts.verbose,
      preferredProductUrls: checkoutProductCandidates,
      abortSignal: abortController.signal,
    });
    let checkoutTimer: ReturnType<typeof setTimeout> | undefined;
    const checkoutTimeoutPromise = new Promise<null>((resolve) => {
      checkoutTimer = setTimeout(() => {
        abortController.abort();
        resolve(null);
      }, 45000);
    });
    let checkoutResult = await Promise.race([checkoutPromise, checkoutTimeoutPromise]);
    if (checkoutTimer !== undefined) clearTimeout(checkoutTimer);

    if (checkoutResult && !checkoutResult.reachedCheckout && checkoutResult.errors.some(error => error.type === 'blocked')) {
      if (opts.verbose) {
        console.log('  ↻ Checkout hit a challenge, retrying in a fresh context');
      }
      const rotated = await createStealthContext(browser, { verbose: false });
      try {
        checkoutResult = await testCheckoutFlow(rotated.context, seedUrl, {
          timeout: opts.timeout,
          verbose: opts.verbose,
          preferredProductUrls: checkoutProductCandidates,
        });
      } finally {
        await rotated.context.close().catch(() => {});
      }
    }

    if (checkoutResult) {
      if (checkoutResult.errors.length > 0) {
        state.errors.push(...checkoutResult.errors);
      }

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
        console.log(
          checkoutResult.reachedCheckout
            ? `  ✓ Checkout: ${checkoutResult.stoppedAt || 'reached'}`
            : `  ⚠ Checkout: ${checkoutResult.stoppedAt || 'not reached'}`
        );
        if (checkoutResult.checkoutInfo.expressWallets.length > 0) {
          console.log(`    → Express wallets: ${checkoutResult.checkoutInfo.expressWallets.join(', ')}`);
        }
        if (checkoutResult.checkoutInfo.bnplOptions.length > 0) {
          console.log(`    → BNPL options: ${checkoutResult.checkoutInfo.bnplOptions.join(', ')}`);
        }
      }
    } else {
      state.errors.push({ url: checkoutUrl, error: 'Checkout test timed out', type: 'timeout' });
    }
  } catch (error) {
    state.errors.push({
      url: checkoutUrl,
      error: error instanceof Error ? error.message : 'Unknown checkout error',
      type: classifyError(error instanceof Error ? error.message : 'Unknown checkout error'),
    });
    if (opts.verbose) {
      console.log(`  ⚠ Checkout test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } finally {
    if (checkoutTick) clearInterval(checkoutTick);
  }

  if (opts.verbose && !state.checkoutReached) {
    console.log(`  ⚠ Checkout not reached (may have timed out or cart was empty)`);
  }
}

function collectCheckoutProductCandidates(state: ScrapeState): string[] {
  return Array.from(
    new Set([
      ...state.pages
        .filter((page) => page.matchedCategories.includes('pdp') || /\/products\/[^/?#]+/i.test(page.url))
        .map((page) => page.url),
      ...state.discoveredProductUrls,
    ])
  );
}

// ============ Result Building ============

function mergeDerivedThirdParties(state: ScrapeState): void {
  if (state.subscriptionsDetected && state.subscriptionProvider) {
    state.thirdParties.add(state.subscriptionProvider);
    if (state.subscriptionProvider === 'Recharge') state.redFlags.add('Recharge');
  }

  if (state.loyaltyInfo.detected && state.loyaltyInfo.provider) {
    state.thirdParties.add(state.loyaltyInfo.provider);
    if (state.loyaltyInfo.provider === 'Smile.io') state.redFlags.add('Smile.io');
  }
}

function buildResult(
  seedUrl: string,
  startedAt: string,
  state: ScrapeState,
  debugInfo: Partial<DebugInfo>,
  options?: { skipLog?: boolean }
): ScrapeResult {
  const completedAt = new Date().toISOString();

  mergeDerivedThirdParties(state);

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
      checkoutSkipped: state.checkoutSkipped,
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
      dropshipIndicators: Array.from(state.dropshipIndicators),
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

  // Log for debugging (skip when a timeout already emitted a partial log)
  if (!options?.skipLog) {
    try {
      logAssessment(result, debugInfo);
    } catch (logError) {
      console.warn(`  ⚠️ Failed to log assessment: ${logError}`);
    }
  }

  return result;
}
