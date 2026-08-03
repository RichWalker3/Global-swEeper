import type { PlatformProfile } from './shared.js';
import {
  SHARED_ADD_TO_CART_SELECTORS,
  SHARED_CHECKOUT_BUTTON_SELECTORS,
  SHARED_CHECKOUT_CONTENT_PATTERNS,
  SHARED_LINK_CLASSIFIERS,
} from './shared.js';

export const sfccProfile: PlatformProfile = {
  id: 'sfcc',
  label: 'SFCC',
  fallbackPaths: [
    { path: '/sitemap', type: 'other' },
    { path: '/search', type: 'collection' },
    { path: '/Search-Show', type: 'collection' },
    { path: '/shop', type: 'collection' },
    { path: '/category', type: 'collection' },
    { path: '/cart', type: 'cart' },
    { path: '/Cart-Show', type: 'cart' },
    { path: '/checkout', type: 'checkout' },
    { path: '/Checkout-Begin', type: 'checkout' },
    { path: '/CustomerService-ContactUs', type: 'other' },
    { path: '/shipping', type: 'policy' },
    { path: '/returns', type: 'policy' },
    { path: '/faq', type: 'other' },
  ],
  linkClassifiers: [
    ...SHARED_LINK_CLASSIFIERS,
    { pattern: /\/(c|category|categories|search|Search-Show)\b/i, type: 'collection', priority: 8 },
    { pattern: /\/(Cart-Show|cart)\b/i, type: 'cart', priority: 8 },
    { pattern: /\/(Checkout-Begin|COShipping|COBilling|checkout)\b/i, type: 'checkout', priority: 8 },
    { pattern: /\/(Product-Show|p|product)\b/i, type: 'pdp', priority: 5 },
    { pattern: /\/[a-z0-9-]+\/[a-z0-9-]*\d[a-z0-9-]*\.html(?:\?|$)/i, type: 'pdp', priority: 5 },
  ],
  productUrlPatterns: [
    /href=["']([^"']*(?:Product-Show|\/p\/|\/product\/)[^"'#]+)/gi,
    /href=["']([^"']*\?pid=[^"'#]+)/gi,
    /href=["']([^"']*\/[a-z0-9-]+\/[a-z0-9-]*\d[a-z0-9-]*\.html(?:\?[^"']*)?)["']/gi,
  ],
  productUrlScorePatterns: [
    { pattern: /Product-Show/i, score: 10 },
    { pattern: /[?&]pid=/i, score: 9 },
    { pattern: /\/p\/[^/?#]+/i, score: 7 },
    { pattern: /\/product\/[^/?#]+/i, score: 7 },
    { pattern: /\/[a-z0-9-]+\/[a-z0-9-]*\d[a-z0-9-]*\.html(?:\?|$)/i, score: 7 },
  ],
  productDiscoveryPaths: ['/', '/Search-Show', '/search', '/shop', '/category'],
  addToCartSelectors: [
    'button.add-to-cart',
    '[data-action*="AddToCart"]',
    '[data-url*="Cart-AddProduct"]',
    'form[action*="Cart-AddProduct"] button[type="submit"]',
    // Prefer exact controls; skip SHARED `[class*="add-to-cart"]` / bare "Add" (false hits on Genesco).
    ...SHARED_ADD_TO_CART_SELECTORS.filter(
      (selector) =>
        selector !== 'button:has-text("Add")' &&
        !selector.includes('[class*="add-to-cart"]') &&
        !selector.includes('[class*="addToCart"]')
    ),
  ],
  checkoutButtonSelectors: [
    'a[href*="Checkout-Begin"]',
    'a[href*="COShipping"]',
    'a[href*="Checkout-Start"]',
    'button[name*="checkout" i]',
    'input[name*="checkout" i]',
    'button[id*="checkout" i]',
    'input[id*="checkout" i]',
    ...SHARED_CHECKOUT_BUTTON_SELECTORS,
  ],
  cartPaths: ['/Cart-Show', '/cart'],
  checkoutPaths: ['/Checkout-Begin', '/COShipping-Start', '/checkout'],
  checkoutUrlPatterns: [/Checkout-Begin/i, /COShipping/i, /COBilling/i, /\/checkout\b/i],
  checkoutContentPatterns: [...SHARED_CHECKOUT_CONTENT_PATTERNS, /demandware/i, /secure checkout/i],
  notes: 'SFCC profile targets Demandware/SFCC route patterns while keeping checkout attempts conservative.',
};
