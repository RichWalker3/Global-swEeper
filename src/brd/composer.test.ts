import { describe, expect, it } from 'vitest';
import { composeBrdReview } from './composer.js';
import type { BrdParentContext } from './types.js';

describe('BRD composer', () => {
  it('merges existing Jira value with WA legacy signal nuance', () => {
    const parent: BrdParentContext = {
      key: 'SOPP-7431',
      summary: 'BRD Parent',
      subtasks: [
        {
          key: 'SOPP-7448',
          summary: 'BRD-014 - Loyalty & Reward',
          descriptionText: 'Jira description context.',
          seOutputText: 'HubSpot says no loyalty.',
        },
      ],
    };

    const result = composeBrdReview({
      merchantName: 'Example Brand',
      parent,
      websiteAssessmentMarkdown: 'Old Smile.io loyalty script/code found, but no visible loyalty UI found.',
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].jiraDescriptionText).toContain('Jira description context');
    expect(result.rows[0].existingText).toContain('HubSpot says no loyalty');
    expect(result.rows[0].conflictNote).toContain('old loyalty script/code signals');
    expect(result.rows[0].finalText).toContain('Existing SE scoping output value');
    expect(result.rows[0].finalText).toContain('old loyalty script/code signals');
  });

  it('prefills SE output and status from the LLM BRD section', () => {
    const parent: BrdParentContext = {
      key: 'SOPP-7431',
      summary: 'BRD Parent',
      subtasks: [
        {
          key: 'SOPP-7448',
          summary: 'BRD-014 - Loyalty & Reward',
          status: 'New',
        },
        {
          key: 'SOPP-7449',
          summary: 'BRD-015 - Gift Cards',
          status: 'New',
        },
      ],
    };

    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: [
        '## BRD Output for Sweep',
        '- BRD-014 | Loyalty & Reward | Status: Done | SE Output: Loyalty program visible in footer with rewards account flow.',
        '- BRD-015 | Gift Cards | Status: Canceled | SE Output: No WA evidence found.',
      ].join('\n'),
    });

    const loyalty = result.rows.find((row) => row.requirementId === 'BRD-014');
    const giftCards = result.rows.find((row) => row.requirementId === 'BRD-015');

    expect(loyalty?.finalText).toBe('Loyalty program visible in footer with rewards account flow.');
    expect(loyalty?.statusAction).toBe('done');
    expect(giftCards?.finalText).toBe('No WA evidence found.');
    expect(giftCards?.statusAction).toBe('canceled');
  });

  it('builds manual editable rows when WA and notes are blank', () => {
    const parent: BrdParentContext = {
      key: 'SOPP-7431',
      summary: 'BRD Parent',
      subtasks: [
        {
          key: 'SOPP-7448',
          summary: 'BRD-014 - Loyalty & Reward',
          status: 'New',
          descriptionText: 'Capture loyalty scope here.',
        },
        {
          key: 'SOPP-7449',
          summary: 'BRD-015 - Gift Cards',
          status: 'New',
          seOutputText: 'Existing gift card note.',
        },
      ],
    };

    const result = composeBrdReview({
      parent,
      websiteAssessmentMarkdown: '',
      additionalNotes: '',
    });

    const loyalty = result.rows.find((row) => row.requirementId === 'BRD-014');
    const giftCards = result.rows.find((row) => row.requirementId === 'BRD-015');

    expect(result.rows).toHaveLength(2);
    expect(loyalty?.finalText).toBe('');
    expect(loyalty?.statusAction).toBeUndefined();
    expect(loyalty?.jiraDescriptionText).toBe('Capture loyalty scope here.');
    expect(giftCards?.finalText).toBe('Existing gift card note.');
  });
});
