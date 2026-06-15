/**
 * Manages Playwright browser lifecycle: launch, disconnect detection, and clean restart.
 */

import type { Browser, BrowserContext } from 'playwright';
import {
  launchStealthBrowser,
  type BrowserConfig,
  type LaunchOptions,
  type LaunchResult,
} from './browser.js';
import type { StructuredLogInput } from './types.js';

const BROWSER_CLOSE_STEP_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryKillBrowserProcess(browser: Browser): void {
  try {
    const proc = (browser as unknown as { process?: () => import('child_process').ChildProcess }).process?.();
    proc?.kill?.('SIGKILL');
  } catch {
    // ignore
  }
}

async function closeBrowserStep(label: string, fn: () => Promise<void>, verbose: boolean): Promise<void> {
  const out = await Promise.race([
    fn().then(() => 'done' as const),
    sleep(BROWSER_CLOSE_STEP_MS).then(() => 'slow' as const),
  ]);
  if (out === 'slow' && verbose) {
    console.warn(`  ⚠ ${label} exceeded ${BROWSER_CLOSE_STEP_MS / 1000}s; continuing`);
  }
}

export interface StealthBrowserManagerOptions extends LaunchOptions {
  onRestart?: (restartCount: number) => void;
}

export class StealthBrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: BrowserConfig | null = null;
  private restartCount = 0;
  private readonly options: StealthBrowserManagerOptions;

  constructor(options: StealthBrowserManagerOptions = {}) {
    this.options = options;
  }

  getRestartCount(): number {
    return this.restartCount;
  }

  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  /** Launch or restart when the browser disconnected or the session was torn down. */
  async ensureSession(reason = 'browser disconnected'): Promise<LaunchResult> {
    if (this.browser?.isConnected() && this.context && this.config) {
      return this.getSession();
    }
    if (this.browser) {
      return this.restart(reason);
    }
    return this.launch();
  }

  getSession(): LaunchResult {
    if (!this.browser || !this.context || !this.config) {
      throw new Error('Browser manager has no active session');
    }
    return { browser: this.browser, context: this.context, config: this.config };
  }

  async launch(): Promise<LaunchResult> {
    const result = await launchStealthBrowser(this.options);
    this.attachDisconnectHandler(result.browser);
    this.browser = result.browser;
    this.context = result.context;
    this.config = result.config;

    this.options.onLog?.({
      level: 'info',
      scope: 'browser',
      event: 'browser.launched',
      message: 'Chromium browser launched',
      details: { restartCount: this.restartCount },
    });

    return result;
  }

  async restart(reason: string): Promise<LaunchResult> {
    this.restartCount += 1;
    this.options.onLog?.({
      level: 'warn',
      scope: 'browser',
      event: 'browser.restarting',
      message: `Restarting Chromium (${reason})`,
      details: { restartCount: this.restartCount, reason },
    });
    if (this.options.verbose) {
      console.log(`  ↻ Restarting browser (${reason}) — restart #${this.restartCount}`);
    }

    await this.close();
    const result = await this.launch();
    this.options.onRestart?.(this.restartCount);
    return result;
  }

  async close(): Promise<void> {
    const verbose = this.options.verbose ?? false;
    const browser = this.browser;
    const context = this.context;

    this.browser = null;
    this.context = null;
    this.config = null;

    if (context) {
      await closeBrowserStep('context.close', () => context.close().catch(() => {}), verbose);
    }

    if (browser) {
      await closeBrowserStep('browser.close', () => browser.close().catch(() => {}), verbose);
      if (browser.isConnected()) {
        if (verbose) console.warn('  ⚠ Browser still connected after close; attempting SIGKILL');
        tryKillBrowserProcess(browser);
        await Promise.race([browser.close().catch(() => {}), sleep(3000)]);
      }
    }
  }

  private attachDisconnectHandler(browser: Browser): void {
    browser.on('disconnected', () => {
      this.options.onLog?.({
        level: 'warn',
        scope: 'browser',
        event: 'browser.disconnected',
        message: 'Chromium browser disconnected unexpectedly',
        details: { restartCount: this.restartCount },
      });
    });
  }
}

export function attachPageCrashLogging(
  page: import('playwright').Page,
  onLog?: (entry: StructuredLogInput) => void,
  url?: string
): void {
  page.on('crash', () => {
    onLog?.({
      level: 'error',
      scope: 'browser',
      event: 'page.crashed',
      phase: 'page-scraping',
      message: 'Renderer process crashed',
      details: { url },
    });
  });
}
