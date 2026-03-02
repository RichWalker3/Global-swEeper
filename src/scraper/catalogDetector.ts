/**
 * Catalog & Product Detection
 * Detects bundles, subscriptions, pre-orders, customizable products, etc.
 */

export interface CatalogFeatures {
  // Bundles/Kits
  bundlesDetected: boolean;
  bundleEvidence: string[];
  
  // Customizable Products
  customizableProducts: boolean;
  customizationTypes: string[]; // e.g., "engraving", "monogram", "build-your-own"
  customizationEvidence: string[];
  
  // Virtual/Digital Products (NOT including gift cards)
  virtualProducts: boolean;
  virtualProductTypes: string[]; // e.g., "download", "membership", "ebook"
  virtualProductEvidence: string[];
  
  // Gift Cards (separate from virtual products)
  giftCardsDetected: boolean;
  giftCardTypes: string[]; // e.g., "e-gift-card", "physical-gift-card"
  giftCardEvidence: string[];
  
  // Subscriptions
  subscriptionsDetected: boolean;
  subscriptionProvider?: string;
  subscriptionEvidence: string[];
  
  // Pre-orders
  preOrdersDetected: boolean;
  preOrderEvidence: string[];
  
  // Gift With Purchase
  gwpDetected: boolean;
  gwpEvidence: string[];
}

export interface LoyaltyInfo {
  detected: boolean;
  programName?: string;
  provider?: string;
  evidence: string[];
}

export interface LocalizationInfo {
  // Geo/Country selector
  countrySelector: boolean;
  countrySelectorEvidence: string[];
  
  // Languages
  multiLanguage: boolean;
  languagesDetected: string[];
  languageEvidence: string[];
  
  // Currency
  multiCurrency: boolean;
  currenciesDetected: string[];
  currencyEvidence: string[];
}

export interface MarketplaceInfo {
  detected: boolean;
  marketplaces: string[]; // e.g., "Amazon", "eBay", "Faire", "J.Crew"
  evidence: string[];
}

// ============ BUNDLE DETECTION ============

const BUNDLE_PATTERNS = [
  /bundle/i,
  /kit\b/i,
  /set\b/i,
  /collection\b/i,
  /starter\s*pack/i,
  /value\s*pack/i,
  /combo/i,
  /duo\b/i,
  /trio\b/i,
  /build\s*your\s*(own\s*)?(box|bundle|set)/i,
  /mix\s*(&|and)\s*match/i,
  /save\s*when\s*you\s*buy/i,
  /buy\s*together/i,
  /frequently\s*bought\s*together/i,
];

export function detectBundles(text: string, url: string): { detected: boolean; evidence: string[] } {
  const evidence: string[] = [];
  const lowerUrl = url.toLowerCase();
  
  // Check URL for bundle indicators
  if (/bundle|kit|set|combo|pack/.test(lowerUrl)) {
    evidence.push(`Bundle URL pattern: ${url}`);
  }
  
  // Check page content
  for (const pattern of BUNDLE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Get context around match
      const index = text.toLowerCase().indexOf(match[0].toLowerCase());
      const start = Math.max(0, index - 30);
      const end = Math.min(text.length, index + match[0].length + 50);
      const context = text.slice(start, end).replace(/\s+/g, ' ').trim();
      if (!evidence.some(e => e.includes(match[0]))) {
        evidence.push(`"${context}"`);
      }
    }
  }
  
  return { detected: evidence.length > 0, evidence: evidence.slice(0, 3) };
}

// ============ CUSTOMIZABLE PRODUCT DETECTION ============

const CUSTOMIZATION_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /engrav(e|ing|ed)/i, type: 'engraving' },
  { pattern: /monogram/i, type: 'monogram' },
  { pattern: /personali[sz](e|ation|ed)/i, type: 'personalization' },
  { pattern: /custom(i[sz]e|ization)?/i, type: 'customization' },
  { pattern: /build\s*your\s*own/i, type: 'build-your-own' },
  { pattern: /configure|configurator/i, type: 'configurator' },
  { pattern: /made\s*to\s*order/i, type: 'made-to-order' },
  { pattern: /bespoke/i, type: 'bespoke' },
  { pattern: /add\s*(your|a)\s*(name|initials|text|message)/i, type: 'text-personalization' },
  { pattern: /choose\s*your\s*(color|size|style|design)/i, type: 'configurator' },
];

