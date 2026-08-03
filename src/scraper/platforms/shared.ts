import type { CrawlTarget, CrawlTargetType, KnownPlatform } from '../types.js';

export interface LinkClassifier {
  pattern: RegExp;
  type: CrawlTargetType;
  priority: number;
}

export interface TextClassifier {
  pattern: RegExp;
  type: CrawlTargetType;
  priority?: number;
}

export interface PlatformProfile {
  id: KnownPlatform;
  label: string;
  fallbackPaths: Array<{ path: string; type: CrawlTargetType }>;
  linkClassifiers: LinkClassifier[];
  productUrlPatterns: RegExp[];
  productUrlScorePatterns: Array<{ pattern: RegExp; score: number }>;
  productDiscoveryPaths: string[];
  addToCartSelectors: string[];
  checkoutButtonSelectors: string[];
  cartPaths: string[];
  checkoutPaths: string[];
  checkoutUrlPatterns: RegExp[];
  checkoutContentPatterns: RegExp[];
  notes: string;
}

export const SHARED_LINK_CLASSIFIERS: LinkClassifier[] = [
  { pattern: /\/(pages?\/)?(policies?|terms|privacy|refund|returns?|shipping|exchange|warranty|guarantee)/i, type: 'policy', priority: 10 },
  { pattern: /\/(pages?\/)?(delivery|returns?-policy|shipping-policy|refund-policy)/i, type: 'policy', priority: 10 },
  { pattern: /\/(pages?\/)?(customer-service|help-center|support)/i, type: 'other', priority: 8 },
  { pattern: /\/(pages?\/)?(faq|faqs|help|contact|contact-us)/i, type: 'other', priority: 7 },
  { pattern: /\/(info|information)\/(shipping|returns|delivery)/i, type: 'policy', priority: 9 },
  { pattern: /\/help\/(shipping|returns|orders|payments)/i, type: 'policy', priority: 9 },
  { pattern: /\/(pages?\/)?(rewards?|loyalty|points|vip|member|referr?als?|perks)/i, type: 'rewards', priority: 10 },
  { pattern: /\/(pages?\/)?(refer-a-friend|ambassador|affiliate)/i, type: 'rewards', priority: 8 },
  { pattern: /\/brands?\//i, type: 'collection', priority: 7 },
  { pattern: /\/(cart|bag|basket)$/i, type: 'cart', priority: 6 },
  { pattern: /\/checkout/i, type: 'checkout', priority: 6 },
];

export const SHARED_TEXT_CLASSIFIERS: TextClassifier[] = [
  { pattern: /^(shipping|delivery)\s*(policy|info|information)?$/i, type: 'policy' },
  { pattern: /^return(s)?\s*((&|and)\s*exchange(s)?)?(\s*policy)?$/i, type: 'policy' },
  { pattern: /^refund\s*(policy)?$/i, type: 'policy' },
  { pattern: /^(terms|privacy|legal)/i, type: 'policy' },
  { pattern: /^(rewards?|loyalty|points|vip|perks)/i, type: 'rewards' },
  { pattern: /^(faq|help|support|contact)/i, type: 'other' },
  { pattern: /^(wholesale|trade|b2b)/i, type: 'other' },
  { pattern: /^(about|our\s*story)/i, type: 'other' },
  { pattern: /^(shop\s*all|all\s*products|collections?|category|products?)/i, type: 'collection' },
];

const STORE_LOCATION_PATH_PATTERNS = [
  /\/(stores?|locations?)\/[^/]+/i,
  /\/(store-locator|find-a-store|store-finder)(\/|$)/i,
];

export function isPhysicalStoreLocationPath(path: string): boolean {
  return STORE_LOCATION_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/** SFCC Demandware action endpoints that are not useful crawl/WA targets. */
const LOW_VALUE_COMMERCE_CLOUD_ACTION_PATTERNS = [
  /Wishlist-(?:Add|Show|Remove)/i,
  /Compare-(?:AddProduct|Show)/i,
  /Product-ShowQuickView/i,
  /Search-ShowAjax/i,
  /Account-(?:Show|Login|Start|EditProfile)/i,
  /Login-Show/i,
  /Order-(?:Track|History)/i,
  /COCustomer-(?:Add|Edit)/i,
];

export function isLowValueCommerceCloudActionUrl(urlOrPath: string): boolean {
  return LOW_VALUE_COMMERCE_CLOUD_ACTION_PATTERNS.some((pattern) => pattern.test(urlOrPath));
}

export const SHARED_ADD_TO_CART_SELECTORS = [
  'button:has-text("Add to cart")',
  'button:has-text("Add to Cart")',
  'button:has-text("ADD TO CART")',
  'button:has-text("Add to bag")',
  'button:has-text("Add to Bag")',
  'button:has-text("ADD TO BAG")',
  'button:has-text("Buy now")',
  'button:has-text("Buy Now")',
  'button:has-text("Add")',
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
  'button[aria-label*="Add to cart"]',
  'button[aria-label*="Add to bag"]',
];

export const SHARED_CHECKOUT_BUTTON_SELECTORS = [
  'a[href*="/checkout"]',
  'button:has-text("Checkout")',
  'button:has-text("Check out")',
  'button:has-text("Proceed to checkout")',
  'button:has-text("Proceed to Checkout")',
  'button:has-text("Secure checkout")',
  'button:has-text("Secure Checkout")',
  '.checkout-button',
  '#checkout',
  '[data-checkout-button]',
  '[class*="checkout"]',
];

export const SHARED_CHECKOUT_CONTENT_PATTERNS = [
  /contact\s+information/i,
  /shipping\s+address/i,
  /shipping\s+method/i,
  /delivery/i,
  /billing\s+address/i,
  /payment/i,
  /complete\s+order/i,
  /place\s+order/i,
  /review\s+and\s+pay/i,
  /return\s+to\s+cart/i,
];

export function buildFallbackTargets(seedUrl: string, profile: PlatformProfile): CrawlTarget[] {
  const base = seedUrl.replace(/\/$/, '');
  return [
    { url: base, type: 'home', source: 'fallback' },
    ...profile.fallbackPaths.map((target) => ({
      url: `${base}${target.path}`,
      type: target.type,
      source: `${profile.id}-fallback`,
    })),
  ];
}
