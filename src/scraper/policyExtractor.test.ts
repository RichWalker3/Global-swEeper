import { describe, expect, it } from 'vitest';
import { detectReturnPortal, extractPolicyInfo } from './policyExtractor.js';

describe('detectReturnPortal', () => {
  it('detects Loop Returns from href when vendor name is absent from visible text', () => {
    const html = `
      <a href="https://alexandani-us.loopreturns.com/#/">Returns & Exchanges Portal</a>
    `;

    const result = detectReturnPortal([html]);

    expect(result.returnProvider).toBe('Loop Returns');
    expect(result.returnPortal).toMatch(/loopreturns\.com/i);
  });

  it('detects ReturnGO from visible text', () => {
    const result = detectReturnPortal(['Start your return at returns.returngo.ai']);

    expect(result.returnProvider).toBe('ReturnGO');
  });
});

describe('extractPolicyInfo', () => {
  it('merges href portal detection into policy extraction', () => {
    const text = 'Returns & Exchanges Portal';
    const html = '<a href="https://merchant.loopreturns.com/">Portal</a>';

    const result = extractPolicyInfo(text, 'https://example.com/returns', html);

    expect(result.returnProvider).toBe('Loop Returns');
  });
});
