import { describe, expect, it } from 'vitest';
import { buildBrdRows } from './mapper.js';
import type { BrdParentContext } from './types.js';

const parent: BrdParentContext = {
  key: 'SOPP-1',
  summary: 'Test merchant',
  subtasks: [
    { key: 'SOPP-2', summary: 'BRD-025 Pre-orders' },
    { key: 'SOPP-3', summary: 'BRD-030 Returns platform' },
  ],
};

describe('buildBrdRows BRD parsing', () => {
  it('maps Done lines to status done', () => {
    const markdown = `
## BRD Output for Sweep
- BRD-030 | Returns platform | Status: Done | SE Output: Loop Returns portal linked from returns page.
`;

    const rows = buildBrdRows({
      parent,
      websiteAssessmentMarkdown: markdown,
    });

    const row = rows.find((item) => item.requirementId === 'BRD-030');
    expect(row?.recommendedStatusAction).toBe('done');
    expect(row?.llmSeOutputText).toContain('Loop Returns');
  });

  it('maps legacy Canceled lines to out_of_scope phase without status transition', () => {
    const markdown = `
## BRD Output for Sweep
- BRD-025 | Pre-orders | Status: Canceled | SE Output: No WA evidence found.
`;

    const rows = buildBrdRows({
      parent,
      websiteAssessmentMarkdown: markdown,
    });

    const row = rows.find((item) => item.requirementId === 'BRD-025');
    expect(row?.recommendedStatusAction).toBeUndefined();
    expect(row?.recommendedPhaseAction).toBe('out_of_scope');
    expect(row?.llmSeOutputText).toBeUndefined();
  });

  it('defaults no-signal BRDs to out_of_scope phase', () => {
    const rows = buildBrdRows({
      parent,
      websiteAssessmentMarkdown: '',
    });

    const row = rows.find((item) => item.requirementId === 'BRD-025');
    expect(row?.scopeValue).toBe('No signal found');
    expect(row?.recommendedPhaseAction).toBe('out_of_scope');
  });
});
