/**
 * Third-party detection from network requests and page content
 * Focused on WA-critical apps only: red flags, loyalty, subscriptions, returns, payments
 */

interface ThirdPartyPattern {
  name: string;
  patterns: RegExp[];
  category: string;
  priority: 'critical' | 'high' | 'medium';
  notes?: string;
}

// Only keep patterns that matter for Website Assessments
const THIRD_PARTY_PATTERNS: ThirdPartyPattern[] = [
  // ============ RED FLAGS - CRITICAL ============
  { 
    name: 'Smile.io', 
    patterns: [
      /smile\.io/i, 
      /sweettoothrewards/i,
      /cdn\.smile\.io/i,
      /js\.smile\.io/i,
      /sweettooth-.*\.js/i,
      /smile-ui/i,
    ], 
    category: 'loyalty',
    priority: 'critical',
    notes: '❌ NOT SUPPORTED by Global-e'
  },
  { 
    name: 'Recharge', 
    patterns: [
      /rechargepayments\.com/i, 
      /rechargeapps\.com/i,
      /rechargecdn\.com/i,
      /rc\.rechargeapps/i,
      /getrecharge\.com/i,
      /subscriptions.*recharge/i,
      /recharge-subscriptions/i,
    ], 
    category: 'subscriptions',
    priority: 'critical',
    notes: '⚠️ Uses proprietary checkout, often OoS'
  },

  // ============ POSITIVE SIGNALS ============
  { 
    name: 'ReturnGO', 
    patterns: [/returngo\.ai/i, /returnsportal\.returngo/i], 
    category: 'returns',
    priority: 'high',
    notes: '✅ GE Partner - flag as positive'
  },
  { 
    name: 'Global-e', 
    patterns: [/global-e\.com/i, /globale\.com/i, /ge-scripts/i], 
    category: 'cross_border',
    priority: 'critical',
    notes: 'Already using Global-e!'
  },

  // ============ LOYALTY (need to know for scoping) ============
  { name: 'LoyaltyLion', patterns: [/loyaltylion\.com/i], category: 'loyalty', priority: 'high', notes: '✅ Supported' },
  { name: 'Yotpo Loyalty', patterns: [/yotpo\.com/i, /staticw2\.yotpo/i], category: 'loyalty', priority: 'high', notes: '⚠️ In progress (slow)' },

  // ============ SUBSCRIPTIONS ============
  { name: 'Bold Subscriptions', patterns: [/boldapps\.net/i, /boldcommerce\.com/i], category: 'subscriptions', priority: 'high' },
  { name: 'Skio', patterns: [/skio\.com/i], category: 'subscriptions', priority: 'high' },
  { name: 'Ordergroove', patterns: [/ordergroove\.com/i], category: 'subscriptions', priority: 'high' },

  // ============ RETURNS ============
  { name: 'Loop Returns', patterns: [/loopreturns\.com/i], category: 'returns', priority: 'medium' },
  { name: 'Narvar', patterns: [/narvar\.com/i], category: 'returns', priority: 'medium' },
  { name: 'Happy Returns', patterns: [/happyreturns\.com/i], category: 'returns', priority: 'medium' },

  // ============ PAYMENTS / BNPL ============
  { name: 'Shop Pay', patterns: [/shop\.app/i, /shopify.*accelerated/i], category: 'payments', priority: 'high', notes: 'Shopify Payments indicator' },
  { name: 'Klarna', patterns: [/klarna\.com/i, /klarna-payments/i, /cdn\.klarna/i, /klarna-messaging/i], category: 'bnpl', priority: 'medium' },
  { name: 'Afterpay', patterns: [/afterpay\.com/i, /afterpay-js/i, /square.*afterpay/i, /static\.afterpay/i, /js\.afterpay/i], category: 'bnpl', priority: 'medium' },
  { name: 'Affirm', patterns: [/affirm\.com/i, /cdn1\.affirm/i, /cdn2\.affirm/i, /js\.affirm/i, /affirm-js/i, /www\.affirm/i], category: 'bnpl', priority: 'medium' },
  { name: 'Sezzle', patterns: [/sezzle\.com/i, /widget\.sezzle/i, /cdn\.sezzle/i], category: 'bnpl', priority: 'medium' },

  // ============ GIFT CARDS ============
  { name: 'Rise.ai', patterns: [/rise-ai\.com/i, /riseai\.co/i, /strn\.rise-ai/i], category: 'gift_cards', priority: 'medium' },

  // ============ CROSS-BORDER COMPETITORS ============
  { name: 'Reach', patterns: [/withreach\.com/i], category: 'cross_border', priority: 'critical', notes: 'Competitor!' },
  { name: 'Flow Commerce', patterns: [/flow\.io/i], category: 'cross_border', priority: 'critical', notes: 'Competitor!' },
  { name: 'Zonos', patterns: [/zonos\.com/i], category: 'cross_border', priority: 'critical', notes: 'Competitor!' },

  // ============ MARKETING / EMAIL ============
  { name: 'Klaviyo', patterns: [/klaviyo\.com/i, /a\.]klviyo\.com/i], category: 'email', priority: 'medium' },
  { name: 'Attentive', patterns: [/attentive\.com/i, /attn\.tv/i], category: 'sms', priority: 'medium' },
  { name: 'Postscript', patterns: [/postscript\.io/i], category: 'sms', priority: 'medium' },
  { name: 'Mailchimp', patterns: [/mailchimp\.com/i, /list-manage\.com/i, /chimpstatic\.com/i], category: 'email', priority: 'medium' },
  { name: 'Listrak', patterns: [/listrak\.com/i, /listrakbi\.com/i], category: 'email', priority: 'medium' },

  // ============ REVIEWS ============
  { name: 'Judge.me', patterns: [/judge\.me/i], category: 'reviews', priority: 'medium' },
  { name: 'Stamped.io', patterns: [/stamped\.io/i], category: 'reviews', priority: 'medium' },
  { name: 'Loox', patterns: [/loox\.io/i], category: 'reviews', priority: 'medium' },
  { name: 'Okendo', patterns: [/okendo\.io/i], category: 'reviews', priority: 'medium' },

  // ============ ANALYTICS ============
  { name: 'Google Analytics', patterns: [/google-analytics\.com/i, /googletagmanager\.com/i, /gtag/i], category: 'analytics', priority: 'medium' },
  { name: 'Hotjar', patterns: [/hotjar\.com/i], category: 'analytics', priority: 'medium' },
  { name: 'Segment', patterns: [/segment\.io/i, /segment\.com/i], category: 'analytics', priority: 'medium' },
  { name: 'Impact', patterns: [/impact\.com/i, /impactradius\.com/i, /d\.impactradius/i], category: 'affiliate', priority: 'medium' },

  // ============ CHAT / SUPPORT ============
  { name: 'Gorgias', patterns: [/gorgias\.chat/i, /gorgias\.io/i], category: 'support', priority: 'medium' },
  { name: 'Zendesk', patterns: [/zendesk\.com/i, /zdassets\.com/i, /static\.zdassets/i, /ekr\.zdassets/i, /zopim/i], category: 'support', priority: 'medium' },
  { name: 'Intercom', patterns: [/intercom\.io/i, /intercomcdn\.com/i], category: 'support', priority: 'medium' },
  { name: 'Gladly', patterns: [/gladly\.com/i, /cdn\.gladly\.qa/i, /gladly\.qa/i], category: 'support', priority: 'medium' },

  // ============ PERSONALIZATION ============
  { name: 'Nosto', patterns: [/nosto\.com/i], category: 'personalization', priority: 'medium' },
  { name: 'Rebuy', patterns: [/rebuyengine\.com/i], category: 'personalization', priority: 'medium' },
  { name: 'Bold', patterns: [/boldapps\.net/i, /boldcommerce\.com/i], category: 'apps', priority: 'medium' },

  // ============ SEARCH / FILTER ============
  { name: 'Boost Commerce', patterns: [/boostcommerce\.io/i, /boost-pfs\.com/i, /bc-sf-search/i], category: 'search', priority: 'medium' },
  { name: 'Searchanise', patterns: [/searchanise\.io/i], category: 'search', priority: 'medium' },
  { name: 'Algolia', patterns: [/algolia\.com/i, /algolianet\.com/i], category: 'search', priority: 'medium' },

  // ============ CART / CHECKOUT UPSELL ============
  { name: 'Checkout+', patterns: [/checkout-?plus/i, /shipping-?insurance/i, /route\.com/i], category: 'upsell', priority: 'medium', notes: 'Returns protection upsell' },
  { name: 'Route', patterns: [/route\.com/i], category: 'shipping_protection', priority: 'medium' },

  // ============ SHIPPING ============  
  { name: 'ShipBob', patterns: [/shipbob\.com/i], category: 'shipping', priority: 'medium' },
  { name: 'ShipStation', patterns: [/shipstation\.com/i], category: 'shipping', priority: 'medium' },
  { name: 'Easyship', patterns: [/easyship\.com/i], category: 'shipping', priority: 'medium' },
];

