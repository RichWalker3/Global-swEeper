/**
 * Tests for page tagger
 */

import { describe, it, expect } from 'vitest';
import { tagPage, CATEGORY_PATTERNS } from './tagger.js';

describe('tagPage', () => {
  describe('URL-based detection', () => {
    it('tags product pages by URL', () => {
      const result = tagPage('Product description', 'https://example.com/products/cool-shirt', 'Cool Shirt');
      expect(result.categories).toContain('pdp');
    });

    it('tags /p/ URLs as product pages', () => {
      const result = tagPage('Product', 'https://example.com/p/12345', 'Product');
      expect(result.categories).toContain('pdp');
    });

    it('tags checkout pages by URL', () => {
      const result = tagPage('Checkout', 'https://example.com/checkout', 'Checkout');
      expect(result.categories).toContain('checkout');
    });

    it('tags cart pages by URL', () => {
      const result = tagPage('Your cart', 'https://example.com/cart', 'Cart');
      expect(result.categories).toContain('checkout');
    });
  });

  describe('Shipping category', () => {
    it('tags pages with shipping keywords', () => {
      const result = tagPage('Free shipping on orders over $50', 'https://example.com', 'Shop');
      expect(result.categories).toContain('shipping');
    });

    it('tags pages with carrier mentions', () => {
      const result = tagPage('We ship via USPS, UPS, and FedEx', 'https://example.com', 'Shipping');
      expect(result.categories).toContain('shipping');
    });

    it('tags pages with delivery mentions', () => {
      const result = tagPage('Estimated delivery in 5-7 business days', 'https://example.com', 'Info');
      expect(result.categories).toContain('shipping');
    });
  });

  describe('Returns category', () => {
    it('tags pages with return keywords', () => {
      const result = tagPage('30 day return policy', 'https://example.com', 'Policy');
      expect(result.categories).toContain('returns');
    });

    it('tags pages with refund mentions', () => {
      const result = tagPage('Full refund within 14 days', 'https://example.com', 'Returns');
      expect(result.categories).toContain('returns');
    });

    it('tags pages with exchange mentions', () => {
      const result = tagPage('Free exchanges on all orders', 'https://example.com', 'Policy');
      expect(result.categories).toContain('returns');
    });

    it('tags pages with final sale mentions', () => {
      const result = tagPage('Items marked final sale cannot be returned', 'https://example.com', 'Returns');
      expect(result.categories).toContain('returns');
    });
  });

  describe('Duties and taxes category', () => {
    it('tags pages with duties mentions', () => {
      const result = tagPage('All duties and taxes are prepaid', 'https://example.com', 'International');
      expect(result.categories).toContain('duties_taxes');
    });

    it('tags pages with customs mentions', () => {
      const result = tagPage('Customs fees may apply', 'https://example.com', 'Shipping');
      expect(result.categories).toContain('duties_taxes');
    });

    it('tags pages with VAT mentions', () => {
      const result = tagPage('VAT included in all prices', 'https://example.com', 'FAQ');
      expect(result.categories).toContain('duties_taxes');
    });

    it('tags pages with DDP/DDU mentions', () => {
      const result = tagPage('We offer DDP shipping to Europe', 'https://example.com', 'International');
      expect(result.categories).toContain('duties_taxes');
    });
  });

  describe('Subscriptions category', () => {
    it('tags pages with subscription keywords', () => {
      const result = tagPage('Subscribe and save 15% on every order', 'https://example.com', 'Product');
      expect(result.categories).toContain('subscriptions');
    });

    it('tags pages with recurring mentions', () => {
      const result = tagPage('Set up a recurring order', 'https://example.com', 'Subscribe');
      expect(result.categories).toContain('subscriptions');
    });

    it('tags pages with auto-ship mentions', () => {
      const result = tagPage('Auto-ship available for this product', 'https://example.com', 'Product');
      expect(result.categories).toContain('subscriptions');
    });
  });

  describe('Loyalty category', () => {
    it('tags pages with rewards keywords', () => {
      const result = tagPage('Join our rewards program', 'https://example.com', 'Rewards');
      expect(result.categories).toContain('loyalty');
    });

    it('tags pages with points mentions', () => {
      const result = tagPage('Earn points on every purchase', 'https://example.com', 'Loyalty');
      expect(result.categories).toContain('loyalty');
    });

    it('tags pages with VIP mentions', () => {
      const result = tagPage('VIP members get free shipping', 'https://example.com', 'Benefits');
      expect(result.categories).toContain('loyalty');
    });
  });

  describe('Payments category', () => {
    it('tags pages with payment keywords', () => {
      const result = tagPage('Payment methods accepted', 'https://example.com', 'Checkout');
      expect(result.categories).toContain('payments');
    });

    it('tags pages with BNPL mentions', () => {
      const result = tagPage('Pay in 4 with Klarna or Afterpay', 'https://example.com', 'Product');
      expect(result.categories).toContain('payments');
    });

    it('tags pages with wallet mentions', () => {
      const result = tagPage('We accept Apple Pay and Google Pay', 'https://example.com', 'Checkout');
      expect(result.categories).toContain('payments');
    });
  });

  describe('International category', () => {
    it('tags pages with international keywords', () => {
      const result = tagPage('We ship internationally to over 100 countries', 'https://example.com', 'Shipping');
      expect(result.categories).toContain('international');
    });

    it('tags pages with currency mentions', () => {
      const result = tagPage('Prices shown in EUR, GBP, CAD', 'https://example.com', 'Info');
      expect(result.categories).toContain('international');
    });

    it('tags pages with overseas mentions', () => {
      const result = tagPage('Overseas orders may take longer', 'https://example.com', 'FAQ');
      expect(result.categories).toContain('international');
    });
  });

  describe('B2B category', () => {
    it('tags pages with wholesale keywords', () => {
      const result = tagPage('Apply for a wholesale account', 'https://example.com', 'Wholesale');
      expect(result.categories).toContain('b2b');
    });

    it('tags pages with bulk mentions', () => {
      const result = tagPage('Bulk pricing available', 'https://example.com', 'B2B');
      expect(result.categories).toContain('b2b');
    });

    it('tags pages with trade mentions', () => {
      const result = tagPage('Trade program for interior designers', 'https://example.com', 'Trade');
      expect(result.categories).toContain('b2b');
    });
  });

  describe('Gift cards category', () => {
    it('tags pages with gift card keywords', () => {
      const result = tagPage('Purchase a gift card', 'https://example.com', 'Gift Cards');
      expect(result.categories).toContain('gift_cards');
    });

    it('tags pages with e-gift mentions', () => {
      const result = tagPage('Send an e-gift instantly', 'https://example.com', 'Gifts');
      expect(result.categories).toContain('gift_cards');
    });
  });

  describe('FAQ category', () => {
    it('tags pages with FAQ keywords', () => {
      const result = tagPage('Frequently Asked Questions', 'https://example.com', 'FAQ');
      expect(result.categories).toContain('faq');
    });

    it('tags pages with help keywords', () => {
      const result = tagPage('Help center and support', 'https://example.com', 'Help');
      expect(result.categories).toContain('faq');
    });
  });

  describe('Terms category', () => {
    it('tags pages with terms keywords', () => {
      const result = tagPage('Terms of Service', 'https://example.com', 'Terms');
      expect(result.categories).toContain('terms');
    });

    it('tags pages with legal agreement mentions', () => {
      const result = tagPage('By using this site you agree to our terms and conditions', 'https://example.com', 'Legal');
      expect(result.categories).toContain('terms');
    });
  });

  describe('Privacy category', () => {
    it('tags pages with privacy keywords', () => {
      const result = tagPage('Privacy Policy', 'https://example.com', 'Privacy');
      expect(result.categories).toContain('privacy');
    });

    it('tags pages with GDPR mentions', () => {
      const result = tagPage('GDPR compliant data handling', 'https://example.com', 'Privacy');
      expect(result.categories).toContain('privacy');
    });

    it('tags pages with cookie mentions', () => {
      const result = tagPage('Cookie policy and preferences', 'https://example.com', 'Privacy');
      expect(result.categories).toContain('privacy');
    });
  });

  describe('Key phrases extraction', () => {
    it('returns matched keywords', () => {
      const result = tagPage('Free shipping and free returns on all orders', 'https://example.com', 'Shop');
      expect(result.keyPhrases).toContain('free shipping');
      expect(result.keyPhrases).toContain('free returns');
    });

    it('extracts multiple keyword matches', () => {
      const result = tagPage('Subscribe and save, earn rewards points', 'https://example.com', 'Shop');
      expect(result.keyPhrases.length).toBeGreaterThan(1);
    });
  });

  describe('Multiple categories', () => {
    it('can assign multiple categories to one page', () => {
      const text = 'Free shipping and free returns. Subscribe and save 15%. Earn rewards points.';
      const result = tagPage(text, 'https://example.com', 'Shop');
      expect(result.categories.length).toBeGreaterThan(1);
    });
  });

  describe('Title-based detection', () => {
    it('detects categories from page title', () => {
      const result = tagPage('Content here', 'https://example.com', 'Shipping Policy - Free Shipping');
      expect(result.categories).toContain('shipping');
    });
  });
});

describe('CATEGORY_PATTERNS', () => {
  it('has shipping category with keywords', () => {
    const shipping = CATEGORY_PATTERNS.find(p => p.category === 'shipping');
    expect(shipping).toBeDefined();
    expect(shipping?.keywords.length).toBeGreaterThan(5);
  });

  it('has returns category with keywords', () => {
    const returns = CATEGORY_PATTERNS.find(p => p.category === 'returns');
    expect(returns).toBeDefined();
    expect(returns?.keywords.length).toBeGreaterThan(5);
  });

  it('has all expected categories', () => {
    const categories = CATEGORY_PATTERNS.map(p => p.category);
    expect(categories).toContain('shipping');
    expect(categories).toContain('returns');
    expect(categories).toContain('duties_taxes');
    expect(categories).toContain('subscriptions');
    expect(categories).toContain('loyalty');
    expect(categories).toContain('payments');
    expect(categories).toContain('international');
    expect(categories).toContain('b2b');
    expect(categories).toContain('gift_cards');
    expect(categories).toContain('faq');
    expect(categories).toContain('terms');
    expect(categories).toContain('privacy');
    expect(categories).toContain('pdp');
    expect(categories).toContain('checkout');
  });
});
