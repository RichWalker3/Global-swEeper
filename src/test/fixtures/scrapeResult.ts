import type { CrawlSummary, PageData, ScrapeResult } from '../../scraper/types.js';

export function buildMinimalScrapeResult(overrides: Partial<CrawlSummary> = {}): ScrapeResult {
  const summary: CrawlSummary = {
    seedUrl: 'https://example.com',
    domain: 'example.com',
    startedAt: '2026-07-10T12:00:00.000Z',
    completedAt: '2026-07-10T12:01:00.000Z',
    pagesVisited: 3,
    pagesBlocked: 0,
    checkoutReached: false,
    checkoutSkipped: true,
    errors: [],
    thirdPartiesDetected: ['Loop Returns', 'Klaviyo'],
    technologies: [
      {
        name: 'Shopify',
        confidence: '100',
        version: null,
        icon: 'Shopify.svg',
        website: 'https://shopify.com',
        categories: [{ CMS: 'cms' }],
      },
      {
        name: 'Google Analytics',
        confidence: '100',
        version: '4',
        icon: 'Google Analytics.svg',
        website: 'https://google.com/analytics',
        categories: [{ Analytics: 'analytics' }],
      },
    ],
    redFlags: [],
    dangerousGoods: [],
    b2bIndicators: [],
    dropshipIndicators: [],
    productPagesScraped: 1,
    policyInfo: {
      returnProvider: 'Loop Returns',
      returnPortal: 'merchant.loopreturns.com',
    },
    catalogFeatures: {
      bundlesDetected: false,
      bundleEvidence: [],
      customizableProducts: false,
      customizationTypes: [],
      virtualProducts: false,
      virtualProductTypes: [],
      giftCardsDetected: false,
      giftCardTypes: [],
      subscriptionsDetected: false,
      preOrdersDetected: false,
      gwpDetected: false,
    },
    ...overrides,
  };

  const pages: PageData[] = [
    {
      url: 'https://example.com/returns',
      title: 'Returns',
      cleanedText: 'Returns & Exchanges Portal',
      excerpt: 'Returns & Exchanges Portal',
      evidenceText: 'Returns & Exchanges Portal',
      rawHtml: '<a href="https://merchant.loopreturns.com/">Portal</a>',
      matchedCategories: ['returns'],
      keyPhrases: ['returns'],
      networkRequests: [],
      timestamp: summary.completedAt,
    },
  ];

  return { summary, pages };
}

export function buildBrdParentFixture() {
  return {
    key: 'SOPP-TEST',
    summary: 'Test Merchant SOPP',
    subtasks: [
      {
        key: 'SOPP-100',
        summary: 'BRD-001 Hub locations and entities',
        status: 'Open',
        phaseText: '',
        seOutputText: '',
        descriptionText: 'Hub locations',
      },
      {
        key: 'SOPP-099',
        summary: 'BRD-002 3PL / Shipping Platform',
        status: 'Open',
        phaseText: '',
        seOutputText: '',
        descriptionText: '3PL',
      },
      {
        key: 'SOPP-101',
        summary: 'BRD-025 Pre-orders',
        status: 'Open',
        phaseText: '',
        seOutputText: '',
        descriptionText: 'Pre-order handling',
      },
      {
        key: 'SOPP-102',
        summary: 'BRD-030 Returns platform',
        status: 'Open',
        phaseText: 'in Scope',
        seOutputText: 'Existing returns note',
        descriptionText: 'Returns vendor',
      },
    ],
  };
}
