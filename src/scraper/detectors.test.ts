/**
 * Tests for third-party detection, red flags, DG scanning, B2B detection
 */

import { describe, it, expect } from 'vitest';
import {
  detectThirdParty,
  isRedFlag,
  getThirdPartyInfo,
  getCategoryForThirdParty,
  scanForDangerousGoods,
  detectB2B,
  extractProductLinks,
} from './detectors.js';

describe('detectThirdParty', () => {
  describe('Red flag apps', () => {
    it('detects Smile.io from CDN URL', () => {
      expect(detectThirdParty('https://cdn.smile.io/v2/widget.js')).toBe('Smile.io');
    });

    it('detects Smile.io from js subdomain', () => {
      expect(detectThirdParty('https://js.smile.io/sdk.js')).toBe('Smile.io');
    });

    it('detects Recharge from payments domain', () => {
      expect(detectThirdParty('https://checkout.rechargepayments.com/cart')).toBe('Recharge');
    });

    it('detects Recharge from apps domain', () => {
      expect(detectThirdParty('https://rc.rechargeapps.com/portal')).toBe('Recharge');
    });
  });

  describe('Positive signals', () => {
    it('detects ReturnGO', () => {
      expect(detectThirdParty('https://returngo.ai/portal/brand')).toBe('ReturnGO');
    });

    it('detects Global-e', () => {
      expect(detectThirdParty('https://web.global-e.com/merchant/123')).toBe('Global-e');
    });

    it('detects Shop Pay', () => {
      expect(detectThirdParty('https://shop.app/pay')).toBe('Shop Pay');
    });
  });

  describe('Loyalty providers', () => {
    it('detects LoyaltyLion', () => {
      expect(detectThirdParty('https://sdk.loyaltylion.com/widget.js')).toBe('LoyaltyLion');
    });

    it('detects Yotpo', () => {
      expect(detectThirdParty('https://staticw2.yotpo.com/widget.js')).toBe('Yotpo Loyalty');
    });
  });

  describe('BNPL providers', () => {
    it('detects Klarna', () => {
      expect(detectThirdParty('https://cdn.klarna.com/widget.js')).toBe('Klarna');
    });

    it('detects Afterpay', () => {
      expect(detectThirdParty('https://js.afterpay.com/afterpay.js')).toBe('Afterpay');
    });

    it('detects Affirm', () => {
      expect(detectThirdParty('https://cdn1.affirm.com/js/affirm.js')).toBe('Affirm');
    });

    it('detects Sezzle', () => {
      expect(detectThirdParty('https://widget.sezzle.com/v1/widget.js')).toBe('Sezzle');
    });
  });

  describe('Competitors', () => {
    it('detects Reach', () => {
      expect(detectThirdParty('https://checkout.withreach.com/session')).toBe('Reach');
    });

    it('detects Flow Commerce', () => {
      expect(detectThirdParty('https://api.flow.io/checkout')).toBe('Flow Commerce');
    });

    it('detects Zonos', () => {
      expect(detectThirdParty('https://js.zonos.com/widget.js')).toBe('Zonos');
    });
  });

  describe('Returns providers', () => {
    it('detects Loop Returns', () => {
      expect(detectThirdParty('https://api.loopreturns.com/return')).toBe('Loop Returns');
    });

    it('detects Narvar', () => {
      expect(detectThirdParty('https://tracking.narvar.com/brand')).toBe('Narvar');
    });

    it('detects Happy Returns', () => {
      expect(detectThirdParty('https://portal.happyreturns.com/brand')).toBe('Happy Returns');
    });
  });

  describe('Support providers', () => {
    it('detects Gorgias', () => {
      expect(detectThirdParty('https://config.gorgias.chat/bundle.js')).toBe('Gorgias');
    });

    it('detects Zendesk', () => {
      expect(detectThirdParty('https://static.zdassets.com/ekr/widget.js')).toBe('Zendesk');
    });

    it('detects Intercom', () => {
      expect(detectThirdParty('https://widget.intercom.io/widget/abc123')).toBe('Intercom');
    });
  });

  describe('Non-matches', () => {
    it('returns undefined for generic URLs', () => {
      expect(detectThirdParty('https://example.com/script.js')).toBeUndefined();
    });

    it('returns undefined for Shopify CDN', () => {
      expect(detectThirdParty('https://cdn.shopify.com/s/files/script.js')).toBeUndefined();
    });
  });
});