/**
 * Detect third-party service from a URL
 */
export function detectThirdParty(url: string): string | undefined {
  for (const { name, patterns } of THIRD_PARTY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        return name;
      }
    }
  }
  return undefined;
}

/**
 * Get detection info including notes
 */
export function getThirdPartyInfo(name: string): ThirdPartyPattern | undefined {
  return THIRD_PARTY_PATTERNS.find(p => p.name === name);
}

/**
 * Get all patterns for a specific category
 */
export function getPatternsForCategory(category: string): ThirdPartyPattern[] {
  return THIRD_PARTY_PATTERNS.filter(p => p.category === category);
}

/**
 * Get category for a detected third party
 */
export function getCategoryForThirdParty(name: string): string | undefined {
  const found = THIRD_PARTY_PATTERNS.find(p => p.name === name);
  return found?.category;
}

/**
 * Check if a detected third party is a red flag
 */
export function isRedFlag(name: string): boolean {
  const redFlags = ['Smile.io', 'Recharge', 'Reach', 'Flow Commerce', 'Zonos'];
  return redFlags.includes(name);
}

// ============ DANGEROUS GOODS DETECTION ============

const DG_KEYWORDS: { keyword: string; category: string; risk: 'high' | 'medium' }[] = [
  // Fragrances (high risk - flammable)
  { keyword: 'perfume', category: 'fragrance', risk: 'high' },
  { keyword: 'parfum', category: 'fragrance', risk: 'high' },
  { keyword: 'eau de toilette', category: 'fragrance', risk: 'high' },
  { keyword: 'eau de parfum', category: 'fragrance', risk: 'high' },
  { keyword: 'cologne', category: 'fragrance', risk: 'high' },
  { keyword: 'fragrance', category: 'fragrance', risk: 'high' },
  
  // Nail products (flammable)
  { keyword: 'nail polish', category: 'nail', risk: 'high' },
  { keyword: 'nail lacquer', category: 'nail', risk: 'high' },
  { keyword: 'nail enamel', category: 'nail', risk: 'high' },
  { keyword: 'nail remover', category: 'nail', risk: 'high' },
  
  // Aerosols
  { keyword: 'aerosol', category: 'aerosol', risk: 'high' },
  { keyword: 'spray', category: 'aerosol', risk: 'medium' },
  { keyword: 'hairspray', category: 'aerosol', risk: 'high' },
  { keyword: 'dry shampoo', category: 'aerosol', risk: 'high' },
  { keyword: 'setting spray', category: 'aerosol', risk: 'medium' },
  
  // Batteries
  { keyword: 'lithium battery', category: 'battery', risk: 'high' },
  { keyword: 'lithium-ion', category: 'battery', risk: 'high' },
  { keyword: 'li-ion', category: 'battery', risk: 'high' },
  { keyword: 'rechargeable battery', category: 'battery', risk: 'medium' },
  
  // Cosmetics (may contain DG ingredients)
  { keyword: 'self-tanner', category: 'cosmetics', risk: 'medium' },
  { keyword: 'sunscreen', category: 'cosmetics', risk: 'medium' },
  { keyword: 'hair dye', category: 'cosmetics', risk: 'medium' },
  { keyword: 'hair color', category: 'cosmetics', risk: 'medium' },
  
  // Flammables
  { keyword: 'alcohol-based', category: 'flammable', risk: 'high' },
  { keyword: 'flammable', category: 'flammable', risk: 'high' },
  { keyword: 'lighter', category: 'flammable', risk: 'high' },
  { keyword: 'matches', category: 'flammable', risk: 'high' },
  { keyword: 'candle', category: 'flammable', risk: 'medium' },
];

