import { describe, expect, it } from 'vitest';
import { buildEvidenceCoverageReport } from './coverageReport.js';
import type { CrawlSummary } from './types.js';

function baseSummary(overrides: Partial<CrawlSummary> = {}): CrawlSummary {
  return {
    seedUrl: 'https://merchant.test',
    domain: 'merchant.test',
    startedAt: '2026-07-29T00:00:00.000Z',
    completedAt: '2026-07-29T00:01:00.000Z',
    pagesVisited: 10,
    pagesBlocked: 0,
    checkoutReached: false,
    selectedPlatform: { id: 'sfcc', label: 'SFCC' },
    errors: [],
    thirdPartiesDetected: ['PayPal'],
    technologies: [],
    redFlags: [],
    dangerousGoods: [],
    b2bIndicators: [],
    dropshipIndicators: [],
    productPagesScraped: 0,
    policyInfo: { returnProvider: 'Narvar', freeReturns: true },
    ...overrides,
  };
}

describe('buildEvidenceCoverageReport', () => {
  it('marks strong coverage when crawl and checkout both succeeded', () => {
    const report = buildEvidenceCoverageReport(
      baseSummary({
        checkoutReached: true,
        productPagesScraped: 2,
        checkoutInfo: {
          expressWallets: ['PayPal'],
          paymentMethods: ['Visa'],
          bnplOptions: ['Affirm'],
          giftCardOption: false,
          shippingOptions: ['Standard'],
          checkoutType: 'SFCC checkout',
        },
      })
    );

    expect(report.level).toBe('strong');
    expect(report.headline).toMatch(/Strong coverage/i);
    expect(report.howToProceed).toMatch(/Copy the prompt/i);
    expect(report.gathered).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Site pages crawled'),
        expect.stringContaining('Checkout page reached'),
        expect.stringContaining('Checkout payment'),
      ])
    );
    expect(report.missing).not.toEqual(expect.arrayContaining([expect.stringContaining('Checkout page')]));
    expect(report.notes.some((note) => /best-effort/i.test(note))).toBe(true);
  });

  it('keeps SFCC runs usable when checkout was skipped after rate limits', () => {
    const report = buildEvidenceCoverageReport(
      baseSummary({
        checkoutSkipped: true,
        checkoutStoppedAt: 'skipped: rate limited during crawl (best-effort checkout)',
        scrapeQuality: {
          level: 'degraded',
          browserRestarts: 0,
          pagesFullCapture: 10,
          pagesDegradedCapture: 0,
          discoveryUsedFallbackUrls: false,
          degradedReasons: ['rate_limited'],
        },
      })
    );

    expect(report.level).toBe('usable');
    expect(report.headline).toMatch(/Useful SFCC evidence/i);
    expect(report.whatHappened).toMatch(/best-effort/i);
    expect(report.howToProceed).toMatch(/fill in/i);
    expect(report.howToProceed).toMatch(/checkout/i);
    expect(report.gathered).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Site pages crawled'),
        expect.stringContaining('Policy'),
        expect.stringContaining('Apps'),
      ])
    );
    expect(report.missing.some((item) => /Checkout page/i.test(item))).toBe(true);
    expect(report.notes.some((note) => /rate-limited/i.test(note))).toBe(true);
  });

  it('reports blocked guidance when bot wall prevented any pages', () => {
    const report = buildEvidenceCoverageReport(
      baseSummary({
        pagesVisited: 0,
        productPagesScraped: 0,
        thirdPartiesDetected: [],
        policyInfo: undefined,
        botDetectionWarning: 'Automated crawl was blocked by perimeterx.',
      })
    );

    expect(report.level).toBe('blocked');
    expect(report.headline).toMatch(/Blocked/i);
    expect(report.howToProceed).toMatch(/Do not draft the WA from this run alone/i);
    expect(report.missing).toEqual(
      expect.arrayContaining([expect.stringContaining('Site pages')])
    );
    expect(report.notes.some((note) => /perimeterx/i.test(note))).toBe(true);
  });

  it('tells users to fill in more on thin partial runs', () => {
    const report = buildEvidenceCoverageReport(
      baseSummary({
        pagesVisited: 3,
        thirdPartiesDetected: [],
        policyInfo: undefined,
        productPagesScraped: 0,
      })
    );

    expect(report.level).toBe('partial');
    expect(report.headline).toMatch(/Partial evidence/i);
    expect(report.howToProceed).toMatch(/fill in/i);
  });
});
