/**
 * Main scraper orchestration
 * Coordinates browser, crawling, extraction, and analysis
 */

import type { ScrapeResult, ScrapeOptions, ScrapeProgress, PageData, CrawlSummary, NetworkRequest, DGFinding, DetectedTechnology, ExtractedPolicyInfo, CheckoutFlowInfo, CatalogFeaturesInfo, LoyaltyProgramInfo, LocalizationDetected, MarketplacePresence, StructuredLogInput, ScrapeQualitySummary, ScrapeQualityLevel } from './types.js';
import { detectThirdParty, isRedFlag, scanForDangerousGoods, detectB2B, detectDropshipFulfillment, extractProductLinks } from './detectors.js';
import { initWappalyzer, analyzeWithWappalyzer, filterEcommerceRelevant } from './wappalyzer.js';
import { extractPolicyInfo, mergePolicies, detectReturnPortal, type ExtractedPolicy } from './policyExtractor.js';
import { detectBundles, detectCustomizableProducts, detectVirtualProducts, detectGiftCards, detectSubscriptions, detectPreOrders, detectLoyaltyProgram, detectLocalization, detectMarketplaces, detectGWP, detectBNPLWidgets } from './catalogDetector.js';
import { logAssessment, type DebugInfo } from '../logger/index.js';
import { gotoWithRetry, classifyError, randomDelay, USER_AGENTS, isBrowserCrashError, shouldRestartBrowserOnNavigationFailure, shouldRetryFullBrowserNavigation } from './helpers.js';
import { createStealthContext, dismissCookieConsent, slowScroll, type BrowserConfig, type ContextOptions } from './browser.js';
import { StealthBrowserManager, attachPageCrashLogging } from './browserManager.js';
import { discoverCrawlTargets, discoverIndexedCrawlTargets, getFallbackTargets, dedupeCrawlTargets, mergeCrawlTargets, normalizeCrawlUrl, type CrawlTarget } from './crawler.js';
import { extractPageData, detectPlatform, detectHeadless } from './pageExtractor.js';
import { testCheckoutFlow } from './checkoutTester.js';
import { getPlatformProfile } from './platforms/index.js';
import type { Browser, BrowserContext, Page, Request, ConsoleMessage } from 'playwright';

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
  discoveryUsedFallbackUrls: boolean;
  degradedReasons: Set<string>;
  browserRestarts: number;
  pageCrashCount: number;
  preferLightweightCapture: boolean;
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
    discoveryUsedFallbackUrls: false,
    degradedReasons: new Set(),
    browserRestarts: 0,
    pageCrashCount: 0,
    preferLightweightCapture: false,
  };
}

interface BrowserSession {
  manager: StealthBrowserManager;
  browser: Browser;
  context: BrowserContext;
  config: BrowserConfig;
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

export function defaultPageGotoTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SWEEP_PAGE_GOTO_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : 30000;
  if (!Number.isFinite(parsed)) return 30000;
  return Math.min(Math.max(parsed, 10000), 120000);
}

// ============ Adaptive Timeouts (slow networks / VPNs) ============

/** Each probe request is abandoned after this long; a failed probe just skips adaptation. */
const LATENCY_PROBE_TIMEOUT_MS = 8000;
/** Time-to-first-byte above this is considered a slow connection (e.g. VPN routed through another continent). */
const LATENCY_BASELINE_MS = 800;
/** Same ceiling as the SWEEP_PAGE_GOTO_TIMEOUT_MS clamp. */
const MAX_PAGE_TIMEOUT_MS = 120000;
const MAX_SCRAPE_TIMEOUT_MS = 900000;

/**
 * Measure time-to-first-byte to the seed URL. Runs two probes and takes the fastest
 * (the first one pays DNS + TLS setup). Returns null when the site can't be probed —
 * callers then keep the configured timeouts unchanged.
 */
export async function measureSeedLatencyMs(seedUrl: string): Promise<number | null> {
  const probe = async (): Promise<number | null> => {
    const controller = new AbortController();
    const cap = setTimeout(() => controller.abort(), LATENCY_PROBE_TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetch(seedUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
      });
      const elapsed = Date.now() - started;
      // Headers are enough for a latency estimate; don't download the body.
      await res.body?.cancel().catch(() => {});
      return elapsed;
    } catch {
      return null;
    } finally {
      clearTimeout(cap);
    }
  };

  const first = await probe();
  if (first === null) return null;
  const second = await probe();
  return second === null ? first : Math.min(first, second);
}

/**
 * Scale timeouts to match measured latency. A page load is dozens of sequential round trips,
 * so high latency multiplies total load time — we scale the per-page timeout proportionally
 * (capped at 4x / 120s) and give the overall budget up to 2x so the longer pages still fit.
 * Never shrinks the configured values.
 */
export function adaptTimeoutsForLatency(
  latencyMs: number | null,
  base: { timeout: number; scrapeTimeout: number }
): { timeout: number; scrapeTimeout: number; adapted: boolean } {
  if (latencyMs === null || latencyMs <= LATENCY_BASELINE_MS) {
    return { timeout: base.timeout, scrapeTimeout: base.scrapeTimeout, adapted: false };
  }
  const multiplier = Math.min(latencyMs / LATENCY_BASELINE_MS, 4);
  const timeout = Math.min(Math.max(Math.round(base.timeout * multiplier), base.timeout), MAX_PAGE_TIMEOUT_MS);
  const scrapeTimeout = Math.min(
    Math.max(Math.round(base.scrapeTimeout * Math.min(multiplier, 2)), base.scrapeTimeout),
    MAX_SCRAPE_TIMEOUT_MS
  );
  return { timeout, scrapeTimeout, adapted: true };
}

export function shouldRetryWithLightweightNavigation(navResult: {
  error?: string | null;
  blocked?: boolean;
  blockType?: string | null;
}): boolean {
  return Boolean(navResult.error) && navResult.blocked !== true;
}

