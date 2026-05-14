import { describe, expect, it } from 'vitest';
import { generateBrdDraft } from './generator.js';
import type { BrdParentContext } from './types.js';

const parent: BrdParentContext = {
  key: 'SOPP-7431',
  summary: 'BRD Lead Test',
  status: 'In Progress',
  subtasks: [
    { key: 'SOPP-7447', summary: 'BRD-013 - Subscriptions' },
    { key: 'SOPP-7450', summary: 'BRD-016 - Dangerous Goods' },
  ],
};

describe('BRD draft generation', () => {
  it('maps WA text signals to BRD rows and parent-scoped Jira subtasks', () => {
    const result = generateBrdDraft({
      merchantName: 'Example Brand',
      parent,
      websiteAssessmentMarkdown: [
        '# Website Assessment',
        'Subscriptions are detected via Recharge on the PDP.',
        'Dangerous goods signal: fragrance products found in catalog.',
      ].join('\n'),
    });

    const subscriptions = result.rows.find((row) => row.requirementId === 'BRD-013');
    const dangerousGoods = result.rows.find((row) => row.requirementId === 'BRD-016');

    expect(subscriptions?.jiraKey).toBe('SOPP-7447');
    expect(subscriptions?.scopeValue).toBe('Unconfirmed');
    expect(dangerousGoods?.jiraKey).toBe('SOPP-7450');
    expect(result.outputs.matrixMarkdown).toContain('BRD-013');
    expect(result.outputs.jiraUpdatePlan).toContain('SOPP-7431 - BRD Lead Test');
  });

  it('does not mark missing evidence as out of scope', () => {
    const result = generateBrdDraft({
      merchantName: 'Example Brand',
      websiteAssessmentMarkdown: '',
    });

    const b2b = result.rows.find((row) => row.requirementId === 'BRD-012');
    expect(b2b?.scopeValue).toBe('No signal found');
    expect(b2b?.openQuestions[0]).toContain('BRD-012');
  });

  it('only attaches Jira keys returned under the validated parent', () => {
    const result = generateBrdDraft({
      merchantName: 'Example Brand',
      parent,
      websiteAssessmentMarkdown: 'Marketplace and B2B signals were found.',
    });

    const marketplace = result.rows.find((row) => row.requirementId === 'BRD-011');
    const b2b = result.rows.find((row) => row.requirementId === 'BRD-012');

    expect(marketplace?.scopeValue).toBe('Unconfirmed');
    expect(marketplace?.jiraKey).toBeUndefined();
    expect(b2b?.scopeValue).toBe('Unconfirmed');
    expect(b2b?.jiraKey).toBeUndefined();
  });
});