export function detectCustomizableProducts(text: string, html: string): { detected: boolean; types: string[]; evidence: string[] } {
  const types = new Set<string>();
  const evidence: string[] = [];
  
  for (const { pattern, type } of CUSTOMIZATION_PATTERNS) {
    if (pattern.test(text) || pattern.test(html)) {
      types.add(type);
      const match = text.match(pattern) || html.match(pattern);
      if (match) {
        evidence.push(`${type}: "${match[0]}"`);
      }
    }
  }
  
  // Check for customization form elements
  if (/<input[^>]*(?:engrav|monogram|personali|custom)/i.test(html)) {
    types.add('form-input');
    evidence.push('Customization input field detected');
  }
  
  return {
    detected: types.size > 0,
    types: Array.from(types),
    evidence: evidence.slice(0, 3),
  };
}

// ============ VIRTUAL/DIGITAL PRODUCT DETECTION ============
// NOTE: Gift cards are detected separately - see detectGiftCards()

const VIRTUAL_PRODUCT_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /download(able)?/i, type: 'download' },
  { pattern: /digital\s*(download|product|item)/i, type: 'digital-product' },
  { pattern: /e-?book/i, type: 'ebook' },
  { pattern: /membership/i, type: 'membership' },
  { pattern: /subscription\s*box/i, type: 'subscription-box' },
  { pattern: /virtual\s*(class|event|session|consultation)/i, type: 'virtual-service' },
  { pattern: /online\s*(class|course|workshop)/i, type: 'online-course' },
  { pattern: /pdf\s*(download|guide|template)/i, type: 'pdf' },
  { pattern: /digital\s*access/i, type: 'digital-access' },
];

export function detectVirtualProducts(text: string, url: string): { detected: boolean; types: string[]; evidence: string[] } {
  const types = new Set<string>();
  const evidence: string[] = [];
  const lowerUrl = url.toLowerCase();
  
  // Check URL for virtual product indicators (but NOT gift cards)
  if (/download|digital|ebook|virtual|membership/i.test(lowerUrl) && !/gift/i.test(lowerUrl)) {
    evidence.push(`Virtual product URL: ${url}`);
  }
  
  for (const { pattern, type } of VIRTUAL_PRODUCT_PATTERNS) {
    if (pattern.test(text)) {
      types.add(type);
      const match = text.match(pattern);
      if (match) {
        evidence.push(`${type}: "${match[0]}"`);
      }
    }
  }
  
  return {
    detected: types.size > 0,
    types: Array.from(types),
    evidence: evidence.slice(0, 3),
  };
}

// ============ GIFT CARD DETECTION ============

const GIFT_CARD_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /e-?gift\s*card/i, type: 'e-gift-card' },
  { pattern: /digital\s*gift\s*card/i, type: 'e-gift-card' },
  { pattern: /virtual\s*gift\s*card/i, type: 'e-gift-card' },
  { pattern: /gift\s*card/i, type: 'gift-card' },
  { pattern: /gift\s*certificate/i, type: 'gift-certificate' },
  { pattern: /store\s*credit/i, type: 'store-credit' },
];

export function detectGiftCards(text: string, url: string): { detected: boolean; types: string[]; evidence: string[] } {
  const types = new Set<string>();
  const evidence: string[] = [];
  const lowerUrl = url.toLowerCase();
  
  // Check URL for gift card indicators
  if (/gift-?card|e-?gift|giftcard/i.test(lowerUrl)) {
    types.add('e-gift-card');
    evidence.push(`Gift card URL: ${url}`);
  }
  
  for (const { pattern, type } of GIFT_CARD_PATTERNS) {
    if (pattern.test(text)) {
      types.add(type);
      const match = text.match(pattern);
      if (match) {
        evidence.push(`${type}: "${match[0]}"`);
      }
    }
  }
  
  return {
    detected: types.size > 0,
    types: Array.from(types),
    evidence: evidence.slice(0, 3),
  };
}

// ============ SUBSCRIPTION DETECTION ============

const SUBSCRIPTION_PATTERNS = [
  /subscribe\s*(&|and)?\s*save/i,
  /subscription/i,
  /recurring\s*(order|delivery|shipment)/i,
  /auto-?(ship|replenish|deliver)/i,
  /delivery\s*every\s*\d+\s*(day|week|month)/i,
  /get\s*it\s*regularly/i,
  /set\s*(&|and)?\s*forget/i,
  /never\s*run\s*out/i,
];