/** Lightweight/no-JS capture is only acceptable for policy and informational pages after full-browser retries fail. */
export function shouldUseLightweightFallback(
  targetType: CrawlTarget['type'],
  lightweightFirst = false
): boolean {
  if (targetType === 'home' || targetType === 'policy' || targetType === 'other') return true;
  if (lightweightFirst && (targetType === 'collection' || targetType === 'rewards')) return true;
  return false;
}

export function rendererCrashStormThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SWEEP_RENDERER_CRASH_STORM_THRESHOLD;
  if (raw !== undefined && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return 2;
}

export function maxBrowserRestarts(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SWEEP_MAX_BROWSER_RESTARTS;
  if (raw !== undefined && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 3;
}

export function shouldPreferLightweightFirst(state: Pick<ScrapeState, 'preferLightweightCapture' | 'pageCrashCount' | 'browserRestarts'>, env: NodeJS.ProcessEnv = process.env): boolean {
  if (state.preferLightweightCapture) return true;
  return state.pageCrashCount >= rendererCrashStormThreshold(env) || state.browserRestarts >= maxBrowserRestarts(env);
}

export function shouldSkipFullBrowserTarget(
  state: Pick<ScrapeState, 'preferLightweightCapture' | 'pageCrashCount' | 'browserRestarts'>,
  targetType: CrawlTarget['type'],
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return shouldPreferLightweightFirst(state, env) && !shouldUseLightweightFallback(targetType, true);
}

export function canRestartBrowser(state: Pick<ScrapeState, 'browserRestarts'>, env: NodeJS.ProcessEnv = process.env): boolean {
  return state.browserRestarts < maxBrowserRestarts(env);
}

function noteRendererCrash(state: ScrapeState, opts: Required<ScrapeOptions>): void {
  state.pageCrashCount += 1;
  if (!state.preferLightweightCapture && state.pageCrashCount >= rendererCrashStormThreshold()) {
    activateLightweightFirstMode(state, opts, `${state.pageCrashCount} renderer crashes`);
  }
}

function activateLightweightFirstMode(state: ScrapeState, opts: Required<ScrapeOptions>, reason: string): void {
  if (state.preferLightweightCapture) return;
  state.preferLightweightCapture = true;
  state.degradedReasons.add('renderer_crash_storm');
  emitLog(opts, {
    level: 'warn',
    scope: 'scraper',
    event: 'scrape.crash_storm',
    phase: scrapeProgress.phase,
    message: `Switching to lightweight-first capture (${reason})`,
    details: { pageCrashCount: state.pageCrashCount, browserRestarts: state.browserRestarts },
  });
}

function isTargetVisited(state: ScrapeState, url: string): boolean {
  return state.visited.has(normalizeCrawlUrl(url));
}

function markTargetVisited(state: ScrapeState, url: string): void {
  state.visited.add(normalizeCrawlUrl(url));
}

export function deriveScrapeQuality(input: {
  pages: PageData[];
  browserRestarts: number;
  discoveryUsedFallbackUrls: boolean;
  degradedReasons: string[];
  scrapingCompletionWarning?: string;
}): ScrapeQualitySummary {
  const pagesFullCapture = input.pages.filter((p) => p.captureMode !== 'degraded').length;
  const pagesDegradedCapture = input.pages.filter((p) => p.captureMode === 'degraded').length;
  const reasons = [...input.degradedReasons];
  if (input.discoveryUsedFallbackUrls && !reasons.includes('discovery_fallback')) {
    reasons.push('discovery_fallback');
  }
  if (pagesDegradedCapture > 0 && !reasons.includes('lightweight_capture')) {
    reasons.push('lightweight_capture');
  }
  if (input.browserRestarts > 0 && !reasons.includes('browser_restart')) {
    reasons.push('browser_restart');
  }
  if (input.degradedReasons.includes('renderer_crash_storm') && !reasons.includes('renderer_crash_storm')) {
    reasons.push('renderer_crash_storm');
  }

  let level: ScrapeQualityLevel = 'complete';
  if (input.scrapingCompletionWarning) {
    level = 'partial';
  } else if (pagesDegradedCapture > 0 || input.discoveryUsedFallbackUrls || input.browserRestarts > 0) {
    level = 'degraded';
  }

  return {
    level,
    browserRestarts: input.browserRestarts,
    pagesFullCapture,
    pagesDegradedCapture,
    discoveryUsedFallbackUrls: input.discoveryUsedFallbackUrls,
    degradedReasons: reasons,
  };
}

export function lightweightNavigationTimeout(configuredTimeout: number): number {
  return Math.max(10000, Math.min(configuredTimeout, 15000));
}

export function shouldAttemptCheckoutAfterCrawl(pagesScraped: number, productCandidateCount: number): boolean {
  return pagesScraped > 0 || productCandidateCount > 0;
}

const DEFAULT_OPTIONS: Required<ScrapeOptions> = {
  maxPages: 50,
  timeout: defaultPageGotoTimeoutMs(),
  scrapeTimeout: 120000,
  takeScreenshots: true,
  verbose: false,
  skipCheckout: false,
  platform: 'unknown',
  browserMode: 'headless',
  persistentProfile: false,
  profileName: 'default',
  onProgress: () => {},
  onLog: () => {},
};

function emitLog(opts: Required<ScrapeOptions>, entry: StructuredLogInput): void {
  opts.onLog(entry);
}

let scrapeProgress = { phase: 'initializing', pagesScraped: 0, currentUrl: '' };

/** True when the overall scrape timeout won the race; full run still finishes in the background. */
let scrapeRaceResolvedWithTimeout = false;

/** Live scrape bundle for timeout partials (state mutates in place until buildResult). */
let lastScrapeSnapshot: {
  seedUrl: string;
  startedAt: string;
  state: ScrapeState;
  debugInfo: Partial<DebugInfo>;
  platform: Required<ScrapeOptions>['platform'];
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
    emitLog(opts, {
      level: 'warn',
      scope: 'scraper',
      event: 'scrape.timeout',
      phase: scrapeProgress.phase,
      message: warning,
      details: { pagesScraped: 0, productPagesScraped: 0 },
    });
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

  const result = buildResult(snap.seedUrl, snap.startedAt, snap.state, snap.debugInfo, {
    skipLog: false,
    platform: snap.platform,
  });
  const warning =
    `Timed out after ${opts.scrapeTimeout / 1000}s during "${scrapeProgress.phase}" phase. ` +
    `Collected ${result.pages.length} page(s) and ${result.summary.productPagesScraped} product page(s). ` +
    describeIncompletePhase(scrapeProgress.phase);
  result.summary.scrapingCompletionWarning = warning;
  const timeoutErr = { url: seedUrl, error: warning, type: 'timeout' as const };
  result.summary.errors = [...result.summary.errors, timeoutErr];
  result.summary.pagesBlocked = result.summary.errors.length;
  result.summary.scrapeQuality = deriveScrapeQuality({
    pages: result.pages,
    browserRestarts: snap.state.browserRestarts,
    discoveryUsedFallbackUrls: snap.state.discoveryUsedFallbackUrls,
    degradedReasons: Array.from(snap.state.degradedReasons),
    scrapingCompletionWarning: warning,
  });
  emitLog(opts, {
    level: 'warn',
    scope: 'scraper',
    event: 'scrape.timeout',
    phase: scrapeProgress.phase,
    message: warning,
    details: {
      pagesScraped: result.pages.length,
      productPagesScraped: result.summary.productPagesScraped,
    },
  });
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

  // Slow connections (e.g. office VPNs routed through another region) need longer
  // timeouts or every page "times out". Probe once and extend budgets before starting.
  opts.onProgress({ phase: 'init', message: 'Checking connection speed to the site...' });
  const latencyMs = await measureSeedLatencyMs(seedUrl);
  const adaptedTimeouts = adaptTimeoutsForLatency(latencyMs, opts);
  if (adaptedTimeouts.adapted) {
    opts.timeout = adaptedTimeouts.timeout;
    opts.scrapeTimeout = adaptedTimeouts.scrapeTimeout;
    const message =
      `Slow connection detected (${((latencyMs ?? 0) / 1000).toFixed(1)}s to reach the site — VPN?). ` +
      `Extending page timeout to ${Math.round(opts.timeout / 1000)}s and overall budget to ${Math.round(opts.scrapeTimeout / 1000)}s.`;
    opts.onProgress({ phase: 'init', message });
    if (opts.verbose) console.log(`  ⚠ ${message}`);
    emitLog(opts, {
      level: 'warn',
      scope: 'scraper',
      event: 'connection.slow',
      phase: 'initializing',
      message,
      details: {
        latencyMs,
        pageTimeoutMs: opts.timeout,
        scrapeTimeoutMs: opts.scrapeTimeout,
      },
    });
  }

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
  emitLog(opts, {
    level: 'info',
    scope: 'scraper',
    event: 'wappalyzer.ready',
    phase: 'initializing',
    message: wappalyzerReady ? 'Wappalyzer initialized' : 'Wappalyzer unavailable',
    details: { ready: wappalyzerReady },
  });

  const manager = new StealthBrowserManager({
    verbose: opts.verbose,
    onLog: (entry) => emitLog(opts, entry),
    onRestart: () => {
      emitLog(opts, {
        level: 'warn',
        scope: 'browser',
        event: 'browser.restarted',
        phase: 'scraping',
        message: 'Chromium restarted during assessment',
        details: { restartCount: manager.getRestartCount() },
      });
    },
  });

  const launched = await manager.launch();
  const session: BrowserSession = {
    manager,
    browser: launched.browser,
    context: launched.context,
    config: launched.config,
  };

  // Initialize accumulators
  const state = createInitialState(seedUrl, session.config);
  const debugInfo = createDebugInfo(session.config);
  lastScrapeSnapshot = { seedUrl, startedAt, state, debugInfo, platform: opts.platform };

  try {
    // Phase 0: Discover pages
    const targets = dedupeCrawlTargets(await discoverPages(session, seedUrl, state, opts));

    // Phase 1: Scrape discovered pages
    await scrapeDiscoveredPages(session, targets, state, opts, debugInfo, wappalyzerReady, startedAt);

    // Phase 2: Scrape product pages
    await scrapeProductPages(session.context, state, opts, startedAt);

    // Phase 3: Test checkout (optional; web UI often skips to avoid long stalls)
    if (!opts.skipCheckout) {
      await testCheckout(session, seedUrl, state, opts, startedAt);
    } else {
      state.checkoutSkipped = true;
      scrapeProgress.phase = 'checkout';
      scrapeProgress.currentUrl = '';
      opts.onProgress({ phase: 'checkout', message: 'Skipping checkout test (faster).' });
    }

    // Build result before browser teardown so the UI always receives data even if Chromium hangs on close.
    return buildResult(seedUrl, startedAt, state, debugInfo, {
      skipLog: scrapeRaceResolvedWithTimeout,
      platform: opts.platform,
    });
  } finally {
    scrapeProgress.phase = 'analyzing';
    scrapeProgress.currentUrl = '';
    void manager.close().catch(() => {});
  }
}

async function restartBrowserSession(
  session: BrowserSession,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  reason: string
): Promise<void> {
  if (!canRestartBrowser(state)) {
    activateLightweightFirstMode(state, opts, 'browser restart budget exhausted');
    return;
  }
  const relaunched = await session.manager.restart(reason);
  syncBrowserSession(session, relaunched);
  state.browserRestarts = session.manager.getRestartCount();
  state.degradedReasons.add('browser_restart');
  emitLog(opts, {
    level: 'warn',
    scope: 'browser',
    event: 'browser.restarted',
    phase: scrapeProgress.phase,
    message: `Browser restarted: ${reason}`,
    details: { restartCount: session.manager.getRestartCount() },
  });
}

function syncBrowserSession(session: BrowserSession, launched: { browser: Browser; context: BrowserContext; config: BrowserConfig }): void {
  session.browser = launched.browser;
  session.context = launched.context;
  session.config = launched.config;
}

async function ensureLiveBrowserSession(
  session: BrowserSession,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  reason: string
): Promise<void> {
  if (session.browser.isConnected()) return;
  if (canRestartBrowser(state)) {
    await restartBrowserSession(session, state, opts, reason);
    return;
  }
  const relaunched = await session.manager.ensureSession(reason);
  syncBrowserSession(session, relaunched);
}

async function createRecoveryContext(
  session: BrowserSession,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  reason: string,
  contextOptions: Omit<ContextOptions, 'verbose' | 'config'> & { config?: BrowserConfig } = {}
): Promise<{ context: BrowserContext; config: BrowserConfig }> {
  await ensureLiveBrowserSession(session, state, opts, reason);
  const buildContext = () =>
    createStealthContext(session.browser, {
      verbose: opts.verbose,
      config: contextOptions.config ?? session.config,
      ...contextOptions,
    });

  try {
    return await buildContext();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isBrowserCrashError(message)) throw error;
    await restartBrowserSession(session, state, opts, `${reason} (newContext failed)`);
    return await buildContext();
  }
}