export interface DGMatch {
  keyword: string;
  category: string;
  risk: 'high' | 'medium';
  context: string; // surrounding text
}

// Words that indicate "lighter" is an adjective (weight) not a noun (fire device)
const LIGHTER_FALSE_POSITIVE_CONTEXT = [
  'lighter weight', 'lighter frame', 'lighter feel', 'lighter than',
  'lighter footprint', 'lighter fabric', 'lighter material', 'lighter design',
  'lighter construction', 'lighter and', 'lighter yet', 'lighter but',
  'lighter version', 'lighter option', 'much lighter', 'significantly lighter',
  'environmental footprint', 'carbon footprint',
];

/**
 * Scan text content for Dangerous Goods keywords
 */
export function scanForDangerousGoods(text: string): DGMatch[] {
  const matches: DGMatch[] = [];
  const lowerText = text.toLowerCase();
  
  for (const { keyword, category, risk } of DG_KEYWORDS) {
    const index = lowerText.indexOf(keyword.toLowerCase());
    if (index !== -1) {
      // Extract context (50 chars before and after)
      const start = Math.max(0, index - 50);
      const end = Math.min(text.length, index + keyword.length + 50);
      const context = text.slice(start, end).replace(/\s+/g, ' ').trim();
      const lowerContext = context.toLowerCase();
      
      // Special handling for "lighter" - skip if used as adjective for weight
      if (keyword === 'lighter') {
        const isFalsePositive = LIGHTER_FALSE_POSITIVE_CONTEXT.some(phrase => 
          lowerContext.includes(phrase)
        );
        if (isFalsePositive) {
          continue; // Skip this match - it's "lighter weight" not "cigarette lighter"
        }
      }
      
      matches.push({ keyword, category, risk, context });
    }
  }
  
  // Dedupe by category (keep first match per category)
  const seen = new Set<string>();
  return matches.filter(m => {
    if (seen.has(m.category)) return false;
    seen.add(m.category);
    return true;
  });
}