describe('isRedFlag', () => {
  it('returns true for Smile.io', () => {
    expect(isRedFlag('Smile.io')).toBe(true);
  });

  it('returns true for Recharge', () => {
    expect(isRedFlag('Recharge')).toBe(true);
  });

  it('returns true for competitors', () => {
    expect(isRedFlag('Reach')).toBe(true);
    expect(isRedFlag('Flow Commerce')).toBe(true);
    expect(isRedFlag('Zonos')).toBe(true);
  });

  it('returns false for supported apps', () => {
    expect(isRedFlag('ReturnGO')).toBe(false);
    expect(isRedFlag('LoyaltyLion')).toBe(false);
    expect(isRedFlag('Klarna')).toBe(false);
  });
});

describe('getThirdPartyInfo', () => {
  it('returns info for known apps', () => {
    const info = getThirdPartyInfo('Smile.io');
    expect(info).toBeDefined();
    expect(info?.category).toBe('loyalty');
    expect(info?.priority).toBe('critical');
    expect(info?.notes).toContain('NOT SUPPORTED');
  });

  it('returns undefined for unknown apps', () => {
    expect(getThirdPartyInfo('Unknown App')).toBeUndefined();
  });
});

describe('getCategoryForThirdParty', () => {
  it('returns correct category', () => {
    expect(getCategoryForThirdParty('Klarna')).toBe('bnpl');
    expect(getCategoryForThirdParty('LoyaltyLion')).toBe('loyalty');
    expect(getCategoryForThirdParty('ReturnGO')).toBe('returns');
  });
});

describe('scanForDangerousGoods', () => {
  describe('Fragrances', () => {
    it('detects perfume', () => {
      const matches = scanForDangerousGoods('Our new perfume collection is here');
      expect(matches.some(m => m.category === 'fragrance')).toBe(true);
    });

    it('detects eau de parfum', () => {
      const matches = scanForDangerousGoods('Shop Eau de Parfum 50ml');
      expect(matches.some(m => m.category === 'fragrance')).toBe(true);
    });

    it('detects cologne', () => {
      const matches = scanForDangerousGoods("Men's cologne and grooming");
      expect(matches.some(m => m.category === 'fragrance')).toBe(true);
    });
  });

  describe('Nail products', () => {
    it('detects nail polish', () => {
      const matches = scanForDangerousGoods('Professional nail polish in 50 shades');
      expect(matches.some(m => m.category === 'nail')).toBe(true);
    });

    it('detects nail remover', () => {
      const matches = scanForDangerousGoods('Acetone-free nail remover');
      expect(matches.some(m => m.category === 'nail')).toBe(true);
    });
  });

  describe('Aerosols', () => {
    it('detects hairspray', () => {
      const matches = scanForDangerousGoods('Strong hold hairspray 8oz');
      expect(matches.some(m => m.category === 'aerosol')).toBe(true);
    });

    it('detects dry shampoo', () => {
      const matches = scanForDangerousGoods('Volumizing dry shampoo spray');
      expect(matches.some(m => m.category === 'aerosol')).toBe(true);
    });
  });

  describe('Batteries', () => {
    it('detects lithium battery', () => {
      const matches = scanForDangerousGoods('Device contains lithium battery');
      expect(matches.some(m => m.category === 'battery')).toBe(true);
    });

    it('detects li-ion', () => {
      const matches = scanForDangerousGoods('Rechargeable li-ion battery included');
      expect(matches.some(m => m.category === 'battery')).toBe(true);
    });
  });

  describe('False positive handling', () => {
    it('ignores "lighter" when used as weight adjective', () => {
      const matches = scanForDangerousGoods('Our new frame is 20% lighter weight');
      expect(matches.some(m => m.keyword === 'lighter')).toBe(false);
    });

    it('ignores "lighter footprint"', () => {
      const matches = scanForDangerousGoods('Sustainable packaging with a lighter environmental footprint');
      expect(matches.some(m => m.keyword === 'lighter')).toBe(false);
    });

    it('detects actual lighters', () => {
      const matches = scanForDangerousGoods('Zippo lighter collection');
      expect(matches.some(m => m.keyword === 'lighter')).toBe(true);
    });
  });

  describe('Deduplication', () => {
    it('returns one match per category', () => {
      const text = 'We sell perfume, cologne, and fragrance mists';
      const matches = scanForDangerousGoods(text);
      const fragranceMatches = matches.filter(m => m.category === 'fragrance');
      expect(fragranceMatches.length).toBe(1);
    });
  });

  describe('Context extraction', () => {
    it('includes surrounding context', () => {
      const matches = scanForDangerousGoods('Shop our amazing new perfume line today');
      expect(matches[0].context).toContain('perfume');
      expect(matches[0].context.length).toBeGreaterThan(10);
    });
  });
});