function markFallbackDiscovery(seedUrl: string, state: ScrapeState, opts: Required<ScrapeOptions>): CrawlTarget[] {
  state.discoveryUsedFallbackUrls = true;
  state.degradedReasons.add('discovery_fallback');
  return getFallbackTargets(seedUrl, opts.platform);
}

// ============ Discovery Phase ============

async function tryLightweightDiscovery(
  session: BrowserSession,
  state: ScrapeState,
  seedUrl: string,
  opts: Required<ScrapeOptions>
): Promise<CrawlTarget[] | null> {
  emitLog(opts, {
    level: 'warn',
    scope: 'scraper',
    event: 'discovery.lightweight_retry',
    phase: 'discovery',
    message: 'Retrying discovery with lightweight rendering',
    details: { seedUrl },
  });

  const recovery = await createRecoveryContext(session, state, opts, 'lightweight discovery', {
    javaScriptEnabled: false,
    blockHeavyResources: true,
  });
  const page = await recovery.context.newPage();

  try {
    const navResult = await gotoWithRetry(page, seedUrl, {
      timeout: lightweightNavigationTimeout(opts.timeout),
      maxRetries: 0,
      verbose: opts.verbose,
      waitForNetworkIdle: false,
    });

    if (navResult.error || navResult.blocked) return null;

    const statusCode = navResult.response?.status();
    if (statusCode && statusCode >= 400) return null;

    const discoveryPromise = discoverCrawlTargets(page, seedUrl, opts.verbose, opts.platform);
    const timeoutPromise = new Promise<CrawlTarget[]>((_, reject) =>
      setTimeout(() => reject(new Error('Lightweight discovery timeout')), 10000)
    );
    const targets = await Promise.race([discoveryPromise, timeoutPromise]);

    emitLog(opts, {
      level: 'info',
      scope: 'scraper',
      event: 'discovery.lightweight_complete',
      phase: 'discovery',
      message: `Lightweight discovery found ${targets.length} pages to crawl`,
      details: { targetCount: targets.length },
    });
    return targets;
  } catch (error) {
    emitLog(opts, {
      level: 'warn',
      scope: 'scraper',
      event: 'discovery.lightweight_failed',
      phase: 'discovery',
      message: error instanceof Error ? error.message : 'Lightweight discovery failed',
      details: { seedUrl },
    });
    return null;
  } finally {
    await page.close().catch(() => {});
    await recovery.context.close().catch(() => {});
  }
}

