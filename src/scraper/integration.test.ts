/**
 * Integration tests - test full extraction pipeline against HTML fixtures
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import extractors
import { detectThirdParty, scanForDangerousGoods, detectB2B, extractProductLinks } from './detectors.js';
import { extractPolicyInfo } from './policyExtractor.js';
import { detectBundles, detectCustomizableProducts, detectSubscriptions, detectPreOrders, detectBNPLWidgets } from './catalogDetector.js';
import { tagPage } from '../prefilter/tagger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '__fixtures__', 'shopify-store');

interface Fixtures {
  homeHtml: string;
  homeText: string;
  returnsPolicyHtml: string;
  returnsPolicyText: string;
  productHtml: string;
  productText: string;
  expected: {
    home: { thirdParties: string[]; subscriptions: { detected: boolean }; categories: string[] };
    returnsPolicy: { policy: { returnWindow: string; returnFees: string[]; returnProvider: string } };
    product: { thirdParties: string[]; dangerousGoods: { category: string; risk: string }[]; catalog: { bundlesDetected: boolean; customizableProducts: boolean; customizationTypes: string[]; subscriptionsDetected: boolean; preOrdersDetected: boolean }; bnpl: { providers: string[] } };
  };
}

let fixtures: Fixtures;

function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

beforeAll(() => {
  fixtures = {
    homeHtml: readFileSync(join(fixturesDir, 'home.html'), 'utf-8'),
    homeText: extractText(readFileSync(join(fixturesDir, 'home.html'), 'utf-8')),
    returnsPolicyHtml: readFileSync(join(fixturesDir, 'returns-policy.html'), 'utf-8'),
    returnsPolicyText: extractText(readFileSync(join(fixturesDir, 'returns-policy.html'), 'utf-8')),
    productHtml: readFileSync(join(fixturesDir, 'product.html'), 'utf-8'),
    productText: extractText(readFileSync(join(fixturesDir, 'product.html'), 'utf-8')),
    expected: JSON.parse(readFileSync(join(fixturesDir, 'expected.json'), 'utf-8')),
  };
});

describe('Integration: Home Page', () => {
  it('detects third-party scripts from HTML', () => {
    const scripts = fixtures.homeHtml.match(/src="([^"]+)"/g) || [];
    const detected = new Set<string>();
    
    for (const script of scripts) {
      const url = script.replace('src="', '').replace('"', '');
      const thirdParty = detectThirdParty(url);
      if (thirdParty) detected.add(thirdParty);
    }
    
    for (const expected of fixtures.expected.home.thirdParties) {
      expect(detected.has(expected)).toBe(true);
    }
  });

  it('detects subscription signals', () => {
    const subs = detectSubscriptions(fixtures.homeText, fixtures.homeHtml, []);
    expect(subs.detected).toBe(fixtures.expected.home.subscriptions.detected);
  });

  it('tags page with correct categories', () => {
    const result = tagPage(fixtures.homeText, 'https://example.com/', 'Test Store - Home');
    expect(result.categories).toContain('shipping');
  });

  it('extracts product links from collection-like content', () => {
    const links = extractProductLinks(fixtures.homeHtml, 'https://example.com');
    expect(links.length).toBeGreaterThan(0);
    expect(links.some(l => l.includes('/products/'))).toBe(true);
  });
});

describe('Integration: Returns Policy Page', () => {
  it('extracts return window', () => {
    const policy = extractPolicyInfo(fixtures.returnsPolicyText);
    expect(policy.returnWindow).toBe(fixtures.expected.returnsPolicy.policy.returnWindow);
  });

  it('extracts return fees', () => {
    const policy = extractPolicyInfo(fixtures.returnsPolicyText);
    expect(policy.returnFees).toBeDefined();
    expect(policy.returnFees?.some(f => f.includes('Happy Returns'))).toBe(true);
    expect(policy.returnFees?.some(f => f.includes('mailback'))).toBe(true);
  });

  it('detects final sale mention', () => {
    const policy = extractPolicyInfo(fixtures.returnsPolicyText);
    expect(policy.finalSaleItems).toBeDefined();
    expect(policy.finalSaleItems!.length).toBeGreaterThan(0);
  });

  it('detects return provider', () => {
    const policy = extractPolicyInfo(fixtures.returnsPolicyText);
    expect(policy.returnProvider).toBe(fixtures.expected.returnsPolicy.policy.returnProvider);
  });

  it('tags page with returns category', () => {
    const result = tagPage(fixtures.returnsPolicyText, 'https://example.com/policies/refund-policy', 'Returns Policy');
    expect(result.categories).toContain('returns');
  });
});

describe('Integration: Product Page', () => {
  it('detects third-party scripts', () => {
    const scripts = fixtures.productHtml.match(/src="([^"]+)"/g) || [];
    const detected = new Set<string>();
    
    for (const script of scripts) {
      const url = script.replace('src="', '').replace('"', '');
      const thirdParty = detectThirdParty(url);
      if (thirdParty) detected.add(thirdParty);
    }
    
    for (const expected of fixtures.expected.product.thirdParties) {
      expect(detected.has(expected)).toBe(true);
    }
  });

  it('detects dangerous goods (fragrance)', () => {
    const dgMatches = scanForDangerousGoods(fixtures.productText);
    expect(dgMatches.some(m => m.category === 'fragrance')).toBe(true);
  });

  it('detects dangerous goods (aerosol/hairspray)', () => {
    const dgMatches = scanForDangerousGoods(fixtures.productText);
    expect(dgMatches.some(m => m.category === 'aerosol')).toBe(true);
  });

  it('detects bundles', () => {
    const bundles = detectBundles(fixtures.productText, 'https://example.com/products/premium-set');
    expect(bundles.detected).toBe(fixtures.expected.product.catalog.bundlesDetected);
  });

  it('detects customizable products (engraving)', () => {
    const custom = detectCustomizableProducts(fixtures.productText, fixtures.productHtml);
    expect(custom.detected).toBe(fixtures.expected.product.catalog.customizableProducts);
    expect(custom.types).toContain('engraving');
  });

  it('detects subscriptions', () => {
    const subs = detectSubscriptions(fixtures.productText, fixtures.productHtml, []);
    expect(subs.detected).toBe(fixtures.expected.product.catalog.subscriptionsDetected);
  });

  it('detects pre-orders', () => {
    const preOrders = detectPreOrders(fixtures.productText, fixtures.productHtml);
    expect(preOrders.detected).toBe(fixtures.expected.product.catalog.preOrdersDetected);
  });

  it('detects BNPL widgets', () => {
    const bnpl = detectBNPLWidgets(fixtures.productText, fixtures.productHtml);
    expect(bnpl.detected).toBe(true);
    for (const provider of fixtures.expected.product.bnpl.providers) {
      expect(bnpl.providers).toContain(provider);
    }
  });

  it('tags page as PDP', () => {
    const result = tagPage(fixtures.productText, 'https://example.com/products/premium-perfume', 'Premium Perfume Set');
    expect(result.categories).toContain('pdp');
  });
});

describe('Integration: B2B Detection', () => {
  it('detects wholesale indicator from home page', () => {
    const b2b = detectB2B(fixtures.homeText, 'https://example.com/');
    expect(b2b.detected).toBe(true);
    expect(b2b.evidence.some(e => e.includes('wholesale'))).toBe(true);
  });
});

describe('Integration: Full Pipeline Smoke Test', () => {
  it('processes all pages without errors', () => {
    // Home
    expect(() => {
      tagPage(fixtures.homeText, 'https://example.com/', 'Home');
      detectSubscriptions(fixtures.homeText, fixtures.homeHtml, []);
    }).not.toThrow();

    // Returns
    expect(() => {
      extractPolicyInfo(fixtures.returnsPolicyText);
      tagPage(fixtures.returnsPolicyText, 'https://example.com/policies/refund-policy', 'Returns');
    }).not.toThrow();

    // Product
    expect(() => {
      scanForDangerousGoods(fixtures.productText);
      detectBundles(fixtures.productText, 'https://example.com/products/test');
      detectCustomizableProducts(fixtures.productText, fixtures.productHtml);
      detectSubscriptions(fixtures.productText, fixtures.productHtml, []);
      detectPreOrders(fixtures.productText, fixtures.productHtml);
      detectBNPLWidgets(fixtures.productText, fixtures.productHtml);
    }).not.toThrow();
  });
});
