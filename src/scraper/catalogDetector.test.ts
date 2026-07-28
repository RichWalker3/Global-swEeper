import { describe, expect, it } from 'vitest';
import { detectPreOrders } from './catalogDetector.js';

describe('detectPreOrders', () => {
  it('does not treat notify-me back-in-stock copy as pre-order', () => {
    const text = 'Sold Out. Notify Me When Available';
    const result = detectPreOrders(text, '');

    expect(result.detected).toBe(false);
    expect(result.evidence).toHaveLength(0);
  });

  it('detects true pre-order signals', () => {
    const text = 'Pre-order now. Ships on March 15, 2026.';
    const result = detectPreOrders(text, '');

    expect(result.detected).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('detects pre-order UI classes in html', () => {
    const html = '<button class="pre-order-button">Pre-order</button>';
    const result = detectPreOrders('', html);

    expect(result.detected).toBe(true);
  });
});