async function discoverPages(
  session: BrowserSession,
  seedUrl: string,
  state: ScrapeState,
  opts: Required<ScrapeOptions>
): Promise<CrawlTarget[]> {
  scrapeProgress.phase = 'discovery';
  opts.onProgress({ phase: 'init', message: 'Discovering site structure...' });
  if (opts.verbose) console.log('  Discovering site structure...');
  emitLog(opts, {
    level: 'info',
    scope: 'scraper',
    event: 'discovery.started',
    phase: 'discovery',
    message: 'Discovering site structure',
    details: { seedUrl },
  });

  await ensureLiveBrowserSession(session, state, opts, 'pre-discovery');

  const indexedTargets = await discoverIndexedCrawlTargets(seedUrl, opts.verbose, opts.platform);
  if (indexedTargets.length > 0) {
    opts.onProgress({
      phase: 'init',
      message: `Found ${indexedTargets.length} sitemap/search-index URL(s).`,
    });
  }

  const discoveryPage = await session.context.newPage();
  attachPageCrashLogging(discoveryPage, (entry) => emitLog(opts, entry), seedUrl, () => noteRendererCrash(state, opts));
  let navResult = await gotoWithRetry(discoveryPage, seedUrl, {
    timeout: opts.timeout,
    maxRetries: 2,
    verbose: opts.verbose,
    waitForNetworkIdle: true,
  });
  let activeContext: BrowserContext | undefined;

  if (navResult.blocked) {
    await discoveryPage.close().catch(() => {});
    const rotated = await createRecoveryContext(session, state, opts, 'discovery bot-block retry');
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
        const discoveryPromise = discoverCrawlTargets(retryPage, seedUrl, opts.verbose, opts.platform);
        const timeoutPromise = new Promise<CrawlTarget[]>((_, reject) =>
          setTimeout(() => reject(new Error('Discovery timeout')), 10000)
        );
        const targets = await Promise.race([discoveryPromise, timeoutPromise]);
        await retryPage.close().catch(() => {});
        await activeContext.close().catch(() => {});
        const mergedTargets = mergeCrawlTargets(targets, indexedTargets);
        if (opts.verbose) console.log(`  Found ${mergedTargets.length} pages to crawl`);
        return mergedTargets;
      } catch (discoveryError) {
        if (opts.verbose) console.log(`  ⚠ Discovery failed (${discoveryError})`);
      }
    }
    await retryPage.close().catch(() => {});
  }

  if (shouldRestartBrowserOnNavigationFailure(navResult)) {
    await discoveryPage.close().catch(() => {});
    await activeContext?.close().catch(() => {});
    await restartBrowserSession(session, state, opts, 'discovery navigation crash');
    const retryPage = await session.context.newPage();
    attachPageCrashLogging(retryPage, (entry) => emitLog(opts, entry), seedUrl, () => noteRendererCrash(state, opts));
    navResult = await gotoWithRetry(retryPage, seedUrl, {
      timeout: opts.timeout,
      maxRetries: 1,
      verbose: opts.verbose,
      waitForNetworkIdle: true,
    });
    if (!navResult.error && !navResult.blocked && (!navResult.response || navResult.response.status() < 400)) {
      await dismissCookieConsent(retryPage, opts.verbose);
      try {
        const discoveryPromise = discoverCrawlTargets(retryPage, seedUrl, opts.verbose, opts.platform);
        const timeoutPromise = new Promise<CrawlTarget[]>((_, reject) =>
          setTimeout(() => reject(new Error('Discovery timeout')), 10000)
        );
        const targets = await Promise.race([discoveryPromise, timeoutPromise]);
        await retryPage.close().catch(() => {});
        const mergedTargets = mergeCrawlTargets(targets, indexedTargets);
        if (opts.verbose) console.log(`  Found ${mergedTargets.length} pages to crawl after browser restart`);
        return mergedTargets;
      } catch {
        // fall through to lightweight / fallback
      }
    }
    await retryPage.close().catch(() => {});
  }

  if (shouldRetryWithLightweightNavigation(navResult)) {
    const targets = await tryLightweightDiscovery(session, state, seedUrl, opts);
    if (targets) {
      await activeContext?.close().catch(() => {});
      await discoveryPage.close().catch(() => {});
      state.degradedReasons.add('lightweight_capture');
      const mergedTargets = mergeCrawlTargets(targets, indexedTargets);
      if (opts.verbose) console.log(`  Found ${mergedTargets.length} pages to crawl via lightweight discovery`);
      return mergedTargets;
    }
  }

  if (navResult.error || navResult.blocked) {
    handleNavigationError({ url: seedUrl, type: 'home' }, navResult, state, opts);
    await activeContext?.close().catch(() => {});
    await discoveryPage.close().catch(() => {});
    if (indexedTargets.length > 0) {
      if (opts.verbose) console.log('  ⚠ Discovery seed failed, using sitemap/search-index targets');
      return indexedTargets;
    }
    if (opts.verbose) console.log('  ⚠ Discovery seed failed, using fallback targets');
    return markFallbackDiscovery(seedUrl, state, opts);
  }

  const seedStatus = navResult.response?.status();
  if (seedStatus && seedStatus >= 400) {
    state.errors.push({ url: seedUrl, error: `HTTP ${seedStatus}`, type: classifyError('', seedStatus) });
    await activeContext?.close().catch(() => {});
    await discoveryPage.close().catch(() => {});
    if (indexedTargets.length > 0) {
      if (opts.verbose) console.log(`  ⚠ Seed URL HTTP ${seedStatus}, using sitemap/search-index targets`);
      return indexedTargets;
    }
    if (opts.verbose) console.log(`  ⚠ Seed URL HTTP ${seedStatus}, using fallback targets`);
    return markFallbackDiscovery(seedUrl, state, opts);
  }

  // Dismiss cookie consent banner if present
  await dismissCookieConsent(discoveryPage, opts.verbose);

  let targets: CrawlTarget[];
  try {
    const discoveryPromise = discoverCrawlTargets(discoveryPage, seedUrl, opts.verbose, opts.platform);
    const timeoutPromise = new Promise<CrawlTarget[]>((_, reject) =>
      setTimeout(() => reject(new Error('Discovery timeout')), 10000)
    );
    targets = await Promise.race([discoveryPromise, timeoutPromise]);
  } catch (discoveryError) {
    if (opts.verbose) console.log(`  ⚠ Discovery failed (${discoveryError})`);
    targets = indexedTargets.length > 0 ? indexedTargets : markFallbackDiscovery(seedUrl, state, opts);
  }

  await activeContext?.close().catch(() => {});
  await discoveryPage.close().catch(() => {});
  const mergedTargets = mergeCrawlTargets(targets, indexedTargets);
  if (opts.verbose) console.log(`  Found ${mergedTargets.length} pages to crawl`);
  emitLog(opts, {
    level: 'info',
    scope: 'scraper',
    event: 'discovery.complete',
    phase: 'discovery',
    message: `Found ${mergedTargets.length} pages to crawl`,
    details: { targetCount: mergedTargets.length, indexedCount: indexedTargets.length },
  });
  return mergedTargets;
}

