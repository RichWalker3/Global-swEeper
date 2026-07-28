import { describe, expect, it } from 'vitest';
import { buildCheckoutProductCandidatesForPlatform, evaluateCheckoutDestination } from '../checkoutTester.js';
import { getFallbackTargets } from '../crawler.js';
import { extractProductLinks } from '../detectors.js';
import { discoverSearchIndexTargets, discoverSitemapTargets } from '../indexedDiscovery.js';
import { buildPrompt } from '../../extractor/prompt.js';
import type { ScrapeResult } from '../types.js';
import { getPlatformProfile, normalizePlatform } from './index.js';

describe('platform profiles', () => {
  it('normalizes platform names from UI and internal labels', () => {
    expect(normalizePlatform('shopify')).toBe('shopify');
    expect(normalizePlatform('Salesforce Commerce Cloud')).toBe('sfcc');
    expect(normalizePlatform('demandware')).toBe('sfcc');
    expect(normalizePlatform('Global-e Module')).toBe('gem');
    expect(normalizePlatform('something else')).toBe('unknown');
  });

  it('keeps Shopify, SFCC, and GEM fallback crawl targets separate', () => {
    const shopifyTargets = getFallbackTargets('https://example.com', 'shopify').map((target) => target.url);
    const sfccTargets = getFallbackTargets('https://example.com', 'sfcc').map((target) => target.url);
    const gemTargets = getFallbackTargets('https://example.com', 'gem').map((target) => target.url);

    expect(shopifyTargets).toContain('https://example.com/collections/all');
    expect(shopifyTargets).not.toContain('https://example.com/Checkout-Begin');

    expect(sfccTargets).toContain('https://example.com/Checkout-Begin');
    expect(sfccTargets).toContain('https://example.com/Cart-Show');
    expect(sfccTargets).not.toContain('https://example.com/collections/all');

    expect(gemTargets).toContain('https://example.com/bag');
    expect(gemTargets).toContain('https://example.com/basket');
    expect(gemTargets).not.toContain('https://example.com/Checkout-Begin');
  });

  it('extracts platform-specific product URLs', () => {
    const html = [
      '<a href="/products/shopify-shirt">Shopify PDP</a>',
      '<a href="/on/demandware.store/Sites-brand-Site/default/Product-Show?pid=ABC123">SFCC PDP</a>',
      '<a href="/US/en/jungle-moc/16256W.html">SFCC locale PDP</a>',
      '<a href="/item/custom-hoodie">GEM PDP</a>',
    ].join('');

    expect(extractProductLinks(html, 'https://merchant.test', 'shopify')).toEqual([
      'https://merchant.test/products/shopify-shirt',
    ]);
    expect(extractProductLinks(html, 'https://merchant.test', 'sfcc')).toEqual([
      'https://merchant.test/on/demandware.store/Sites-brand-Site/default/Product-Show?pid=ABC123',
      'https://merchant.test/US/en/jungle-moc/16256W.html',
    ]);
    expect(extractProductLinks(html, 'https://merchant.test', 'gem')).toEqual(expect.arrayContaining([
      'https://merchant.test/item/custom-hoodie',
    ]));
  });

  it('extractProductLinks remains stable across repeated calls', () => {
    const html = '<a href="/on/demandware.store/Sites-brand-Site/default/Product-Show?pid=ABC123">SFCC PDP</a>';
    const first = extractProductLinks(html, 'https://merchant.test', 'sfcc');
    const second = extractProductLinks(html, 'https://merchant.test', 'sfcc');

    expect(first).toEqual(['https://merchant.test/on/demandware.store/Sites-brand-Site/default/Product-Show?pid=ABC123']);
    expect(second).toEqual(first);
  });

  it('scores checkout product candidates with the selected platform profile', () => {
    const candidates = [
      'https://merchant.test/blog/post',
      'https://merchant.test/p/free-5-piece-complexion-sampler-gwp9349528612',
      'https://merchant.test/on/demandware.store/Sites-brand-Site/default/Product-Show?pid=ABC123',
      'https://merchant.test/products/shopify-shirt',
    ];

    expect(buildCheckoutProductCandidatesForPlatform('https://merchant.test', candidates, 'sfcc')[0]).toContain('Product-Show');
    expect(buildCheckoutProductCandidatesForPlatform('https://merchant.test', candidates, 'shopify')[0]).toContain('/products/');
    expect(buildCheckoutProductCandidatesForPlatform('https://merchant.test', candidates, 'gem')[0]).not.toContain('/p/free-5-piece-complexion-sampler');
  });

  it('filters non-purchasable SFCC checkout candidates such as quick view endpoints', () => {
    const candidates = [
      'https://merchant.test/on/demandware.store/Sites-brand-Site/default/Product-ShowQuickView?pid=SKU123',
      'https://merchant.test/relay-collection/',
      'https://merchant.test/on/demandware.store/Sites-brand-Site/default/Product-Show?pid=SKU999',
    ];

    const filtered = buildCheckoutProductCandidatesForPlatform('https://merchant.test', candidates, 'sfcc');

    expect(filtered).toEqual([
      'https://merchant.test/on/demandware.store/Sites-brand-Site/default/Product-Show?pid=SKU999',
    ]);
  });

  it('evaluates checkout destinations with profile-specific URL patterns', () => {
    expect(evaluateCheckoutDestination(
      'https://merchant.test/Checkout-Begin',
      '<form>shipping address payment</form>',
      'Shipping address Payment',
      'sfcc'
    )).toEqual({ confirmed: true });

    expect(evaluateCheckoutDestination(
      'https://merchant.test/Checkout-Begin',
      '<form>shipping address payment</form>',
      'Shipping address Payment',
      'shopify'
    )).toEqual({ confirmed: false });
  });

  it('adds selected platform context to the WA prompt', () => {
    const result: ScrapeResult = {
      summary: {
        seedUrl: 'https://merchant.test',
        domain: 'merchant.test',
        startedAt: '2026-05-18T00:00:00.000Z',
        completedAt: '2026-05-18T00:00:01.000Z',
        pagesVisited: 0,
        pagesBlocked: 0,
        checkoutReached: false,
        selectedPlatform: { id: 'gem', label: getPlatformProfile('gem').label },
        errors: [],
        thirdPartiesDetected: [],
        technologies: [],
        redFlags: [],
        dangerousGoods: [],
        b2bIndicators: [],
        dropshipIndicators: [],
        productPagesScraped: 0,
      },
      pages: [],
    };

    const prompt = buildPrompt(result, { selectedPlatform: 'gem' });

    expect(prompt.user).toContain('Known ecommerce platform:** GEM / Custom');
    expect(prompt.user).toContain('manual Global-e Module style implementation path');
    expect(prompt.user).toContain('Do not describe this run as a failed sweep');
  });

  it('discovers crawl targets from robots-listed sitemaps', async () => {
    const responses = new Map([
      ['https://merchant.test/robots.txt', 'Sitemap: https://merchant.test/sitemap-products.xml'],
      ['https://merchant.test/sitemap.xml', ''],
      ['https://merchant.test/sitemap-products.xml', [
        '<urlset>',
        '<url><loc>https://merchant.test/shop/women-shirts</loc></url>',
        '<url><loc>https://merchant.test/shop/product/macys-style-product?ID=123</loc></url>',
        '<url><loc>https://merchant.test/customer-service/returns</loc></url>',
        '<url><loc>https://merchant.test/stores/bangor-me-595</loc></url>',
        '<url><loc>https://merchant.test/brand/example-brand?category=makeup</loc></url>',
        '<url><loc>https://merchant.test/item/custom-hoodie</loc></url>',
        '</urlset>',
      ].join('')],
    ]);
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const body = responses.get(url);
      return new Response(body || '', { status: body === undefined ? 404 : 200 });
    };

    const targets = await discoverSitemapTargets('https://merchant.test', 'gem', { fetchImpl });

    expect(targets.map((target) => target.url)).toEqual(expect.arrayContaining([
      'https://merchant.test/shop/women-shirts',
      'https://merchant.test/shop/product/macys-style-product?ID=123',
      'https://merchant.test/customer-service/returns',
      'https://merchant.test/brand/example-brand?category=makeup',
      'https://merchant.test/item/custom-hoodie',
    ]));
    expect(targets.map((target) => target.url)).not.toContain('https://merchant.test/stores/bangor-me-595');
    expect(targets.find((target) => target.url.includes('/brand/example-brand'))?.type).toBe('collection');
    expect(targets.find((target) => target.url.endsWith('/customer-service/returns'))?.type).toBe('policy');
    expect(targets.find((target) => target.url.endsWith('/item/custom-hoodie'))?.type).toBe('pdp');
    expect(targets.find((target) => target.url.includes('/shop/product/'))?.type).toBe('pdp');
  });

  it('discovers indexed URLs through a configured search API provider', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      web: {
        results: [
          {
            url: 'https://merchant.test/customer-service/shipping',
            title: 'Shipping & Delivery',
            description: 'Shipping policy',
          },
          {
            url: 'https://merchant.test/shop/featured/women-shirt',
            title: 'Women Shirt',
            description: 'Shop products',
          },
          {
            url: 'https://merchant.test/stores/augusta-me-412',
            title: 'Augusta Store',
            description: 'Find a store location',
          },
        ],
      },
    }), { status: 200 });

    const targets = await discoverSearchIndexTargets('https://merchant.test', 'gem', {
      fetchImpl,
      env: {
        SWEEP_SEARCH_INDEX_PROVIDER: 'brave',
        BRAVE_SEARCH_API_KEY: 'test-key',
      } as NodeJS.ProcessEnv,
    });

    expect(targets.map((target) => target.url)).toEqual(expect.arrayContaining([
      'https://merchant.test/customer-service/shipping',
      'https://merchant.test/shop/featured/women-shirt',
    ]));
    expect(targets.map((target) => target.url)).not.toContain('https://merchant.test/stores/augusta-me-412');
    expect(targets.find((target) => target.url.endsWith('/customer-service/shipping'))?.type).toBe('policy');
  });
});
