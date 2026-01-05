/**
 * Third-party detection from network requests and page content
 */

interface ThirdPartyPattern {
  name: string;
  patterns: RegExp[];
  category: string;
}

const THIRD_PARTY_PATTERNS: ThirdPartyPattern[] = [
  // Returns
  { name: 'ReturnGO', patterns: [/returngo\.ai/i, /returnsportal\.returngo/i], category: 'returns' },
  { name: 'Loop Returns', patterns: [/loopreturns\.com/i], category: 'returns' },
  { name: 'Narvar', patterns: [/narvar\.com/i], category: 'returns' },
  { name: 'Happy Returns', patterns: [/happyreturns\.com/i], category: 'returns' },

  // Subscriptions
  { name: 'Recharge', patterns: [/rechargepayments\.com/i, /rechargeapps\.com/i], category: 'subscriptions' },
  { name: 'Bold Subscriptions', patterns: [/boldapps\.net/i, /boldcommerce\.com/i], category: 'subscriptions' },
  { name: 'Skio', patterns: [/skio\.com/i], category: 'subscriptions' },

  // Loyalty
  { name: 'Smile.io', patterns: [/smile\.io/i, /sweettoothrewards/i], category: 'loyalty' },
  { name: 'LoyaltyLion', patterns: [/loyaltylion\.com/i], category: 'loyalty' },
  { name: 'Yotpo', patterns: [/yotpo\.com/i, /staticw2\.yotpo/i], category: 'loyalty' },

  // Reviews
  { name: 'Stamped', patterns: [/stamped\.io/i], category: 'reviews' },
  { name: 'Judge.me', patterns: [/judge\.me/i], category: 'reviews' },
  { name: 'Okendo', patterns: [/okendo\.io/i], category: 'reviews' },

  // Email/SMS
  { name: 'Klaviyo', patterns: [/klaviyo\.com/i, /a\.]klaviyo/i], category: 'email' },
  { name: 'Attentive', patterns: [/attentivemobile\.com/i, /attn\.tv/i], category: 'sms' },
  { name: 'Postscript', patterns: [/postscript\.io/i], category: 'sms' },

  // Gift Cards
  { name: 'Rise.ai', patterns: [/rise-ai\.com/i, /riseai\.co/i], category: 'gift_cards' },
  { name: 'Govalo', patterns: [/govalo\.com/i], category: 'gift_cards' },

  // Personalization
  { name: 'Nosto', patterns: [/nosto\.com/i], category: 'personalization' },
  { name: 'Dynamic Yield', patterns: [/dynamicyield\.com/i], category: 'personalization' },
  { name: 'Rebuy', patterns: [/rebuyengine\.com/i], category: 'personalization' },

  // Search
  { name: 'Algolia', patterns: [/algolia\.net/i, /algolia\.com/i], category: 'search' },
  { name: 'Searchspring', patterns: [/searchspring\.net/i], category: 'search' },
  { name: 'Klevu', patterns: [/klevu\.com/i], category: 'search' },

  // Shipping Protection
  { name: 'Route', patterns: [/route\.com/i, /routeapp\.io/i], category: 'shipping_protection' },
  { name: 'Extend', patterns: [/extend\.com/i], category: 'warranty' },

  // Fraud
  { name: 'Signifyd', patterns: [/signifyd\.com/i], category: 'fraud' },
  { name: 'Riskified', patterns: [/riskified\.com/i], category: 'fraud' },

  // Analytics
  { name: 'Google Analytics', patterns: [/google-analytics\.com/i, /googletagmanager\.com/i], category: 'analytics' },
  { name: 'Segment', patterns: [/segment\.io/i, /segment\.com/i], category: 'analytics' },

  // Cross-border (competitors/related)
  { name: 'Global-e', patterns: [/global-e\.com/i, /globale\.com/i, /ge-scripts/i], category: 'cross_border' },
  { name: 'Reach', patterns: [/withreach\.com/i], category: 'cross_border' },
  { name: 'Flow Commerce', patterns: [/flow\.io/i], category: 'cross_border' },

  // Payments
  { name: 'Klarna', patterns: [/klarna\.com/i, /klarna-payments/i], category: 'bnpl' },
  { name: 'Afterpay', patterns: [/afterpay\.com/i, /afterpay-js/i], category: 'bnpl' },
  { name: 'Affirm', patterns: [/affirm\.com/i], category: 'bnpl' },
  { name: 'Sezzle', patterns: [/sezzle\.com/i], category: 'bnpl' },

  // Tracking
  { name: 'AfterShip', patterns: [/aftership\.com/i], category: 'tracking' },
  { name: 'Malomo', patterns: [/gomalomo\.com/i], category: 'tracking' },
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

