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
import { detectBundles, detectCustomizableProducts, detectVirtualProducts, detectGiftCards, detectSubscriptions, detectPreOrders, detectLoyaltyProgram, detectLocalization, detectMarketplaces, detectGWP } from './catalogDetector.js';

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
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
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
          
          // Loyalty program
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
        errors.push({
          url: productUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
          type: 'other',
        });
      }
    }
    
    // Phase 3: Checkout flow testing
    // Try to add an item and navigate to checkout
    try {
      const checkoutResult = await testCheckoutFlow(context, seedUrl, opts);
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
    
  } finally {
    await browser.close();
  }

  const completedAt = new Date().toISOString();
  
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
    
    // Step 3: Try to add to cart
    const addToCartSelectors = [
      'button[name="add"]',
      'button[type="submit"][form*="product"]',
      'button:has-text("Add to cart")',
      'button:has-text("Add to Cart")',
      'button:has-text("ADD TO CART")',
      'button:has-text("Add to bag")',
      '[data-add-to-cart]',
      '.add-to-cart',
      '#add-to-cart',
      '.product-form__submit',
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
