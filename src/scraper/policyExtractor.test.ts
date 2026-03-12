/**
 * Tests for policy extraction functions
 */

import { describe, it, expect } from 'vitest';
import {
  extractPolicyInfo,
  extractCheckoutInfo,
  mergePolicies,
} from './policyExtractor.js';

describe('extractPolicyInfo', () => {
  describe('Return window extraction', () => {
    it('extracts "30 day return"', () => {
      const result = extractPolicyInfo('We offer a 30 day return policy');
      expect(result.returnWindow).toBe('30 days');
    });

    it('extracts "30-day return"', () => {
      const result = extractPolicyInfo('Our 30-day return policy');
      expect(result.returnWindow).toBe('30 days');
    });

    it('extracts "return within 30 days"', () => {
      const result = extractPolicyInfo('Items can be returned within 30 days of purchase');
      expect(result.returnWindow).toBe('30 days');
    });

    it('extracts "within 14 days of delivery"', () => {
      const result = extractPolicyInfo('Returns accepted within 14 days of delivery');
      expect(result.returnWindow).toBe('14 days');
    });

    it('extracts "60 day exchange"', () => {
      const result = extractPolicyInfo('We offer a 60 day exchange policy');
      expect(result.returnWindow).toBe('60 days');
    });

    it('extracts business days', () => {
      const result = extractPolicyInfo('Returns must be made within 10 business days');
      expect(result.returnWindow).toBe('10 days');
    });
  });

  describe('Return fees extraction', () => {
    it('extracts dollar amount fees', () => {
      const result = extractPolicyInfo('A $10 return fee will be deducted');
      expect(result.returnFees).toBeDefined();
      expect(result.returnFees?.some(f => f.includes('$10'))).toBe(true);
    });

    it('extracts Happy Returns fee', () => {
      const result = extractPolicyInfo('Returns via Happy Returns cost $10 per label');
      expect(result.returnFees).toBeDefined();
      expect(result.returnFees?.some(f => f.includes('Happy Returns'))).toBe(true);
    });

    it('extracts mailback fee', () => {
      const result = extractPolicyInfo('UPS mailback returns cost $15');
      expect(result.returnFees).toBeDefined();
      expect(result.returnFees?.some(f => f.includes('mailback'))).toBe(true);
    });
  });

  describe('Free returns/exchanges', () => {
    it('detects free returns', () => {
      const result = extractPolicyInfo('We offer free returns on all orders');
      expect(result.freeReturns).toBe(true);
    });

    it('detects free exchanges', () => {
      const result = extractPolicyInfo('Free exchange on any item');
      expect(result.freeExchanges).toBe(true);
    });

    it('does not flag "not free return"', () => {
      const result = extractPolicyInfo('Returns are not free return shipping required');
      expect(result.freeReturns).toBe(false);
    });
  });

  describe('Final sale items', () => {
    it('detects underwear as final sale', () => {
      const result = extractPolicyInfo('Underwear is final sale and cannot be returned');
      expect(result.finalSaleItems).toContain('underwear');
    });

    it('detects gift cards as final sale', () => {
      const result = extractPolicyInfo('Gift cards are final sale');
      expect(result.finalSaleItems).toContain('gift cards');
    });

    it('detects sale items as final sale', () => {
      const result = extractPolicyInfo('All sale items are final sale and cannot be returned');
      expect(result.finalSaleItems).toBeDefined();
      expect(result.finalSaleItems?.some(i => i.includes('sale'))).toBe(true);
    });

    it('detects swimwear as final sale', () => {
      const result = extractPolicyInfo('For hygiene reasons, swimwear is final sale');
      expect(result.finalSaleItems).toContain('swimwear');
    });

    it('detects generic final sale mention', () => {
      const result = extractPolicyInfo('Items marked final sale cannot be returned');
      expect(result.finalSaleItems).toBeDefined();
      expect(result.finalSaleItems?.length).toBeGreaterThan(0);
    });
  });

  describe('Return portal detection', () => {
    it('detects Loop Returns', () => {
      const result = extractPolicyInfo('Start your return at loopreturns.com/brand');
      expect(result.returnProvider).toBe('Loop Returns');
    });

    it('detects Happy Returns', () => {
      const result = extractPolicyInfo('Visit happyreturns.com to find a bar near you');
      expect(result.returnProvider).toBe('Happy Returns');
    });

    it('detects Narvar', () => {
      const result = extractPolicyInfo('Track your return at narvar.com/tracking');
      expect(result.returnProvider).toBe('Narvar');
    });

    it('detects ReturnGO', () => {
      const result = extractPolicyInfo('Use our portal at returngo.ai/brand');
      expect(result.returnProvider).toBe('ReturnGO');
    });
  });

  describe('Gift with purchase', () => {
    it('detects "gift with purchase"', () => {
      const result = extractPolicyInfo('Get a free gift with purchase of $100+');
      expect(result.giftWithPurchase).toBe(true);
    });

    it('detects "free gift"', () => {
      const result = extractPolicyInfo('Free gift with every order');
      expect(result.giftWithPurchase).toBe(true);
    });

    it('detects GWP abbreviation', () => {
      const result = extractPolicyInfo('Current GWP: Free tote bag');
      expect(result.giftWithPurchase).toBe(true);
    });
  });

  describe('Price adjustment window', () => {
    it('extracts price adjustment period', () => {
      const result = extractPolicyInfo('Price adjustment for 7 day after purchase');
      expect(result.priceAdjustmentWindow).toBe('7 days');
    });
  });

  describe('Shipping restrictions', () => {
    it('detects no international shipping', () => {
      const result = extractPolicyInfo('We are unable to ship internationally at this time');
      expect(result.shippingRestrictions).toBeDefined();
      expect(result.shippingRestrictions?.some(r => r.includes('international'))).toBe(true);
    });

    it('detects domestic only', () => {
      const result = extractPolicyInfo('Domestic only shipping available');
      expect(result.shippingRestrictions).toBeDefined();
    });

    it('detects US only', () => {
      const result = extractPolicyInfo('Shipping is U.S. only');
      expect(result.shippingRestrictions).toBeDefined();
    });
  });

  describe('Raw excerpts', () => {
    it('extracts returns excerpt', () => {
      const result = extractPolicyInfo('Our return policy allows 30 days for all items.');
      expect(result.rawExcerpts.returns).toBeDefined();
    });

    it('extracts shipping excerpt', () => {
      const result = extractPolicyInfo('Standard shipping takes 5-7 business days.');
      expect(result.rawExcerpts.shipping).toBeDefined();
    });
  });
});