const SUBSCRIPTION_PROVIDERS: { pattern: RegExp; name: string }[] = [
  { pattern: /recharge/i, name: 'Recharge' },
  { pattern: /bold\s*subscriptions/i, name: 'Bold Subscriptions' },
  { pattern: /skio/i, name: 'Skio' },
  { pattern: /ordergroove/i, name: 'Ordergroove' },
  { pattern: /smartrr/i, name: 'Smartrr' },
  { pattern: /yotpo\s*subscriptions/i, name: 'Yotpo Subscriptions' },
  { pattern: /loop\s*subscriptions/i, name: 'Loop Subscriptions' },
  { pattern: /seal\s*subscriptions/i, name: 'Seal Subscriptions' },
  { pattern: /appstle/i, name: 'Appstle' },
  { pattern: /awtomatic/i, name: 'Awtomatic' },
];

export function detectSubscriptions(text: string, html: string, networkRequests: string[]): { detected: boolean; provider?: string; evidence: string[] } {
  const evidence: string[] = [];
  let provider: string | undefined;
  
  // Check page content
  for (const pattern of SUBSCRIPTION_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) {
        evidence.push(`"${match[0]}"`);
      }
    }
  }
  
  // Check for subscription providers in HTML/network
  const searchContent = html + ' ' + networkRequests.join(' ');
  for (const { pattern, name } of SUBSCRIPTION_PROVIDERS) {
    if (pattern.test(searchContent)) {
      provider = name;
      evidence.push(`Provider: ${name}`);
      break;
    }
  }
  
  return {
    detected: evidence.length > 0,
    provider,
    evidence: evidence.slice(0, 3),
  };
}

// ============ PRE-ORDER DETECTION ============

const PREORDER_PATTERNS = [
  /pre-?order/i,
  /coming\s*soon/i,
  /available\s*(for\s*)?pre-?order/i,
  /ships?\s*(on|by|in)\s*(early\s*)?\w+\s*\d{4}/i,
  /expected\s*(to\s*)?ship/i,
  /back\s*order/i,
  /backorder/i,
  /out\s*of\s*stock.*notify/i,
  /notify\s*(me\s*)?when\s*available/i,
];

export function detectPreOrders(text: string, html: string): { detected: boolean; evidence: string[] } {
  const evidence: string[] = [];
  
  for (const pattern of PREORDER_PATTERNS) {
    if (pattern.test(text) || pattern.test(html)) {
      const match = text.match(pattern) || html.match(pattern);
      if (match) {
        evidence.push(`"${match[0]}"`);
      }
    }
  }
  
  // Check for pre-order buttons/badges
  if (/<[^>]*(?:class|id)[^>]*pre-?order/i.test(html)) {
    evidence.push('Pre-order UI element detected');
  }
  
  return {
    detected: evidence.length > 0,
    evidence: evidence.slice(0, 3),
  };
}

// ============ LOYALTY/REWARDS DETECTION ============

const LOYALTY_PATTERNS = [
  /rewards?\s*(program|points?|member)/i,
  /loyalty\s*(program|points?|member)/i,
  /earn\s*(points?|rewards?)/i,
  /receive\s*\d+\s*points/i,                    // "receive 150 points"
  /points?\s*(balance|earned|program)/i,
  /how\s*to\s*(earn|redeem)\s*points/i,         // "HOW TO EARN POINTS"
  /redeem\s*(your\s*)?points/i,                 // "redeem your points"
  /\d+\s*points\s*(for|=|:)/i,                  // "200 points for $5"
  /vip\s*(program|member|status|tiers?)/i,      // "VIP TIERS"
  /member\s*(perks?|benefits?|rewards?)/i,
  /refer\s*a\s*friend/i,
  /referral\s*(program|bonus|reward)/i,
  /exclusive\s*perks/i,                         // "exclusive perks"
  /points\s*for\s*(each|every)\s*order/i,       // "points for each order"
];

