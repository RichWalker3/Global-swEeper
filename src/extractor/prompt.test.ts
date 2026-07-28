import { describe, expect, it } from 'vitest';
import { buildPrompt, summarizeCrawlForPrompt } from './prompt.js';
import { buildMinimalScrapeResult } from '../test/fixtures/scrapeResult.js';

describe('summarizeCrawlForPrompt', () => {
  it('trims Wappalyzer technologies from the prompt payload', () => {
    const summary = buildMinimalScrapeResult().summary;
    const trimmed = summarizeCrawlForPrompt(summary);

    expect(trimmed.technologies).toBeUndefined();
    expect(trimmed.returnProvider).toBe('Loop Returns');
    expect(trimmed.thirdPartiesDetected).toEqual(['Loop Returns', 'Klaviyo']);
  });
});

describe('buildPrompt', () => {
  it('does not instruct agents to use Status: Canceled', () => {
    const scrapeResult = buildMinimalScrapeResult();
    const { system, user } = buildPrompt(scrapeResult);

    expect(system).not.toMatch(/Use \*\*Status: Canceled\*\*/);
    expect(user).not.toMatch(/Use \*\*Status: Canceled\*\*/);
    expect(system).toContain('Never write "No WA evidence found." or use Status: Canceled');
    expect(system).toContain('HubSpot/Sales-primary BRDs');
    expect(system).toContain('BRD-001, BRD-002, BRD-003, BRD-004, BRD-005, BRD-007, BRD-010');
  });

  it('includes trimmed crawl summary instead of the full summary object', () => {
    const scrapeResult = buildMinimalScrapeResult();
    const { user } = buildPrompt(scrapeResult);

    expect(user).toContain('"returnProvider": "Loop Returns"');
    expect(user).not.toContain('"technologies"');
    expect(user).toContain('Focus guidance');
  });
});