describe('extractCheckoutInfo', () => {
  describe('Express wallets', () => {
    it('detects Shop Pay', () => {
      const result = extractCheckoutInfo('<button>Shop Pay</button>', 'Pay with Shop Pay');
      expect(result.expressWallets).toContain('Shop Pay');
    });

    it('detects PayPal', () => {
      const result = extractCheckoutInfo('<img src="paypal.png">', 'PayPal checkout');
      expect(result.expressWallets).toContain('PayPal');
    });

    it('detects Apple Pay', () => {
      const result = extractCheckoutInfo('<button>Apple Pay</button>', '');
      expect(result.expressWallets).toContain('Apple Pay');
    });

    it('detects Google Pay', () => {
      const result = extractCheckoutInfo('<button>Google Pay</button>', '');
      expect(result.expressWallets).toContain('Google Pay');
    });

    it('detects Amazon Pay', () => {
      const result = extractCheckoutInfo('<button>Amazon Pay</button>', '');
      expect(result.expressWallets).toContain('Amazon Pay');
    });
  });

  describe('BNPL options', () => {
    it('detects Afterpay', () => {
      const result = extractCheckoutInfo('<div>Afterpay</div>', 'Pay in 4 with Afterpay');
      expect(result.bnplOptions).toContain('Afterpay');
    });

    it('detects Klarna', () => {
      const result = extractCheckoutInfo('<div>Klarna</div>', 'Pay later with Klarna');
      expect(result.bnplOptions).toContain('Klarna');
    });

    it('detects Affirm', () => {
      const result = extractCheckoutInfo('<div>Affirm</div>', 'Pay over time with Affirm');
      expect(result.bnplOptions).toContain('Affirm');
    });

    it('detects Sezzle', () => {
      const result = extractCheckoutInfo('<div>Sezzle</div>', '');
      expect(result.bnplOptions).toContain('Sezzle');
    });

    it('detects generic "pay in 4"', () => {
      const result = extractCheckoutInfo('', 'Pay in 4 interest-free payments');
      expect(result.bnplOptions.some(b => b.includes('BNPL'))).toBe(true);
    });
  });

  describe('Payment methods', () => {
    it('detects Visa', () => {
      const result = extractCheckoutInfo('<img alt="Visa">', 'We accept Visa');
      expect(result.paymentMethods).toContain('Visa');
    });

    it('detects Mastercard', () => {
      const result = extractCheckoutInfo('<img alt="Mastercard">', '');
      expect(result.paymentMethods).toContain('Mastercard');
    });

    it('detects Amex', () => {
      const result = extractCheckoutInfo('<img alt="American Express">', '');
      expect(result.paymentMethods).toContain('Amex');
    });
  });

  describe('Gift card option', () => {
    it('detects gift card field', () => {
      const result = extractCheckoutInfo('', 'Apply gift card code');
      expect(result.giftCardOption).toBe(true);
    });

    it('detects gift card in text', () => {
      const result = extractCheckoutInfo('', 'Enter your gift card code here');
      expect(result.giftCardOption).toBe(true);
    });
  });

  describe('Tax display', () => {
    it('detects calculated at checkout', () => {
      const result = extractCheckoutInfo('', 'Tax calculated at checkout');
      expect(result.taxDisplay).toBe('calculated at checkout');
    });

    it('detects tax included', () => {
      const result = extractCheckoutInfo('', 'All prices tax included');
      expect(result.taxDisplay).toBe('included');
    });
  });

  describe('Checkout type', () => {
    it('detects Shopify checkout', () => {
      const result = extractCheckoutInfo('<script src="cdn.shopify.com/checkout.js">', '');
      expect(result.checkoutType).toBe('Shopify Checkout');
    });
  });
});

