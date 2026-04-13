/**
 * URL discovery and link classification
 * Extracts crawl targets from homepage links
 */

import { Page } from 'playwright';

export interface CrawlTarget {
  url: string;
  type: 'home' | 'pdp' | 'collection' | 'cart' | 'checkout' | 'policy' | 'rewards' | 'other';
  source?: string;
}

// URL pattern classifiers
const LINK_CLASSIFIERS: { pattern: RegExp; type: CrawlTarget['type']; priority: number }[] = [
  // Policy pages (high priority)
  { pattern: /\/(pages?\/)?(policies?|terms|privacy|refund|returns?|shipping|exchange|warranty|guarantee)/i, type: 'policy', priority: 10 },
  { pattern: /\/(pages?\/)?(delivery|returns?-policy|shipping-policy|refund-policy)/i, type: 'policy', priority: 10 },
  { pattern: /\/(pages?\/)?(customer-service|help-center|support)/i, type: 'other', priority: 8 },
  { pattern: /\/(pages?\/)?(faq|faqs|help|contact|contact-us)/i, type: 'other', priority: 7 },
  { pattern: /\/(info|information)\/(shipping|returns|delivery)/i, type: 'policy', priority: 9 },
  { pattern: /\/help\/(shipping|returns|orders|payments)/i, type: 'policy', priority: 9 },

  // Rewards/Loyalty pages (high priority)
  { pattern: /\/(pages?\/)?(rewards?|loyalty|points|vip|member|referr?als?|perks)/i, type: 'rewards', priority: 10 },
  { pattern: /\/(pages?\/)?(refer-a-friend|ambassador|affiliate)/i, type: 'rewards', priority: 8 },

  // Collection pages
  { pattern: /\/(collections?|shop|category|categories|products?)$/i, type: 'collection', priority: 8 },
  { pattern: /\/collections\/[^\/]+$/i, type: 'collection', priority: 7 },
  { pattern: /\/(mens?|womens?|kids?|sale|new|best-sellers?|all)/i, type: 'collection', priority: 6 },
  { pattern: /\/shop\/(all|mens?|womens?|new)/i, type: 'collection', priority: 7 },

  // Cart/Checkout
  { pattern: /\/(cart|bag|basket)$/i, type: 'cart', priority: 6 },
  { pattern: /\/checkout/i, type: 'checkout', priority: 6 },

  // Product pages (lower priority - discovered from collections)
  { pattern: /\/products\/[^\/]+$/i, type: 'pdp', priority: 3 },
];

// Text-based classifiers for ambiguous URLs
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
 */