describe('detectB2B', () => {
  describe('Strong indicators', () => {
    it('detects wholesale program', () => {
      const result = detectB2B('Join our wholesale program for retailers', 'https://example.com/wholesale');
      expect(result.detected).toBe(true);
      expect(result.evidence).toContain('wholesale program');
    });

    it('detects trade account', () => {
      const result = detectB2B('Apply for a trade account today', 'https://example.com');
      expect(result.detected).toBe(true);
      expect(result.evidence).toContain('trade account');
    });

    it('detects bulk pricing', () => {
      const result = detectB2B('Bulk pricing available for orders over 100 units', 'https://example.com');
      expect(result.detected).toBe(true);
      expect(result.evidence).toContain('bulk pricing');
    });

    it('detects Faire', () => {
      const result = detectB2B('Shop us on faire.com', 'https://example.com');
      expect(result.detected).toBe(true);
    });
  });

  describe('URL detection', () => {
    it('detects wholesale in URL', () => {
      const result = detectB2B('Welcome to our store', 'https://example.com/wholesale');
      expect(result.detected).toBe(true);
    });

    it('detects b2b in URL', () => {
      const result = detectB2B('Welcome', 'https://example.com/b2b-portal');
      expect(result.detected).toBe(true);
    });
  });

  describe('False positive filtering', () => {
    it('ignores unauthorized reseller warnings', () => {
      const result = detectB2B('Warning: unauthorized reseller products not covered by warranty', 'https://example.com');
      expect(result.evidence).not.toContain('reseller');
    });

    it('ignores dealer locator references', () => {
      const result = detectB2B('Find a dealer near you with our dealer locator', 'https://example.com');
      expect(result.evidence).not.toContain('dealer');
    });
  });

  describe('No B2B', () => {
    it('returns false for regular consumer pages', () => {
      const result = detectB2B('Shop our latest collection', 'https://example.com/shop');
      expect(result.detected).toBe(false);
    });
  });
});

describe('extractProductLinks', () => {
  it('extracts Shopify product URLs', () => {
    const html = `
      <a href="/products/cool-shirt">Cool Shirt</a>
      <a href="/products/nice-pants">Nice Pants</a>
    `;
    const links = extractProductLinks(html, 'https://example.com');
    expect(links).toContain('https://example.com/products/cool-shirt');
    expect(links).toContain('https://example.com/products/nice-pants');
  });

  it('skips variant URLs', () => {
    const html = `
      <a href="/products/shirt?variant=123">Variant</a>
      <a href="/products/shirt">Main</a>
    `;
    const links = extractProductLinks(html, 'https://example.com');
    expect(links).toContain('https://example.com/products/shirt');
    expect(links).not.toContain('https://example.com/products/shirt?variant=123');
  });

  it('limits to 5 products', () => {
    const html = Array.from({ length: 10 }, (_, i) => 
      `<a href="/products/product-${i}">Product ${i}</a>`
    ).join('\n');
    const links = extractProductLinks(html, 'https://example.com');
    expect(links.length).toBe(5);
  });

  it('handles absolute URLs', () => {
    const html = '<a href="https://example.com/products/shirt">Shirt</a>';
    const links = extractProductLinks(html, 'https://example.com');
    expect(links).toContain('https://example.com/products/shirt');
  });

  it('deduplicates URLs', () => {
    const html = `
      <a href="/products/shirt">Shirt 1</a>
      <a href="/products/shirt">Shirt 2</a>
    `;
    const links = extractProductLinks(html, 'https://example.com');
    expect(links.filter(l => l.includes('shirt')).length).toBe(1);
  });
});
