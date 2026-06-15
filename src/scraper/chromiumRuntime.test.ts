import { describe, it, expect } from 'vitest';
import { buildChromiumLaunchArgs, readChromiumRuntimeConfig } from './chromiumRuntime.js';

describe('chromiumRuntime', () => {
  it('uses /tmp instead of /dev/shm by default in containers', () => {
    const args = buildChromiumLaunchArgs({ width: 1440, height: 900 }, {});
    expect(args).toContain('--disable-dev-shm-usage');
  });

  it('allows /dev/shm when SWEEP_CHROMIUM_USE_DEV_SHM is enabled', () => {
    const args = buildChromiumLaunchArgs(
      { width: 1440, height: 900 },
      { SWEEP_CHROMIUM_USE_DEV_SHM: '1' }
    );
    expect(args).not.toContain('--disable-dev-shm-usage');
    expect(readChromiumRuntimeConfig({ SWEEP_CHROMIUM_USE_DEV_SHM: '1' }).useDevShm).toBe(true);
  });

  it('applies renderer process limit when configured', () => {
    const args = buildChromiumLaunchArgs(
      { width: 1440, height: 900 },
      { SWEEP_CHROMIUM_RENDERER_PROCESS_LIMIT: '4' }
    );
    expect(args).toContain('--renderer-process-limit=4');
  });
});