export async function discoverCrawlTargets(page: Page, seedUrl: string, verbose: boolean): Promise<CrawlTarget[]> {
  const base = new URL(seedUrl).origin;
  const discovered = new Map<string, CrawlTarget>();

  // Always include homepage
  discovered.set(base, { url: base, type: 'home', source: 'seed' });
  discovered.set(base + '/', { url: base + '/', type: 'home', source: 'seed' });

  // Scroll to footer to trigger lazy-loading of footer content
  await scrollToFooter(page, verbose);

  // Extract all links from the page
  const links = await page.evaluate(new Function(`
    var results = [];
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var anchor = anchors[i];
      var href = anchor.href;
      var text = (anchor.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 100);
      var ariaLabel = anchor.getAttribute('aria-label') || '';
      var location = 'body';
      // Expanded footer detection selectors
      if (anchor.closest('footer, [class*="footer"], [class*="Footer"], [id*="footer"], [id*="Footer"], [role="contentinfo"], [data-section-type="footer"], .site-footer, #site-footer, .page-footer, #shopify-section-footer')) {
        location = 'footer';
      } else if (anchor.closest('nav, [class*="nav"], [class*="Nav"], [id*="nav"], header, [role="navigation"], .header, #header, .site-header')) {
        location = 'nav';
      }
      if (href && (text || ariaLabel)) {
        results.push({ href: href, text: text || ariaLabel, location: location });
      }
    }
    return results;
  `) as () => { href: string; text: string; location: string }[]);

  if (verbose) {
    const footerLinks = links.filter(l => l.location === 'footer').length;
    console.log(`  → Found ${links.length} links on homepage (${footerLinks} from footer)`);
  }

  // Process discovered links
  for (const link of links) {
    try {
      const url = new URL(link.href);

      // Skip external, anchors, non-http
      if (url.origin !== base) continue;
      if (url.hash && url.pathname === new URL(seedUrl).pathname) continue;
      if (!url.protocol.startsWith('http')) continue;

      // Skip non-content paths
      if (/\.(jpg|jpeg|png|gif|svg|css|js|woff|ico|pdf)$/i.test(url.pathname)) continue;
      if (/\/(cdn|assets|static|media)\//i.test(url.pathname)) continue;
      if (/\/(account|login|register|cart\/add|checkout)/i.test(url.pathname)) continue;

      const normalizedUrl = url.origin + url.pathname.replace(/\/$/, '');
      if (discovered.has(normalizedUrl)) continue;

      // Classify the link
      let type: CrawlTarget['type'] = 'other';
      let priority = 0;

      // URL pattern matching
      for (const classifier of LINK_CLASSIFIERS) {
        if (classifier.pattern.test(url.pathname)) {
          type = classifier.type;
          priority = classifier.priority;
          break;
        }
      }

      // Text-based classification for ambiguous URLs
      if (type === 'other' || priority < 5) {
        for (const classifier of TEXT_CLASSIFIERS) {
          if (classifier.pattern.test(link.text)) {
            type = classifier.type;
            priority = 8;
            break;
          }
        }
      }

      // Boost footer links
      if (link.location === 'footer') {
        priority += 2;
      }

      discovered.set(normalizedUrl, { url: normalizedUrl, type, source: link.location });
    } catch {
      // Invalid URL, skip
    }
  }

  // Convert to array and sort by priority
  let targets = Array.from(discovered.values());

  const typePriority: Record<CrawlTarget['type'], number> = {
    'home': 100,
    'policy': 95,
    'rewards': 94,
    'cart': 90,
    'collection': 80,
    'checkout': 70,
    'other': 50,
    'pdp': 10,
  };

  targets.sort((a, b) => (typePriority[b.type] || 0) - (typePriority[a.type] || 0));

  // Limit bulk page types
  const MAX_COLLECTIONS = 4;
  const MAX_DISCOVERED_PDPS = 3;
  let collectionCount = 0;
  let pdpCount = 0;

  targets = targets.filter(t => {
    if (t.type === 'collection') {
      collectionCount++;
      return collectionCount <= MAX_COLLECTIONS;
    }
    if (t.type === 'pdp') {
      pdpCount++;
      return pdpCount <= MAX_DISCOVERED_PDPS;
    }
    return true;
  });

  // Add fallbacks if too few targets
  if (targets.length < 5) {
    const fallbacks = getFallbackTargets(seedUrl);
    for (const fb of fallbacks) {
      if (!discovered.has(fb.url)) {
        targets.push(fb);
      }
    }
    if (verbose) {
      console.log(`  → Added fallback URLs (discovery found too few)`);
    }
  }

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
 */
export function getFallbackTargets(seedUrl: string): CrawlTarget[] {
  const base = seedUrl.replace(/\/$/, '');
  return [
    { url: base, type: 'home', source: 'fallback' },
    { url: `${base}/collections/all`, type: 'collection', source: 'fallback' },
    { url: `${base}/collections`, type: 'collection', source: 'fallback' },
    { url: `${base}/shop`, type: 'collection', source: 'fallback' },
    { url: `${base}/products`, type: 'collection', source: 'fallback' },
    { url: `${base}/policies/shipping-policy`, type: 'policy', source: 'fallback' },
    { url: `${base}/policies/refund-policy`, type: 'policy', source: 'fallback' },
    { url: `${base}/pages/shipping`, type: 'policy', source: 'fallback' },
    { url: `${base}/pages/returns`, type: 'policy', source: 'fallback' },
    { url: `${base}/pages/shipping-returns`, type: 'policy', source: 'fallback' },
    { url: `${base}/pages/faq`, type: 'other', source: 'fallback' },
    { url: `${base}/help`, type: 'other', source: 'fallback' },
    { url: `${base}/cart`, type: 'cart', source: 'fallback' },
  ];
}

/**
 * Scroll to footer to trigger lazy-loading of footer content
 */
async function scrollToFooter(page: Page, verbose: boolean): Promise<void> {
  try {
    // First, scroll down in steps to trigger any lazy-loading along the way
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    
    // Scroll in 3 steps to bottom
    const steps = 3;
    for (let i = 1; i <= steps; i++) {
      const scrollTo = Math.min((scrollHeight / steps) * i, scrollHeight - viewportHeight);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), scrollTo);
      await page.waitForTimeout(300);
    }

    // Scroll to absolute bottom
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(500);

    // Try to scroll footer element into view if it exists
    await page.evaluate(() => {
      const footer = document.querySelector('footer, [class*="footer"], [id*="footer"], [role="contentinfo"]');
      if (footer) {
        footer.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });

    // Wait for lazy content to load
    await page.waitForTimeout(800);

    // Wait for any network activity to settle
    try {
      await page.waitForLoadState('networkidle', { timeout: 3000 });
    } catch {
      // Network idle timeout is fine
    }

    // Scroll back to top for consistent state
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(300);

    if (verbose) {
      console.log(`  → Scrolled to footer to discover links`);
    }
  } catch (error) {
    // Scroll failed, continue without error
    if (verbose) {
      console.log(`  → Footer scroll skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}
