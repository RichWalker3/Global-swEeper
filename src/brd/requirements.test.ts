import { describe, expect, it } from 'vitest';
import { BRD_REQUIREMENTS, findRequirementBySummary } from './requirements.js';

describe('BRD requirements catalog', () => {
  it('contains the BRD-001 through BRD-030 playbook items', () => {
    expect(BRD_REQUIREMENTS).toHaveLength(30);
    expect(BRD_REQUIREMENTS[0].id).toBe('BRD-001');
    expect(BRD_REQUIREMENTS.at(-1)?.id).toBe('BRD-030');
  });

  it('maps a Jira summary to its requirement', () => {
    const requirement = findRequirementBySummary('BRD-013 - Subscriptions');
    expect(requirement?.id).toBe('BRD-013');
    expect(requirement?.gate).toBe('SIGN');
  });
});
