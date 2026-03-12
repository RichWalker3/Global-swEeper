/**
 * Scraper helper functions - bot detection, retry logic, fingerprinting
 * Extracted for testability
 */

import type { Page, Response } from 'playwright';
import type { CrawlError } from './types.js';

// Pool of realistic user agents for rotation
export const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

// Viewports to randomize (slight variations)
export const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
  { width: 1680, height: 1050 },
];

export interface BotBlockResult {
  blocked: boolean;
  type: string | null;
}

/**
 * Detect if a page is showing a bot/challenge page
 */
export function detectBotBlock(html: string, title: string): BotBlockResult {
  // Cloudflare
  if (
    title.includes('Just a moment') ||
    title.includes('Attention Required') ||
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_opt') ||
    html.includes('cf-turnstile') ||
    html.includes('Checking your browser')
  ) {
    return { blocked: true, type: 'cloudflare' };
  }

  // PerimeterX
  if (
    html.includes('_pxCaptcha') ||
    html.includes('Press & Hold') ||
    html.includes('perimeterx') ||
    html.includes('px-captcha')
  ) {
    return { blocked: true, type: 'perimeterx' };
  }

  // DataDome
  if (
    (html.includes('datadome') && html.includes('captcha')) ||
    html.includes('geo.captcha-delivery.com')
  ) {
    return { blocked: true, type: 'datadome' };
  }

  // Akamai Bot Manager
  if (html.includes('akamai') && html.includes('challenge')) {
    return { blocked: true, type: 'akamai' };
  }

  // Generic challenge detection
  if (
    title.includes('Access Denied') ||
    title.includes('Verify') ||
    html.includes('challenge-running') ||
    html.includes('human verification')
  ) {
    return { blocked: true, type: 'generic-challenge' };
  }

  return { blocked: false, type: null };
}

/**
 * Random delay between min and max milliseconds
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Get a random user agent from the pool
 */
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Get a random viewport with slight variations
 */
export function getRandomViewport(): { width: number; height: number } {
  const base = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  // Add slight random variation (±30px)
  return {
    width: base.width + Math.floor(Math.random() * 60) - 30,
    height: base.height + Math.floor(Math.random() * 60) - 30,
  };
}

/**
 * Classify error type from error message and status code
 */
export function classifyError(errorMsg: string, statusCode?: number): CrawlError['type'] {
  if (statusCode === 404) return 'not_found';
  if (statusCode === 401 || statusCode === 403) return 'auth_required';
  if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) return 'timeout';
  if (errorMsg.includes('blocked') || errorMsg.includes('challenge') || errorMsg.includes('captcha')) return 'blocked';
  return 'other';
}

export interface GotoResult {
  response: Response | null;
  blocked: boolean;
  blockType: string | null;
  error: string | null;
}

export interface GotoOptions {
  timeout: number;
  maxRetries?: number;
  verbose?: boolean;
}

/**
 * Navigate with retry logic and exponential backoff
 */
export async function gotoWithRetry(
  page: Page,
  url: string,
  options: GotoOptions
): Promise<GotoResult> {
  const maxRetries = options.maxRetries ?? 2;
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Exponential backoff on retries
      if (attempt > 0) {
        const delay = 1000 * Math.pow(2, attempt); // 2s, 4s
        if (options.verbose) {
          console.log(`  ↻ Retry ${attempt}/${maxRetries} for ${url} (waiting ${delay}ms)`);
        }
        await page.waitForTimeout(delay);
      }

      const response = await page.goto(url, { timeout: options.timeout, waitUntil: 'domcontentloaded' });
      
      // Wait a bit for dynamic content
      await page.waitForTimeout(1500);

      // Check for bot detection
      const html = await page.content();
      const title = await page.title();
      const botCheck = detectBotBlock(html, title);

      if (botCheck.blocked) {
        // If blocked on first attempt, wait longer and retry
        if (attempt < maxRetries) {
          if (options.verbose) {
            console.log(`  ⚠️ ${botCheck.type} challenge detected, retrying...`);
          }
          continue;
        }
        return { response, blocked: true, blockType: botCheck.type, error: null };
      }

      return { response, blocked: false, blockType: null, error: null };

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';

      // Check if error is retryable
      const isRetryable = 
        lastError.includes('net::ERR_') ||
        lastError.includes('timeout') ||
        lastError.includes('Navigation timeout') ||
        lastError.includes('ERR_CONNECTION') ||
        lastError.includes('503') ||
        lastError.includes('429');

      if (!isRetryable || attempt >= maxRetries) {
        return { response: null, blocked: false, blockType: null, error: lastError };
      }
    }
  }

  return { response: null, blocked: false, blockType: null, error: lastError };
}