async function scrapeTargetAttempt(
  context: BrowserContext,
  target: CrawlTarget,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  debugInfo: Partial<DebugInfo>,
  wappalyzerReady: boolean,
  lastVisitedUrl: string | undefined,
  options: { recordNavigationErrors?: boolean; lightweight?: boolean; captureMode?: PageData['captureMode'] } = {}
): Promise<{
  success: boolean;
  finalUrl?: string;
  navigationFailure?: { error?: string | null; blocked?: boolean; blockType?: string | null };
}> {
  const page = await context.newPage();
  const networkRequests: NetworkRequest[] = [];
  const recordNavigationErrors = options.recordNavigationErrors ?? true;
  const captureMode: PageData['captureMode'] = options.lightweight ? 'degraded' : (options.captureMode ?? 'full');

  try {
    setupNetworkTracking(page, state, networkRequests, debugInfo);
    attachPageCrashLogging(
      page,
      (entry) => emitLog(opts, entry),
      target.url,
      () => noteRendererCrash(state, opts)
    );

    const navResult = await gotoWithRetry(page, target.url, {
      timeout: options.lightweight ? lightweightNavigationTimeout(opts.timeout) : opts.timeout,
      maxRetries: options.lightweight ? 0 : 2,
      verbose: opts.verbose,
      referer: lastVisitedUrl,
      waitForNetworkIdle: !options.lightweight,
    });

    if (navResult.error) {
      if (recordNavigationErrors) {
        handleNavigationError(target, navResult, state, opts);
      }
      return { success: false, navigationFailure: navResult };
    }

    if (navResult.blocked) {
      const navigationFailure = { blocked: true, blockType: navResult.blockType };
      if (recordNavigationErrors) {
        handleNavigationError(target, navigationFailure, state, opts);
      }
      return { success: false, navigationFailure };
    }

    const statusCode = navResult.response?.status();
    if (statusCode && statusCode >= 400) {
      state.errors.push({ url: target.url, error: `HTTP ${statusCode}`, type: classifyError('', statusCode) });
      if (opts.verbose) console.log(`  ✗ ${target.type}: ${target.url} - HTTP ${statusCode}`);
      emitLog(opts, {
        level: 'warn',
        scope: 'scraper',
        event: 'page.http_error',
        phase: 'page-scraping',
        message: `HTTP ${statusCode} for ${target.url}`,
        details: { url: target.url, statusCode, targetType: target.type },
      });
      return { success: false };
    }

    if (!validateRedirect(page, target, state, debugInfo)) {
      return { success: false };
    }

    markTargetVisited(state, target.url);

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
    pageData.captureMode = captureMode;
    if (captureMode === 'degraded') {
      state.degradedReasons.add('lightweight_capture');
    }
    state.pages.push(pageData);
    scrapeProgress.pagesScraped = state.pages.length;

    await processPageContent(target, pageData, state, wappalyzerReady, opts);

    if (opts.verbose) console.log(`  ✓ ${target.type}: ${pageData.url}`);
    emitLog(opts, {
      level: 'info',
      scope: 'scraper',
      event: 'page.scraped',
      phase: 'page-scraping',
      message: `Scraped ${target.type} page`,
      details: { url: pageData.url, targetType: target.type, statusCode },
    });
    return { success: true, finalUrl: page.url() };
  } catch (error) {
    handlePageError(error, target, state, opts);
    return { success: false };
  } finally {
    await page.close().catch(() => {});
  }
}

