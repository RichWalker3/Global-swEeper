/**
 * Tests for catalog and product detection
 */

import { describe, it, expect } from 'vitest';
import {
  detectBundles,
  detectCustomizableProducts,
  detectVirtualProducts,
  detectGiftCards,
  detectSubscriptions,
  detectPreOrders,
  detectLoyaltyProgram,
  detectLocalization,
  detectMarketplaces,
  detectGWP,
  detectBNPLWidgets,
} from './catalogDetector.js';

describe('detectBundles', () => {
  it('detects "bundle" in URL', () => {
    const result = detectBundles('Product description', 'https://example.com/collections/bundles');
    expect(result.detected).toBe(true);
  });

  it('detects "kit" in text', () => {
    const result = detectBundles('Complete skincare kit with 5 products', 'https://example.com');
    expect(result.detected).toBe(true);
  });

  it('detects "build your own box"', () => {
    const result = detectBundles('Build your own box of snacks', 'https://example.com');
    expect(result.detected).toBe(true);
  });

  it('detects "mix and match"', () => {
    const result = detectBundles('Mix & match your favorites', 'https://example.com');
    expect(result.detected).toBe(true);
  });

  it('detects "frequently bought together"', () => {
    const result = detectBundles('Frequently bought together', 'https://example.com');
    expect(result.detected).toBe(true);
  });

  it('detects duo/trio', () => {
    const result = detectBundles('Power duo set', 'https://example.com');
    expect(result.detected).toBe(true);
  });

  it('limits evidence to 3 items', () => {
    const text = 'Bundle deal, kit special, set offer, combo pack, value pack';
    const result = detectBundles(text, 'https://example.com/bundles');
    expect(result.evidence.length).toBeLessThanOrEqual(3);
  });
});

describe('detectCustomizableProducts', () => {
  it('detects engraving', () => {
    const result = detectCustomizableProducts('Custom engraving available', '<input name="engraving">');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('engraving');
  });

  it('detects monogram', () => {
    const result = detectCustomizableProducts('Add a monogram to your item', '');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('monogram');
  });

  it('detects personalization', () => {
    const result = detectCustomizableProducts('Personalize this gift', '');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('personalization');
  });

  it('detects build your own', () => {
    const result = detectCustomizableProducts('Build your own bracelet', '');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('build-your-own');
  });

  it('detects made to order', () => {
    const result = detectCustomizableProducts('Made to order within 2 weeks', '');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('made-to-order');
  });

  it('detects customization form inputs', () => {
    const html = '<input type="text" placeholder="Enter engraving text">';
    const result = detectCustomizableProducts('', html);
    expect(result.detected).toBe(true);
  });

  it('returns false for regular products', () => {
    const result = detectCustomizableProducts('Regular product description', '<div>Product</div>');
    expect(result.detected).toBe(false);
  });
});

describe('detectVirtualProducts', () => {
  it('detects downloadable content', () => {
    const result = detectVirtualProducts('Instant download after purchase', 'https://example.com/download');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('download');
  });

  it('detects ebooks', () => {
    const result = detectVirtualProducts('E-book: Complete Guide', 'https://example.com');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('ebook');
  });

  it('detects memberships', () => {
    const result = detectVirtualProducts('Annual membership includes access to all content', 'https://example.com');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('membership');
  });

  it('detects online courses', () => {
    const result = detectVirtualProducts('Enroll in our online course today', 'https://example.com');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('online-course');
  });

  it('does not flag gift cards as virtual products', () => {
    const result = detectVirtualProducts('E-gift card', 'https://example.com/gift-card');
    expect(result.types).not.toContain('ebook');
  });
});

describe('detectGiftCards', () => {
  it('detects e-gift card', () => {
    const result = detectGiftCards('Send an e-gift card', 'https://example.com/e-gift');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('e-gift-card');
  });

  it('detects gift card in URL', () => {
    const result = detectGiftCards('', 'https://example.com/products/gift-card');
    expect(result.detected).toBe(true);
  });

  it('detects digital gift card', () => {
    const result = detectGiftCards('Digital gift card - instant delivery', 'https://example.com');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('e-gift-card');
  });

  it('detects gift certificate', () => {
    const result = detectGiftCards('Purchase a gift certificate', 'https://example.com');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('gift-certificate');
  });

  it('detects store credit', () => {
    const result = detectGiftCards('Store credit balance', 'https://example.com');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('store-credit');
  });
});