// ============ B2B / WHOLESALE DETECTION ============

// Strong B2B indicators (high confidence)
const B2B_STRONG_KEYWORDS = [
  'wholesale program',
  'wholesale account',
  'wholesale portal',
  'trade program',
  'trade account',
  'business account',
  'bulk order',
  'bulk pricing',
  'b2b portal',
  'b2b login',
  'faire.com',
];

// Weak B2B indicators (need context)
const B2B_WEAK_KEYWORDS = [
  'wholesale',
  'reseller',
  'dealer',
  'distributor',
  'b2b',
  'faire',
];

// Words that indicate the B2B keyword is NOT a real B2B offering
// e.g., "unauthorized reseller", "dealer locator", "distributor of products"
const B2B_FALSE_POSITIVE_CONTEXT = [
  'unauthorized', 'not authorized', 'beware of',
  'locate a dealer', 'find a dealer', 'dealer locator',
  'authorized distributor', 'official distributor',
  'reseller restrictions', 'resale prohibited',
];

/**
 * Scan text/URL for B2B/Wholesale indicators
 * Filters out false positives from footer/legal text
 */
export function detectB2B(text: string, url: string): { detected: boolean; evidence: string[] } {
  const evidence: string[] = [];
  const lowerText = text.toLowerCase();
  const lowerUrl = url.toLowerCase();
  
  // Check URL first (most reliable)
  for (const keyword of [...B2B_STRONG_KEYWORDS, ...B2B_WEAK_KEYWORDS]) {
    if (lowerUrl.includes(keyword.replace(/\s+/g, '-')) || lowerUrl.includes(keyword.replace(/\s+/g, ''))) {
      evidence.push(keyword);
    }
  }
  
  // Check strong keywords in text (always add)
  for (const keyword of B2B_STRONG_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      evidence.push(keyword);
    }
  }
  
  // Check weak keywords with context filtering
  for (const keyword of B2B_WEAK_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      // Find the context around the keyword
      const index = lowerText.indexOf(keyword);
      const contextStart = Math.max(0, index - 100);
      const contextEnd = Math.min(lowerText.length, index + keyword.length + 100);
      const context = lowerText.slice(contextStart, contextEnd);
      
      // Skip if false positive context detected
      const isFalsePositive = B2B_FALSE_POSITIVE_CONTEXT.some(fp => context.includes(fp));
      if (!isFalsePositive) {
        evidence.push(keyword);
      }
    }
  }
  
  return {
    detected: evidence.length > 0,
    evidence: [...new Set(evidence)], // dedupe
  };
}

// ============ PRODUCT LINK EXTRACTION ============

/**
 * Extract product URLs from page content (for PDP discovery)
 */
export function extractProductLinks(html: string, baseUrl: string): string[] {
  const productLinks: string[] = [];
  const domain = new URL(baseUrl).origin;
  
  // Common Shopify product URL patterns
  const patterns = [
    /href=["']([^"']*\/products\/[^"'#?]+)/gi,
    /href=["']([^"']*\/p\/[^"'#?]+)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];
      
      // Make absolute if relative
      if (url.startsWith('/')) {
        url = domain + url;
      } else if (!url.startsWith('http')) {
        url = domain + '/' + url;
      }
      
      // Skip duplicates and variant URLs
      if (!productLinks.includes(url) && !url.includes('?variant=')) {
        productLinks.push(url);
      }
    }
  }
  
  // Return first 5 unique products (don't want to scrape too many)
  return productLinks.slice(0, 5);
}
