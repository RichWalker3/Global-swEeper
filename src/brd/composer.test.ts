import { describe, expect, it } from 'vitest';
import { composeBrdReview } from './composer.js';
import { buildBrdParentFixture } from '../test/fixtures/scrapeResult.js';

describe('composeBrdReview', () => {
  it('defaults no-signal BRDs to out_of_scope phase without status change', () => {
    const parent = buildBrdParentFixture();
    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: '## Merchant Overview\n- **Brand:** Test Merchant',
      merchantName: 'Test Merchant',
    });

    const preOrders = result.rows.find((row) => row.requirementId === 'BRD-025');
    expect(preOrders?.statusAction).toBeUndefined();
    expect(preOrders?.phaseAction).toBe('out_of_scope');
  });

  it('maps Done WA lines to done status and in_scope phase', () => {
    const parent = buildBrdParentFixture();
    const markdown = `
## BRD Output for Sweep
- BRD-030 | Returns platform | Status: Done | SE Output: Loop Returns portal linked from returns page.
`;

    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: markdown,
      merchantName: 'Test Merchant',
    });

    const returns = result.rows.find((row) => row.requirementId === 'BRD-030');
    expect(returns?.statusAction).toBe('done');
    expect(returns?.phaseAction).toBe('in_scope');
    expect(returns?.finalText).toContain('Loop Returns');
  });

  it('maps legacy Canceled WA lines to out_of_scope without status transition', () => {
    const parent = buildBrdParentFixture();
    const markdown = `
## BRD Output for Sweep
- BRD-025 | Pre-orders | Status: Canceled | SE Output: No WA evidence found.
`;

    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: markdown,
      merchantName: 'Test Merchant',
    });

    const row = result.rows.find((item) => item.requirementId === 'BRD-025');
    expect(row?.statusAction).toBeUndefined();
    expect(row?.phaseAction).toBe('out_of_scope');
    expect(row?.finalText).not.toContain('No WA evidence found.');
  });
});
