/**
 * Limits concurrent full-browser assessments in hosted deployments.
 * Extra requests wait in a FIFO queue rather than launching overlapping Chromium instances.
 */

export interface SweepRunSlot {
  release: () => void;
  waitedMs: number;
  activeAfterAcquire: number;
}

let activeRuns = 0;
const waitQueue: Array<{ resolve: (slot: SweepRunSlot) => void; enqueuedAt: number }> = [];

export function hostedMaxConcurrentAssessments(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SWEEP_MAX_CONCURRENT_ASSESSMENTS;
  if (raw !== undefined && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return env.NODE_ENV === 'production' ? 1 : 2;
}

export function getActiveSweepRunCount(): number {
  return activeRuns;
}

export function getSweepRunQueueDepth(): number {
  return waitQueue.length;
}

export function resetSweepRunGateForTests(): void {
  activeRuns = 0;
  waitQueue.length = 0;
}

export async function acquireSweepRunSlot(env: NodeJS.ProcessEnv = process.env): Promise<SweepRunSlot> {
  const maxConcurrent = hostedMaxConcurrentAssessments(env);
  const enqueuedAt = Date.now();

  if (activeRuns < maxConcurrent) {
    activeRuns += 1;
    return {
      activeAfterAcquire: activeRuns,
      waitedMs: 0,
      release: () => releaseSweepRunSlot(),
    };
  }

  return new Promise<SweepRunSlot>((resolve) => {
    waitQueue.push({
      enqueuedAt,
      resolve: (slot) => resolve(slot),
    });
  });
}

function releaseSweepRunSlot(): void {
  activeRuns = Math.max(0, activeRuns - 1);
  const next = waitQueue.shift();
  if (!next) return;

  activeRuns += 1;
  next.resolve({
    activeAfterAcquire: activeRuns,
    waitedMs: Date.now() - next.enqueuedAt,
    release: () => releaseSweepRunSlot(),
  });
}