const LOYALTY_PROVIDERS: { pattern: RegExp; name: string }[] = [
  { pattern: /smile\.io|smileio|sweettoothrewards/i, name: 'Smile.io' },
  { pattern: /loyaltylion/i, name: 'LoyaltyLion' },
  { pattern: /yotpo.*loyalty|swell\s*rewards/i, name: 'Yotpo Loyalty' },
  { pattern: /stamped.*loyalty/i, name: 'Stamped Loyalty' },
  { pattern: /rivo/i, name: 'Rivo' },
  { pattern: /growave/i, name: 'Growave' },
  { pattern: /rise\.ai|riseai/i, name: 'Rise.ai' },
  { pattern: /loyalty\s*program\s*by\s*s\s*loyalty/i, name: 'S Loyalty' },
  { pattern: /marsello/i, name: 'Marsello' },
  { pattern: /bon\s*loyalty/i, name: 'BON Loyalty' },
];

export function detectLoyaltyProgram(text: string, html: string, networkRequests: string[]): LoyaltyInfo {
  const evidence: string[] = [];
  let provider: string | undefined;
  let programName: string | undefined;
  
  // Check page content
  for (const pattern of LOYALTY_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) {
        evidence.push(`"${match[0]}"`);
      }
    }
  }
  
  // Check for loyalty providers
  const searchContent = html + ' ' + networkRequests.join(' ');
  for (const { pattern, name } of LOYALTY_PROVIDERS) {
    if (pattern.test(searchContent)) {
      provider = name;
      evidence.push(`Provider: ${name}`);
      break;
    }
  }
  
  // Try to extract program name from various patterns
  const namePatterns = [
    /(?:join|welcome\s*to|introducing)\s*(?:the\s*)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*(?:rewards?|loyalty|program)/i,
    /([A-Z]{2,}(?:\s+[A-Z]{2,})?)\s+LOYALTY\s+PROGRAM/i,  // "ICC LOYALTY PROGRAM"
    /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:rewards?|loyalty)\s+program/i,
  ];
  
  for (const pattern of namePatterns) {
    const nameMatch = text.match(pattern);
    if (nameMatch && nameMatch[1]) {
      programName = nameMatch[1].trim();
      break;
    }
  }
  
  return {
    detected: evidence.length > 0,
    programName,
    provider,
    evidence: evidence.slice(0, 3),
  };
}

// ============ LOCALIZATION DETECTION ============

const COUNTRY_SELECTOR_PATTERNS = [
  /select\s*(your\s*)?(country|region|location)/i,
  /ship(ping)?\s*to/i,
  /deliver(y|ing)?\s*to/i,
  /change\s*(country|region|location)/i,
  /<select[^>]*(?:country|region|location)/i,
];

const LANGUAGE_PATTERNS: { pattern: RegExp; code: string }[] = [
  { pattern: /\blang="en"/i, code: 'en' },
  { pattern: /\blang="fr"/i, code: 'fr' },
  { pattern: /\blang="de"/i, code: 'de' },
  { pattern: /\blang="es"/i, code: 'es' },
  { pattern: /\blang="it"/i, code: 'it' },
  { pattern: /\blang="ja"/i, code: 'ja' },
  { pattern: /\blang="zh"/i, code: 'zh' },
  { pattern: /\blang="ko"/i, code: 'ko' },
  { pattern: /\blang="pt"/i, code: 'pt' },
  { pattern: /\blang="nl"/i, code: 'nl' },
];

const CURRENCY_PATTERNS: { pattern: RegExp; code: string }[] = [
  { pattern: /\$\d+|\bUSD\b/i, code: 'USD' },
  { pattern: /£\d+|\bGBP\b/i, code: 'GBP' },
  { pattern: /€\d+|\bEUR\b/i, code: 'EUR' },
  { pattern: /¥\d+|\bJPY\b|\bCNY\b/i, code: 'JPY/CNY' },
  { pattern: /C\$\d+|\bCAD\b/i, code: 'CAD' },
  { pattern: /A\$\d+|\bAUD\b/i, code: 'AUD' },
];