describe('detectSubscriptions', () => {
  it('detects "subscribe & save"', () => {
    const result = detectSubscriptions('Subscribe & save 15%', '', []);
    expect(result.detected).toBe(true);
  });

  it('detects "auto-ship"', () => {
    const result = detectSubscriptions('Set up auto-ship for convenience', '', []);
    expect(result.detected).toBe(true);
  });

  it('detects delivery frequency', () => {
    const result = detectSubscriptions('Delivery every 30 days', '', []);
    expect(result.detected).toBe(true);
  });

  it('detects Recharge provider', () => {
    const result = detectSubscriptions('', '<script src="recharge.js">', ['https://rechargeapps.com']);
    expect(result.detected).toBe(true);
    expect(result.provider).toBe('Recharge');
  });

  it('detects Skio provider', () => {
    const result = detectSubscriptions('', '', ['https://skio.com/widget']);
    expect(result.detected).toBe(true);
    expect(result.provider).toBe('Skio');
  });

  it('detects Bold Subscriptions', () => {
    const result = detectSubscriptions('Subscribe & save', '<div>Powered by Bold Subscriptions</div>', []);
    expect(result.detected).toBe(true);
    expect(result.provider).toBe('Bold Subscriptions');
  });
});

describe('detectPreOrders', () => {
  it('detects "pre-order"', () => {
    const result = detectPreOrders('Pre-order now', '');
    expect(result.detected).toBe(true);
  });

  it('detects "coming soon"', () => {
    const result = detectPreOrders('Coming soon - sign up for notification', '');
    expect(result.detected).toBe(true);
  });

  it('detects "ships in [date]"', () => {
    const result = detectPreOrders('Ships in early March 2024', '');
    expect(result.detected).toBe(true);
  });

  it('detects backorder', () => {
    const result = detectPreOrders('Currently on backorder', '');
    expect(result.detected).toBe(true);
  });

  it('detects notify when available', () => {
    const result = detectPreOrders('Notify me when available', '');
    expect(result.detected).toBe(true);
  });

  it('detects pre-order UI elements', () => {
    const result = detectPreOrders('', '<button class="pre-order-btn">Pre-order</button>');
    expect(result.detected).toBe(true);
  });
});

describe('detectLoyaltyProgram', () => {
  it('detects "rewards program"', () => {
    const result = detectLoyaltyProgram('Join our rewards program', '', []);
    expect(result.detected).toBe(true);
  });

  it('detects "earn points"', () => {
    const result = detectLoyaltyProgram('Earn points on every purchase', '', []);
    expect(result.detected).toBe(true);
  });

  it('detects VIP tiers', () => {
    const result = detectLoyaltyProgram('VIP tiers: Silver, Gold, Platinum', '', []);
    expect(result.detected).toBe(true);
  });

  it('detects refer a friend', () => {
    const result = detectLoyaltyProgram('Refer a friend and get $10', '', []);
    expect(result.detected).toBe(true);
  });

  it('detects Smile.io provider', () => {
    const result = detectLoyaltyProgram('', '<script src="smile.io">', ['https://cdn.smile.io']);
    expect(result.detected).toBe(true);
    expect(result.provider).toBe('Smile.io');
  });

  it('detects LoyaltyLion provider', () => {
    const result = detectLoyaltyProgram('', '', ['https://sdk.loyaltylion.com']);
    expect(result.detected).toBe(true);
    expect(result.provider).toBe('LoyaltyLion');
  });

  it('extracts program name', () => {
    const result = detectLoyaltyProgram('Welcome to the INSIDER REWARDS program', '', []);
    expect(result.programName).toBeDefined();
  });
});

