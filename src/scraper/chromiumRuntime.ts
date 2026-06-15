/**
 * Chromium launch tuning for container/hosted deployments.
 * Controlled via environment variables set on the container runtime.
 */

export interface ChromiumRuntimeConfig {
  useDevShm: boolean;
  disableDevShmUsage: boolean;
  rendererProcessLimit: number | null;
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function readChromiumRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ChromiumRuntimeConfig {
  const useDevShm = parseBooleanEnv(env.SWEEP_CHROMIUM_USE_DEV_SHM);
  return {
    useDevShm,
    disableDevShmUsage: !useDevShm,
    rendererProcessLimit: parsePositiveInt(env.SWEEP_CHROMIUM_RENDERER_PROCESS_LIMIT),
  };
}

export function buildChromiumLaunchArgs(
  viewport: { width: number; height: number },
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const runtime = readChromiumRuntimeConfig(env);
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-infobars',
    '--window-size=' + viewport.width + ',' + viewport.height,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
  ];

  if (runtime.disableDevShmUsage) {
    args.push('--disable-dev-shm-usage');
  }

  if (runtime.rendererProcessLimit) {
    args.push(`--renderer-process-limit=${runtime.rendererProcessLimit}`);
  }

  return args;
}