export function detectLocalization(text: string, html: string): LocalizationInfo {
  const countrySelectorEvidence: string[] = [];
  const languageEvidence: string[] = [];
  const currencyEvidence: string[] = [];
  const languagesDetected: string[] = [];
  const currenciesDetected: string[] = [];
  
  // Check for country selector
  for (const pattern of COUNTRY_SELECTOR_PATTERNS) {
    if (pattern.test(html) || pattern.test(text)) {
      const match = (html.match(pattern) || text.match(pattern));
      if (match) {
        countrySelectorEvidence.push(`"${match[0].slice(0, 50)}"`);
      }
    }
  }
  
  // Check for language switcher / multi-language hints
  if (/language|lang-switcher|translate/i.test(html)) {
    languageEvidence.push('Language switcher element detected');
  }
  
  // Detect languages in HTML
  for (const { pattern, code } of LANGUAGE_PATTERNS) {
    if (pattern.test(html)) {
      languagesDetected.push(code);
    }
  }
  
  // Check for hreflang tags (multi-language indicator)
  const hreflangMatch = html.match(/hreflang="([^"]+)"/g);
  if (hreflangMatch && hreflangMatch.length > 1) {
    languageEvidence.push(`Multiple hreflang tags: ${hreflangMatch.length}`);
  }
  
  // Detect currencies
  for (const { pattern, code } of CURRENCY_PATTERNS) {
    if (pattern.test(text)) {
      if (!currenciesDetected.includes(code)) {
        currenciesDetected.push(code);
      }
    }
  }
  
  // Check for currency selector
  if (/currency|select.*\$|select.*€|select.*£/i.test(html)) {
    currencyEvidence.push('Currency selector detected');
  }
  
  return {
    countrySelector: countrySelectorEvidence.length > 0,
    countrySelectorEvidence: countrySelectorEvidence.slice(0, 2),
    multiLanguage: languagesDetected.length > 1 || languageEvidence.length > 0,
    languagesDetected,
    languageEvidence: languageEvidence.slice(0, 2),
    multiCurrency: currenciesDetected.length > 1 || currencyEvidence.length > 0,
    currenciesDetected,
    currencyEvidence: currencyEvidence.slice(0, 2),
  };
}

// ============ MARKETPLACE DETECTION ============

const MARKETPLACE_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /amazon\.com|sold\s*on\s*amazon/i, name: 'Amazon' },
  { pattern: /ebay\.com|sold\s*on\s*ebay/i, name: 'eBay' },
  { pattern: /faire\.com|sold\s*on\s*faire|wholesale.*faire/i, name: 'Faire' },
  { pattern: /etsy\.com|sold\s*on\s*etsy/i, name: 'Etsy' },
  { pattern: /walmart\.com|sold\s*at\s*walmart/i, name: 'Walmart' },
  { pattern: /target\.com|sold\s*at\s*target/i, name: 'Target' },
  { pattern: /nordstrom|sold\s*at\s*nordstrom/i, name: 'Nordstrom' },
  { pattern: /saks|sold\s*at\s*saks/i, name: 'Saks' },
  { pattern: /bloomingdale|sold\s*at\s*bloomingdale/i, name: 'Bloomingdales' },
  { pattern: /macy|sold\s*at\s*macy/i, name: "Macy's" },
  { pattern: /j\.?crew|sold\s*at\s*j\.?crew/i, name: 'J.Crew' },
  { pattern: /madewell/i, name: 'Madewell' },
  { pattern: /anthropologie/i, name: 'Anthropologie' },
  { pattern: /neiman\s*marcus/i, name: 'Neiman Marcus' },
  { pattern: /shopbop/i, name: 'Shopbop' },
  { pattern: /revolve/i, name: 'Revolve' },
  { pattern: /asos/i, name: 'ASOS' },
  { pattern: /maisonette/i, name: 'Maisonette' },
];

export function detectMarketplaces(text: string, html: string): MarketplaceInfo {
  const marketplaces = new Set<string>();
  const evidence: string[] = [];
  
  for (const { pattern, name } of MARKETPLACE_PATTERNS) {
    if (pattern.test(text) || pattern.test(html)) {
      marketplaces.add(name);
      const match = text.match(pattern) || html.match(pattern);
      if (match) {
        evidence.push(`${name}: "${match[0].slice(0, 40)}"`);
      }
    }
  }
  
  // Check for "shop our products at" or "find us at" patterns
  if (/(?:shop|find|available)\s*(?:our\s*products\s*)?(?:at|on)/i.test(text)) {
    evidence.push('Marketplace mention pattern detected');
  }
  
  return {
    detected: marketplaces.size > 0,
    marketplaces: Array.from(marketplaces),
    evidence: evidence.slice(0, 5),
  };
}

// ============ BNPL WIDGET DETECTION (Product Page) ============

export interface BNPLWidgetInfo {
  detected: boolean;
  providers: string[];
  evidence: string[];
}