describe('mergePolicies', () => {
  it('merges return windows (first wins)', () => {
    const policies = [
      { returnWindow: '30 days', rawExcerpts: {} },
      { returnWindow: '60 days', rawExcerpts: {} },
    ];
    const merged = mergePolicies(policies);
    expect(merged.returnWindow).toBe('30 days');
  });

  it('combines return fees', () => {
    const policies = [
      { returnFees: ['$10 fee'], rawExcerpts: {} },
      { returnFees: ['$15 mailback'], rawExcerpts: {} },
    ];
    const merged = mergePolicies(policies);
    expect(merged.returnFees).toContain('$10 fee');
    expect(merged.returnFees).toContain('$15 mailback');
  });

  it('deduplicates return fees', () => {
    const policies = [
      { returnFees: ['$10 fee'], rawExcerpts: {} },
      { returnFees: ['$10 fee'], rawExcerpts: {} },
    ];
    const merged = mergePolicies(policies);
    expect(merged.returnFees?.filter(f => f === '$10 fee').length).toBe(1);
  });

  it('combines final sale items', () => {
    const policies = [
      { finalSaleItems: ['underwear'], rawExcerpts: {} },
      { finalSaleItems: ['swimwear'], rawExcerpts: {} },
    ];
    const merged = mergePolicies(policies);
    expect(merged.finalSaleItems).toContain('underwear');
    expect(merged.finalSaleItems).toContain('swimwear');
  });

  it('deduplicates final sale items', () => {
    const policies = [
      { finalSaleItems: ['underwear'], rawExcerpts: {} },
      { finalSaleItems: ['underwear', 'swimwear'], rawExcerpts: {} },
    ];
    const merged = mergePolicies(policies);
    expect(merged.finalSaleItems?.filter(i => i === 'underwear').length).toBe(1);
  });

  it('ORs boolean fields (true if any true)', () => {
    const policies = [
      { freeReturns: false, rawExcerpts: {} },
      { freeReturns: true, rawExcerpts: {} },
    ];
    const merged = mergePolicies(policies);
    expect(merged.freeReturns).toBe(true);
  });

  it('merges excerpts', () => {
    const policies = [
      { rawExcerpts: { returns: 'excerpt 1' } as Record<string, string> },
      { rawExcerpts: { shipping: 'excerpt 2' } as Record<string, string> },
    ];
    const merged = mergePolicies(policies);
    expect(merged.rawExcerpts.returns).toBe('excerpt 1');
    expect(merged.rawExcerpts.shipping).toBe('excerpt 2');
  });

  it('handles empty array', () => {
    const merged = mergePolicies([]);
    expect(merged.rawExcerpts).toEqual({});
  });
});
