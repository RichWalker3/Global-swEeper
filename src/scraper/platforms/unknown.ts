import type { PlatformProfile } from './shared.js';
import {
  SHARED_ADD_TO_CART_SELECTORS,
  SHARED_CHECKOUT_BUTTON_SELECTORS,
  SHARED_CHECKOUT_CONTENT_PATTERNS,
  SHARED_LINK_CLASSIFIERS,
} from './shared.js';

export const unknownProfile: PlatformProfile = {
  id: 'unknown',
  label: 'Unknown',
  fallbackPaths: [
    { path: '/shop', type: 'collection' },
    { path: '/products', type: 'collection' },
    { path: '/category', type: 'collection' },
    { path: '/cart', type: 'cart' },
    { path: '/checkout', type: 'checkout' },
    { path: '/shipping', type: 'policy' },
    { path: '/returns', type: 'policy' },
    { path: '/faq', type: 'other' },
    { path: '/help', type: 'other' },
  ],
  linkClassifiers: [
    ...SHARED_LINK_CLASSIFIERS,
    { pattern: /\/(shop|products?|category|categories|catalog|collections?)\b/i, type: 'collection', priority: 6 },
    { pattern: /\/(products?|p|product)\/[^/]+/i, type: 'pdp', priority: 4 },
  ],
  productUrlPatterns: [
    /href=["']([^"']*\/(?:products?|p|product)\/[^"'#?]+)/gi,
  ],
  productUrlScorePatterns: [
    { pattern: /\/products?\/[^/?#]+/i, score: 7 },
    { pattern: /\/p\/[^/?#]+/i, score: 6 },
    { pattern: /\/product\/[^/?#]+/i, score: 6 },
  ],
  productDiscoveryPaths: ['/', '/shop', '/products', '/category', '/catalog'],
  addToCartSelectors: [...SHARED_ADD_TO_CART_SELECTORS],
  checkoutButtonSelectors: [...SHARED_CHECKOUT_BUTTON_SELECTORS],
  cartPaths: ['/cart', '/bag', '/basket'],
  checkoutPaths: ['/checkout'],
  checkoutUrlPatterns: [/\/checkout\b/i],
  checkoutContentPatterns: [...SHARED_CHECKOUT_CONTENT_PATTERNS],
  notes: 'Unknown profile uses safe generic ecommerce discovery and checkout patterns.',
};