const BNPL_WIDGET_PATTERNS: { pattern: RegExp; provider: string }[] = [
  // Afterpay patterns
  { pattern: /pay\s*in\s*4.*afterpay/i, provider: 'Afterpay' },
  { pattern: /afterpay.*pay\s*in\s*4/i, provider: 'Afterpay' },
  { pattern: /4\s*interest-?free\s*(payments?|installments?).*afterpay/i, provider: 'Afterpay' },
  { pattern: /afterpay\s*available/i, provider: 'Afterpay' },
  { pattern: /or\s*4\s*payments\s*of\s*\$[\d.]+\s*with\s*afterpay/i, provider: 'Afterpay' },
  
  // Klarna patterns
  { pattern: /pay\s*in\s*(3|4).*klarna/i, provider: 'Klarna' },
  { pattern: /klarna.*pay\s*in\s*(3|4)/i, provider: 'Klarna' },
  { pattern: /4\s*interest-?free\s*(payments?|installments?).*klarna/i, provider: 'Klarna' },
  { pattern: /klarna\s*available/i, provider: 'Klarna' },
  { pattern: /pay\s*later\s*with\s*klarna/i, provider: 'Klarna' },
  { pattern: /slice\s*it.*klarna/i, provider: 'Klarna' },
  
  // Affirm patterns
  { pattern: /pay\s*over\s*time.*affirm/i, provider: 'Affirm' },
  { pattern: /affirm.*pay\s*over\s*time/i, provider: 'Affirm' },
  { pattern: /as\s*low\s*as\s*\$[\d.]+\/mo.*affirm/i, provider: 'Affirm' },
  { pattern: /affirm.*as\s*low\s*as/i, provider: 'Affirm' },
  { pattern: /affirm\s*available/i, provider: 'Affirm' },
  { pattern: /starting\s*at\s*\$[\d.]+\/mo.*affirm/i, provider: 'Affirm' },
  { pattern: /monthly\s*payments.*affirm/i, provider: 'Affirm' },
  
  // Sezzle patterns
  { pattern: /pay\s*in\s*4.*sezzle/i, provider: 'Sezzle' },
  { pattern: /sezzle.*pay\s*in\s*4/i, provider: 'Sezzle' },
  { pattern: /sezzle\s*available/i, provider: 'Sezzle' },
  
  // Shop Pay Installments
  { pattern: /shop\s*pay\s*installments/i, provider: 'Shop Pay Installments' },
  { pattern: /4\s*interest-?free\s*payments.*shop\s*pay/i, provider: 'Shop Pay Installments' },
  
  // Generic "pay in 4" with context clues
  { pattern: /pay\s*in\s*4\s*interest-?free/i, provider: 'BNPL (unspecified)' },
  { pattern: /buy\s*now,?\s*pay\s*later/i, provider: 'BNPL (unspecified)' },
  { pattern: /split\s*(?:your\s*)?payment/i, provider: 'BNPL (unspecified)' },
];

export function detectBNPLWidgets(text: string, html: string): BNPLWidgetInfo {
  const providers = new Set<string>();
  const evidence: string[] = [];
  const searchText = text + ' ' + html;
  
  for (const { pattern, provider } of BNPL_WIDGET_PATTERNS) {
    if (pattern.test(searchText)) {
      providers.add(provider);
      const match = searchText.match(pattern);
      if (match && !evidence.some(e => e.includes(provider))) {
        evidence.push(`${provider}: "${match[0].slice(0, 50)}"`);
      }
    }
  }
  
  return {
    detected: providers.size > 0,
    providers: Array.from(providers),
    evidence: evidence.slice(0, 5),
  };
}

// ============ GWP DETECTION ============

const GWP_PATTERNS = [
  /gift\s*with\s*purchase/i,
  /free\s*gift/i,
  /gwp/i,
  /bonus\s*gift/i,
  /complimentary\s*gift/i,
  /spend\s*\$?\d+.*(?:get|receive)\s*(?:a\s*)?free/i,
  /free.*with\s*(?:any\s*)?\$?\d+\s*purchase/i,
];

export function detectGWP(text: string): { detected: boolean; evidence: string[] } {
  const evidence: string[] = [];
  
  for (const pattern of GWP_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) {
        evidence.push(`"${match[0]}"`);
      }
    }
  }
  
  return {
    detected: evidence.length > 0,
    evidence: evidence.slice(0, 3),
  };
}

