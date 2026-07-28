import { describe, expect, it } from 'vitest';
import { composeBrdReview, CONFIRM_WITH_SALES_PREFIX, NO_EVIDENCE_SE_OUTPUT } from './composer.js';
import { buildBrdParentFixture } from '../test/fixtures/scrapeResult.js';

describe('composeBrdReview', () => {
  it('defaults no-signal BRDs to out_of_scope phase with short SE Output', () => {
    const parent = buildBrdParentFixture();
    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: '## Merchant Overview\n- **Brand:** Test Merchant',
      merchantName: 'Test Merchant',
    });

    const preOrders = result.rows.find((row) => row.requirementId === 'BRD-025');
    expect(preOrders?.statusAction).toBeUndefined();
    expect(preOrders?.phaseAction).toBe('out_of_scope');
    expect(preOrders?.finalText).toBe(NO_EVIDENCE_SE_OUTPUT);
  });

  it('writes short no-evidence note for HubSpot-primary BRDs without changing phase', () => {
    const parent = buildBrdParentFixture();
    const hub = parent.subtasks.find((subtask) => /BRD-002|3PL/i.test(subtask.summary));
    if (hub) hub.seOutputText = 'HubSpot: uses Flexport';

    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: '## Merchant Overview\n- **Brand:** Test Merchant',
      merchantName: 'Test Merchant',
    });

    const row = result.rows.find((item) => item.requirementId === 'BRD-002');
    expect(row?.statusAction).toBeUndefined();
    expect(row?.phaseAction).toBeUndefined();
    expect(row?.finalText).toBe(NO_EVIDENCE_SE_OUTPUT);
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

  it('prefixes Confirm with Sales when WA evidence conflicts with HubSpot notes', () => {
    const parent = buildBrdParentFixture();
    const returns = parent.subtasks.find((subtask) => /BRD-030|Returns/i.test(subtask.summary));
    if (returns) returns.seOutputText = 'No - out of scope / not interested';

    const markdown = `
## BRD Output for Sweep
- BRD-030 | Returns platform | Status: Done | SE Output: Loop Returns portal linked from returns page.
`;

    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: markdown,
      merchantName: 'Test Merchant',
    });

    const row = result.rows.find((item) => item.requirementId === 'BRD-030');
    expect(row?.finalText).toBe(
      `${CONFIRM_WITH_SALES_PREFIX}\n\nLoop Returns portal linked from returns page.`
    );
  });

  it('keeps WA findings for HubSpot-primary BRDs when evidence exists', () => {
    const parent = buildBrdParentFixture();
    const hub = parent.subtasks.find((subtask) => /BRD-001|Hub locations/i.test(subtask.summary));
    if (hub) hub.seOutputText = 'Sales: US + EU hubs';

    const markdown = `
## BRD Output for Sweep
- BRD-001 | Hub locations and entities | Status: Done | SE Output: Store locations listed on website.
`;

    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: markdown,
      merchantName: 'Test Merchant',
    });

    const row = result.rows.find((item) => item.requirementId === 'BRD-001');
    expect(row?.statusAction).toBe('done');
    expect(row?.phaseAction).toBe('in_scope');
    expect(row?.finalText).toBe('Store locations listed on website.');
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
    expect(row?.finalText).toBe(NO_EVIDENCE_SE_OUTPUT);
  });
});
