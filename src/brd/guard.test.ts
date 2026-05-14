import { describe, expect, it } from 'vitest';
import { normalizeSoppKey, requireSoppKey } from './guard.js';

describe('BRD SOPP guard', () => {
  it('normalizes SOPP keys from plain keys or URLs', () => {
    expect(normalizeSoppKey('7431')).toBe('SOPP-7431');
    expect(normalizeSoppKey('sopp-7431')).toBe('SOPP-7431');
    expect(normalizeSoppKey('https://global-e.atlassian.net/browse/SOPP-7431')).toBe('SOPP-7431');
  });

  it('rejects missing or non-SOPP issue keys', () => {
    expect(normalizeSoppKey(undefined)).toBeUndefined();
    expect(normalizeSoppKey('PSINT-123')).toBeUndefined();
    expect(() => requireSoppKey('PSINT-123')).toThrow('Provide a top-level SOPP key');
  });
});
