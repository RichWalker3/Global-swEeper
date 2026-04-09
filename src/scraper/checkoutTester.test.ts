import { describe, expect, it } from 'vitest';
import { buildCheckoutProductCandidates, evaluateCheckoutDestination } from './checkoutTester.js';

describe('evaluateCheckoutDestination', () => {
  it('confirms a real Shopify checkout page', () => {
    const result = evaluateCheckoutDestination(
      'https://shop.example.com/checkouts/cn/test-token',
      '<html><body><form><input name="checkout[email]"></form><script>window.ShopifyCheckout = {};</script></body></html>',
      'Contact information Shipping address Payment Complete order'
    );

    expect(result).toEqual({ confirmed: true });
  });

  it('rejects tracking-page redirects on checkout domains', () => {
    const result = evaluateCheckoutDestination(
      'https://checkout.johnnie-o.com/pages/tracking',
      '<html><body><h1>Track your order</h1></body></html>',
      'Track your order Enter your tracking number'
    );

    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain('tracking page');
  });

  it('rejects checkout-looking URLs without actual checkout signals', () => {
    const result = evaluateCheckoutDestination(
      'https://shop.example.com/checkouts/cn/test-token',
      '<html><body><h1>Loading...</h1></body></html>',
      'Please wait while we redirect you'
    );

    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain('checkout-looking URL');
  });
});

describe('buildCheckoutProductCandidates', () => {
  it('prefers variant product urls and demotes gift cards', () => {
    const result = buildCheckoutProductCandidates('https://www.felina.com', [
      '/products/gift-card',
      'https://www.felina.com/products/utopia-front-close-racerback-t-shirt-bra?variant=43794378326104',
      '/products/stay-in-place-hipster-5-pack-felina',
    ]);

    expect(result[0]).toContain('?variant=');
    expect(result.at(-1)).toContain('gift-card');
  });

  it('dedupes and keeps same-origin urls only', () => {
    const result = buildCheckoutProductCandidates('https://www.felina.com', [
      '/products/example',
      'https://www.felina.com/products/example',
      'https://example.com/products/offsite',
    ]);

    expect(result).toEqual(['https://www.felina.com/products/example']);
  });
});