// ============ Page Scraping Phase ============

function recordCrashFromFailure(
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  failure?: { error?: string | null }
): void {
  if (failure?.error && isBrowserCrashError(failure.error)) {
    noteRendererCrash(state, opts);
  }
}

async function attemptLightweightPageScrape(
  session: BrowserSession,
  target: CrawlTarget,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  debugInfo: Partial<DebugInfo>,
  wappalyzerReady: boolean,
  lastVisitedUrl: string | undefined,
  reason: string
): Promise<{ success: boolean; finalUrl?: string; navigationFailure?: { error?: string | null; blocked?: boolean; blockType?: string | null } }> {
  emitLog(opts, {
    level: 'warn',
    scope: 'scraper',
    event: shouldPreferLightweightFirst(state) ? 'page.lightweight_first' : 'page.lightweight_retry',
    phase: 'page-scraping',
    message: shouldPreferLightweightFirst(state)
      ? 'Using degraded lightweight rendering first after renderer instability'
      : 'Retrying page with degraded lightweight rendering',
    details: { url: target.url, targetType: target.type, reason },
  });

  const recovery = await createRecoveryContext(session, state, opts, reason, {
    javaScriptEnabled: false,
    blockHeavyResources: true,
  });
  try {
    const attempt = await scrapeTargetAttempt(
      recovery.context,
      target,
      state,
      opts,
      debugInfo,
      wappalyzerReady,
      lastVisitedUrl,
      { recordNavigationErrors: false, lightweight: true }
    );
    return {
      success: attempt.success,
      finalUrl: attempt.finalUrl,
      navigationFailure: attempt.navigationFailure,
    };
  } finally {
    await recovery.context.close().catch(() => {});
  }
}

async function scrapeDiscoveredPages(
  session: BrowserSession,
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
    if (isTargetVisited(state, target.url)) continue;

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

      if (shouldSkipFullBrowserTarget(state, target.type)) {
        emitLog(opts, {
          level: 'warn',
          scope: 'scraper',
          event: 'page.skipped_unstable',
          phase: 'page-scraping',
          message: 'Skipped full-browser capture after renderer crash storm',
          details: { url: target.url, targetType: target.type },
        });
        state.errors.push({
          url: target.url,
          error: 'Skipped: full browser unstable for this page type',
          type: 'other',
        });
        continue;
      }

      if (shouldPreferLightweightFirst(state) && shouldUseLightweightFallback(target.type, true)) {
        const lightweightAttempt = await attemptLightweightPageScrape(
          session,
          target,
          state,
          opts,
          debugInfo,
          wappalyzerReady,
          lastVisitedUrl,
          'lightweight-first after renderer instability'
        );
        if (lightweightAttempt.success) {
          lastVisitedUrl = lightweightAttempt.finalUrl;
        } else if (lightweightAttempt.navigationFailure) {
          handleNavigationError(target, lightweightAttempt.navigationFailure, state, opts);
        }
        continue;
      }

      const primaryAttempt = await scrapeTargetAttempt(
        session.context,
        target,
        state,
        opts,
        debugInfo,
        wappalyzerReady,
        lastVisitedUrl,
        { recordNavigationErrors: false }
      );
      if (primaryAttempt.success) {
        lastVisitedUrl = primaryAttempt.finalUrl;
        continue;
      }

      const failure = primaryAttempt.navigationFailure;
      recordCrashFromFailure(state, opts, failure);

      if (failure && shouldRestartBrowserOnNavigationFailure(failure)) {
        if (opts.verbose) {
          console.log(`  ↻ ${target.type}: ${target.url} - Restarting browser after crash`);
        }
        await restartBrowserSession(session, state, opts, `page crash on ${target.url}`);
        if (session.browser.isConnected()) {
          const restartAttempt = await scrapeTargetAttempt(
            session.context,
            target,
            state,
            opts,
            debugInfo,
            wappalyzerReady,
            lastVisitedUrl,
            { recordNavigationErrors: false }
          );
          if (restartAttempt.success) {
            lastVisitedUrl = restartAttempt.finalUrl;
            continue;
          }
          recordCrashFromFailure(state, opts, restartAttempt.navigationFailure);
        }
      }

      const activeFailure = failure;
      const lightweightEligible = shouldUseLightweightFallback(target.type, shouldPreferLightweightFirst(state));

      if (activeFailure && shouldRetryFullBrowserNavigation(activeFailure) && !activeFailure.blocked && !shouldPreferLightweightFirst(state)) {
        if (opts.verbose) {
          console.log(`  ↻ ${target.type}: ${target.url} - Retrying in a fresh full-browser context`);
        }
        const rotated = await createRecoveryContext(session, state, opts, `fresh context retry on ${target.url}`);
        try {
          const recoveryAttempt = await scrapeTargetAttempt(
            rotated.context,
            target,
            state,
            opts,
            debugInfo,
            wappalyzerReady,
            lastVisitedUrl,
            { recordNavigationErrors: false }
          );
          if (recoveryAttempt.success) {
            lastVisitedUrl = recoveryAttempt.finalUrl;
            continue;
          }
          recordCrashFromFailure(state, opts, recoveryAttempt.navigationFailure);
        } finally {
          await rotated.context.close().catch(() => {});
        }
      }

      if (activeFailure && shouldRetryWithLightweightNavigation(activeFailure) && lightweightEligible) {
        const recoveryAttempt = await attemptLightweightPageScrape(
          session,
          target,
          state,
          opts,
          debugInfo,
          wappalyzerReady,
          lastVisitedUrl,
          `lightweight retry on ${target.url}`
        );
        if (recoveryAttempt.success) {
          lastVisitedUrl = recoveryAttempt.finalUrl;
          continue;
        }
        if (!recoveryAttempt.navigationFailure && activeFailure) {
          handleNavigationError(target, activeFailure, state, opts);
        }
        continue;
      }

      if (activeFailure?.blocked) {
        if (opts.verbose) {
          console.log(`  ↻ ${target.type}: ${target.url} - Retrying in a fresh context`);
        }
        const rotated = await createRecoveryContext(session, state, opts, `bot-block retry on ${target.url}`);
        try {
          const recoveryAttempt = await scrapeTargetAttempt(
            rotated.context,
            target,
            state,
            opts,
            debugInfo,
            wappalyzerReady,
            lastVisitedUrl,
            { recordNavigationErrors: false }
          );
          if (recoveryAttempt.success) {
            lastVisitedUrl = recoveryAttempt.finalUrl;
            continue;
          }
          if (recoveryAttempt.navigationFailure) {
            handleNavigationError(target, recoveryAttempt.navigationFailure, state, opts);
          }
        } finally {
          await rotated.context.close().catch(() => {});
        }
        continue;
      }

      if (activeFailure) {
        handleNavigationError(target, activeFailure, state, opts);
      }
    } catch (error) {
      handlePageError(error, target, state, opts);
    }
  }
}