describe('detectLocalization', () => {
  it('detects country selector', () => {
    const result = detectLocalization('', '<select id="country-selector">');
    expect(result.countrySelector).toBe(true);
  });

  it('detects "ship to" pattern', () => {
    const result = detectLocalization('Ship to: United States', '');
    expect(result.countrySelector).toBe(true);
  });

  it('detects multiple languages', () => {
    const html = '<html lang="en"><link hreflang="fr"><link hreflang="de">';
    const result = detectLocalization('', html);
    expect(result.multiLanguage).toBe(true);
    expect(result.languagesDetected).toContain('en');
  });

  it('detects currencies', () => {
    const text = 'Prices shown in USD. Also available in EUR and GBP.';
    const result = detectLocalization(text, '');
    expect(result.currenciesDetected).toContain('USD');
    expect(result.currenciesDetected).toContain('EUR');
    expect(result.currenciesDetected).toContain('GBP');
  });

  it('detects currency selector', () => {
    const result = detectLocalization('', '<select class="currency-selector">');
    expect(result.multiCurrency).toBe(true);
  });
});

describe('detectMarketplaces', () => {
  it('detects Amazon', () => {
    const result = detectMarketplaces('Also available on Amazon.com', '');
    expect(result.detected).toBe(true);
    expect(result.marketplaces).toContain('Amazon');
  });

  it('detects Faire', () => {
    const result = detectMarketplaces('Shop wholesale on Faire.com', '');
    expect(result.detected).toBe(true);
    expect(result.marketplaces).toContain('Faire');
  });

  it('detects Nordstrom', () => {
    const result = detectMarketplaces('Find us at Nordstrom stores', '');
    expect(result.detected).toBe(true);
    expect(result.marketplaces).toContain('Nordstrom');
  });

  it('detects multiple marketplaces', () => {
    const text = 'Shop on Amazon.com or sold at Nordstrom stores';
    const result = detectMarketplaces(text, '');
    expect(result.marketplaces).toContain('Amazon');
    expect(result.marketplaces).toContain('Nordstrom');
  });

  it('returns empty for direct-to-consumer only', () => {
    const result = detectMarketplaces('Shop direct at our store', '');
    expect(result.detected).toBe(false);
    expect(result.marketplaces.length).toBe(0);
  });
});

describe('detectGWP', () => {
  it('detects "gift with purchase"', () => {
    const result = detectGWP('Free gift with purchase over $75');
    expect(result.detected).toBe(true);
  });

  it('detects "free gift"', () => {
    const result = detectGWP('Choose your free gift at checkout');
    expect(result.detected).toBe(true);
  });

  it('detects spend threshold promotions', () => {
    const result = detectGWP('Spend $100 and receive a free tote');
    expect(result.detected).toBe(true);
  });

  it('detects GWP abbreviation', () => {
    const result = detectGWP('Current GWP: Deluxe sample set');
    expect(result.detected).toBe(true);
  });
});

describe('detectBNPLWidgets', () => {
  it('detects Afterpay widget', () => {
    const result = detectBNPLWidgets('Pay in 4 interest-free payments with Afterpay', '');
    expect(result.detected).toBe(true);
    expect(result.providers).toContain('Afterpay');
  });

  it('detects Klarna widget', () => {
    const result = detectBNPLWidgets('Pay later with Klarna', '');
    expect(result.detected).toBe(true);
    expect(result.providers).toContain('Klarna');
  });

  it('detects Affirm widget', () => {
    const result = detectBNPLWidgets('Starting at $10/mo with Affirm', '');
    expect(result.detected).toBe(true);
    expect(result.providers).toContain('Affirm');
  });

  it('detects Sezzle widget', () => {
    const result = detectBNPLWidgets('Pay in 4 with Sezzle', '');
    expect(result.detected).toBe(true);
    expect(result.providers).toContain('Sezzle');
  });

  it('detects Shop Pay Installments', () => {
    const result = detectBNPLWidgets('4 interest-free payments with Shop Pay Installments', '');
    expect(result.detected).toBe(true);
    expect(result.providers).toContain('Shop Pay Installments');
  });

  it('detects generic "buy now pay later"', () => {
    const result = detectBNPLWidgets('Buy now, pay later options available', '');
    expect(result.detected).toBe(true);
  });

  it('returns multiple providers if present', () => {
    const text = 'Pay in 4 with Afterpay. Also available: pay later with Klarna.';
    const result = detectBNPLWidgets(text, '');
    expect(result.providers).toContain('Afterpay');
    expect(result.providers).toContain('Klarna');
  });
});
