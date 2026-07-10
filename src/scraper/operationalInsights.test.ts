import { describe, expect, it } from 'vitest';
import { detectBrdRelevantFindings } from './operationalInsights.js';

describe('BRD-relevant findings', () => {
  it('detects bot challenges and SFCC action endpoints', () => {
    const insights = detectBrdRelevantFindings(
      'Press & Hold to confirm you are a human.',
      '<a href="/on/demandware.store/Sites-brand-Site/default/Cart-RedirectToShipping">Checkout</a>',
      'https://merchant.test/'
    );

    expect(insights.map((insight) => insight.type)).toEqual(expect.arrayContaining([
      'bot_verification',
      'sfcc_endpoint',
    ]));
    expect(insights.find((insight) => insight.type === 'bot_verification')).toMatchObject({
      severity: 'high',
      brdIds: [],
      useFor: 'coverage_note',
    });
    expect(insights.find((insight) => insight.type === 'sfcc_endpoint')?.brdIds).toContain('BRD-027');
  });

  it('detects payment and fulfillment restrictions from policy text', () => {
    const insights = detectBrdRelevantFindings(
      [
        'Cards issued by banks outside the United States are not accepted.',
        'Multiple card payments are not accepted.',
        'Buy online, pick up in store orders may create separate order numbers.',
      ].join(' '),
      '',
      'https://merchant.test/payment-methods'
    );

    expect(insights.map((insight) => insight.label)).toEqual(expect.arrayContaining([
      'Foreign-issued card restriction',
      'Split tender restriction',
      'BOPIS / mixed fulfillment',
    ]));
    expect(insights.find((insight) => insight.label === 'BOPIS / mixed fulfillment')?.brdIds).toEqual([
      'BRD-006',
      'BRD-009',
    ]);
  });

  it('detects GWP, DG assets, custom orders, marketplace exclusions, and Borderfree', () => {
    const insights = detectBrdRelevantFindings(
      [
        'Gift With Purchase items cannot be returned or exchanged.',
        'Wolverine 1000 Mile Custom orders ship after production and are not eligible for return or exchange.',
        'Marketplace prices from third-party sellers are excluded.',
      ].join(' '),
      [
        '<a href="/on/demandware.store/Sites-brand-Site/default/Borderfree-NewBFOrder">Borderfree</a>',
        '<a href="/on/demandware.static/-/Sites-master-catalog/default/sds/26204698_SDS.pdf">Safety Data Sheet Wallflowers Home Fragrance</a>',
      ].join(''),
      'https://merchant.test/returns'
    );

    expect(insights.map((insight) => insight.type)).toEqual(expect.arrayContaining([
      'promotion_gwp',
      'custom_order',
      'marketplace_exclusion',
      'cross_border_provider',
      'dangerous_goods_asset',
    ]));
    expect(insights.find((insight) => insight.type === 'dangerous_goods_asset')?.brdIds).toEqual(['BRD-016']);
    expect(insights.find((insight) => insight.type === 'promotion_gwp')?.brdIds).toEqual(['BRD-014', 'BRD-024']);
  });
});