function setupNetworkTracking(
  page: Page,
  state: ScrapeState,
  networkRequests: NetworkRequest[],
  debugInfo: Partial<DebugInfo>
): void {
  page.on('request', (request: Request) => {
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

  page.on('console', (msg: ConsoleMessage) => {
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
    emitLog(opts, {
      level: navResult.error.toLowerCase().includes('timeout') ? 'warn' : 'error',
      scope: 'scraper',
      event: navResult.error.toLowerCase().includes('timeout') ? 'page.timeout' : 'page.navigation_error',
      phase: 'page-scraping',
      message: navResult.error,
      details: { url: target.url, targetType: target.type, errorType: classifyError(navResult.error) },
    });
  } else if (navResult.blocked) {
    state.errors.push({
      url: target.url,
      error: `Bot detection: ${navResult.blockType}`,
      type: 'blocked',
      blockType: navResult.blockType || undefined,
    });
    if (opts.verbose) console.log(`  ⚠️ ${target.type}: ${target.url} - Blocked by ${navResult.blockType}`);
    emitLog(opts, {
      level: 'warn',
      scope: 'scraper',
      event: 'page.blocked',
      phase: 'page-scraping',
      message: `Blocked by ${navResult.blockType}`,
      details: { url: target.url, blockType: navResult.blockType, targetType: target.type },
    });
  }
}

function validateRedirect(
  page: Page,
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

  // Return portal href scan on every page (portal link often absent from visible text)
  if (pageData.rawHtml) {
    const hrefs = [...pageData.rawHtml.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
    const portalFromLinks = detectReturnPortal(hrefs);
    if (portalFromLinks.returnProvider) {
      state.thirdParties.add(portalFromLinks.returnProvider);
      state.extractedPolicies.push({ rawExcerpts: {}, ...portalFromLinks });
    }
  }

  // Policy extraction
  if ((target.type === 'policy' || target.type === 'other') && pageData.cleanedText.length > 100) {
    const policyInfo = extractPolicyInfo(pageData.cleanedText, pageData.url, pageData.rawHtml);
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
    const productUrls = extractProductLinks(pageData.rawHtml, pageData.url, opts.platform);
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
  emitLog(opts, {
    level: 'error',
    scope: 'scraper',
    event: 'page.error',
    phase: 'page-scraping',
    message: errorMsg,
    details: { url: target.url, targetType: target.type },
  });
}

// ============ Product Pages Phase ============

async function scrapeProductPages(
  context: BrowserContext,
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

  emitLog(opts, {
    level: 'info',
    scope: 'scraper',
    event: 'product_pages.started',
    phase: 'product-pages',
    message: `Scraping ${productCount} product pages`,
    details: { productCount },
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

      page.on('request', (request: Request) => {
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
  session: BrowserSession,
  seedUrl: string,
  state: ScrapeState,
  opts: Required<ScrapeOptions>,
  startedAt: string
): Promise<void> {
  const checkoutUrl = new URL('/checkout', seedUrl).toString();
  const checkoutProductCandidates = collectCheckoutProductCandidates(state, opts);
  const checkoutDebug: {
    stage?: string;
    stoppedAt?: string;
    addToCartResult?: { added: boolean; currentUrl: string; cartReady: boolean };
  } = {};
  scrapeProgress.phase = 'checkout';
  scrapeProgress.currentUrl = checkoutUrl;

  if (!shouldAttemptCheckoutAfterCrawl(state.pages.length, checkoutProductCandidates.length)) {
    state.checkoutSkipped = true;
    state.checkoutStoppedAt = 'skipped: no pages or product candidates collected';
    emitLog(opts, {
      level: 'warn',
      scope: 'checkout',
      event: 'checkout.skipped',
      phase: 'checkout',
      message: 'Skipping checkout because no pages or product candidates were collected',
      details: { checkoutUrl },
    });
    return;
  }

  opts.onProgress({ phase: 'checkout', message: 'Testing checkout flow...' });

  emitLog(opts, {
    level: 'info',
    scope: 'checkout',
    event: 'checkout.started',
    phase: 'checkout',
    message: 'Testing checkout flow',
    details: { checkoutUrl, productCandidates: checkoutProductCandidates.length },
  });

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
    const checkoutPromise = testCheckoutFlow(session.context, seedUrl, {
      timeout: opts.timeout,
      verbose: opts.verbose,
      preferredProductUrls: checkoutProductCandidates,
      platform: opts.platform,
      abortSignal: abortController.signal,
      onDebugUpdate: (update) => Object.assign(checkoutDebug, update),
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
      const rotated = await createRecoveryContext(session, state, opts, 'checkout bot-block retry');
      try {
        checkoutResult = await testCheckoutFlow(rotated.context, seedUrl, {
          timeout: opts.timeout,
          verbose: opts.verbose,
          preferredProductUrls: checkoutProductCandidates,
          platform: opts.platform,
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
      state.checkoutStoppedAt =
        checkoutResult.stoppedAt ||
        checkoutDebug.stoppedAt ||
        formatCheckoutDebugStop(checkoutDebug);

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
      emitLog(opts, {
        level: checkoutResult.reachedCheckout ? 'info' : 'warn',
        scope: 'checkout',
        event: checkoutResult.reachedCheckout ? 'checkout.reached' : 'checkout.not_reached',
        phase: 'checkout',
        message: checkoutResult.reachedCheckout ? 'Checkout reached' : 'Checkout not reached',
        details: {
          stoppedAt: checkoutResult.stoppedAt,
          expressWallets: checkoutResult.checkoutInfo.expressWallets,
          bnplOptions: checkoutResult.checkoutInfo.bnplOptions,
          errorCount: checkoutResult.errors.length,
        },
      });
    } else {
      state.checkoutStoppedAt = formatCheckoutDebugStop(checkoutDebug);
      state.errors.push({ url: checkoutUrl, error: 'Checkout test timed out', type: 'timeout' });
      emitLog(opts, {
        level: 'warn',
        scope: 'checkout',
        event: 'checkout.timeout',
        phase: 'checkout',
        message: 'Checkout test timed out',
        details: { checkoutUrl },
      });
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
    emitLog(opts, {
      level: 'error',
      scope: 'checkout',
      event: 'checkout.failed',
      phase: 'checkout',
      message: error instanceof Error ? error.message : 'Unknown checkout error',
      details: { checkoutUrl },
    });
  } finally {
    if (checkoutTick) clearInterval(checkoutTick);
  }

  if (opts.verbose && !state.checkoutReached) {
    console.log(`  ⚠ Checkout not reached (may have timed out or cart was empty)`);
  }
}

function formatCheckoutDebugStop(debug: {
  stage?: string;
  stoppedAt?: string;
  addToCartResult?: { added: boolean; currentUrl: string; cartReady: boolean };
}): string | undefined {
  const parts: string[] = [];

  if (debug.stoppedAt) parts.push(debug.stoppedAt);
  if (debug.stage) parts.push(`stage=${debug.stage}`);

  if (debug.addToCartResult) {
    const { added, cartReady, currentUrl } = debug.addToCartResult;
    parts.push(`addToCart(added=${added}, cartReady=${cartReady}, url=${currentUrl})`);
  }

  return parts.length > 0 ? parts.join(' | ') : undefined;
}

function collectCheckoutProductCandidates(state: ScrapeState, opts: Required<ScrapeOptions>): string[] {
  const profile = getPlatformProfile(opts.platform);
  return Array.from(
    new Set([
      ...state.pages
        .filter((page) =>
          page.matchedCategories.includes('pdp') ||
          profile.productUrlScorePatterns.some(({ pattern }) => pattern.test(page.url))
        )
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

function buildBotDetectionWarning(state: ScrapeState): string | undefined {
  const blocked = state.errors.filter((error) => error.type === 'blocked');
  if (blocked.length === 0) return undefined;

  const blockers = Array.from(new Set(blocked.map((error) => error.blockType || 'bot protection')));
  const blockerText = blockers.join(', ');
  if (state.pages.length === 0) {
    return `Automated crawl was blocked by ${blockerText}. Sweep could not collect page evidence; use sitemap/search-index results, manual WA inputs, or a proxy-supported run.`;
  }

  return `Some crawl targets were blocked by ${blockerText}. Treat the assessment as partial and manually verify blocked areas.`;
}

function buildResult(
  seedUrl: string,
  startedAt: string,
  state: ScrapeState,
  debugInfo: Partial<DebugInfo>,
  options?: { skipLog?: boolean; platform?: Required<ScrapeOptions>['platform'] }
): ScrapeResult {
  const completedAt = new Date().toISOString();
  const profile = getPlatformProfile(options?.platform);
  const selectedLabel = profile.label.toLowerCase();
  const detectedLabel = state.platformDetected?.toLowerCase();
  const platformConflict =
    detectedLabel && profile.id !== 'unknown' && detectedLabel !== selectedLabel
      ? `User selected ${profile.label}, but crawler evidence detected ${state.platformDetected}.`
      : undefined;

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
      selectedPlatform: { id: profile.id, label: profile.label },
      platformDetected: state.platformDetected,
      platformConflict,
      botDetectionWarning: buildBotDetectionWarning(state),
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
      scrapeQuality: deriveScrapeQuality({
        pages: state.pages,
        browserRestarts: state.browserRestarts,
        discoveryUsedFallbackUrls: state.discoveryUsedFallbackUrls,
        degradedReasons: Array.from(state.degradedReasons),
        scrapingCompletionWarning: undefined,
      }),
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
