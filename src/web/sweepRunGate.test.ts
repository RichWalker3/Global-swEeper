import { describe, it, expect, beforeEach } from 'vitest';
import {
  acquireSweepRunSlot,
  getActiveSweepRunCount,
  getSweepRunQueueDepth,
  hostedMaxConcurrentAssessments,
  resetSweepRunGateForTests,
} from './sweepRunGate.js';

describe('hostedMaxConcurrentAssessments', () => {
  it('defaults to 1 in production and 2 in development', () => {
    expect(hostedMaxConcurrentAssessments({ NODE_ENV: 'production' })).toBe(1);
    expect(hostedMaxConcurrentAssessments({ NODE_ENV: 'development' })).toBe(2);
  });

  it('respects SWEEP_MAX_CONCURRENT_ASSESSMENTS when valid', () => {
    expect(
      hostedMaxConcurrentAssessments({
        NODE_ENV: 'production',
        SWEEP_MAX_CONCURRENT_ASSESSMENTS: '3',
      })
    ).toBe(3);
  });

  it('ignores invalid SWEEP_MAX_CONCURRENT_ASSESSMENTS values', () => {
    expect(
      hostedMaxConcurrentAssessments({
        NODE_ENV: 'production',
        SWEEP_MAX_CONCURRENT_ASSESSMENTS: '0',
      })
    ).toBe(1);
  });
});

describe('acquireSweepRunSlot', () => {
  beforeEach(() => {
    resetSweepRunGateForTests();
  });

  it('acquires immediately when under the concurrency limit', async () => {
    const slot = await acquireSweepRunSlot({ NODE_ENV: 'production', SWEEP_MAX_CONCURRENT_ASSESSMENTS: '1' });
    expect(slot.waitedMs).toBe(0);
    expect(slot.activeAfterAcquire).toBe(1);
    expect(getActiveSweepRunCount()).toBe(1);
    slot.release();
    expect(getActiveSweepRunCount()).toBe(0);
  });

  it('queues extra assessments until an active run releases its slot', async () => {
    const env = { NODE_ENV: 'production', SWEEP_MAX_CONCURRENT_ASSESSMENTS: '1' };
    const first = await acquireSweepRunSlot(env);
    expect(getActiveSweepRunCount()).toBe(1);

    let secondResolved = false;
    const secondPromise = acquireSweepRunSlot(env).then((slot) => {
      secondResolved = true;
      return slot;
    });

    await Promise.resolve();
    expect(secondResolved).toBe(false);
    expect(getSweepRunQueueDepth()).toBe(1);

    first.release();
    const second = await secondPromise;
    expect(second.activeAfterAcquire).toBe(1);
    expect(getSweepRunQueueDepth()).toBe(0);
    second.release();
  });
});
