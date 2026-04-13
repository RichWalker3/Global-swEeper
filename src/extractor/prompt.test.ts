import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt.js';
import type { ScrapeResult } from '../scraper/types.js';

function makeScrapeResult(): ScrapeResult {
  return {
    summary: {
      seedUrl: 'https://example.com',
      domain: 'example.com',
      startedAt: '2026-04-08T00:00:00.000Z',
      completedAt: '2026-04-08T00:05:00.000Z',
      pagesVisited: 2,
      pagesBlocked: 0,
      checkoutReached: false,
      checkoutSkipped: true,
      errors: [],
      thirdPartiesDetected: ['Shop Pay'],
      technologies: [],
      redFlags: [],
      dangerousGoods: [],
      b2bIndicators: [],
      dropshipIndicators: [],
      productPagesScraped: 1,
    },
    pages: [
      {
        url: 'https://example.com/pages/payments',
        title: 'Payments',
        cleanedText: 'Pay with Shop Pay, PayPal, Klarna, and major cards.',
        excerpt: 'Pay with Shop Pay, PayPal, Klarna, and major cards.',
        evidenceText: 'Pay with Shop Pay, PayPal, Klarna, and major cards.',
        matchedCategories: ['payments'],
        keyPhrases: ['Shop Pay', 'PayPal', 'Klarna'],
        networkRequests: [],
        timestamp: '2026-04-08T00:01:00.000Z',
      },
      {
        url: 'https://example.com/blog/story',
        title: 'Story',
        cleanedText: 'Brand story only.',
        excerpt: 'Brand story only.',
        evidenceText: 'Brand story only.',
        matchedCategories: [],
        keyPhrases: ['brand story'],
        networkRequests: [],
        timestamp: '2026-04-08T00:02:00.000Z',
      },
    ],
  };
}

describe('buildPrompt', () => {
  it('promotes payments pages into the high-signal tier', () => {
    const prompt = buildPrompt(makeScrapeResult());
    expect(prompt.user).toContain('### High-Signal Pages (Full Content)');
    expect(prompt.user).toContain('https://example.com/pages/payments');
  });

  it('can request JSON output for the extractor path', () => {
    const prompt = buildPrompt(makeScrapeResult(), { responseFormat: 'json' });
    expect(prompt.user).toContain('Return a single valid JSON object');
    expect(prompt.user).toContain('- meta');
    expect(prompt.user).not.toContain('Respond with ONLY the Markdown');
  });
});
