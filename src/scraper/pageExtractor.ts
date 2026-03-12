/**
 * Page content extraction
 * Extracts text, HTML, and metadata from loaded pages
 */

import { Page, Response } from 'playwright';
import type { PageData, NetworkRequest } from './types.js';
import { tagPage } from '../prefilter/tagger.js';

export interface ExtractOptions {
  takeScreenshots?: boolean;
}

/**
 * Extract structured data from a loaded page
 */
export async function extractPageData(
  page: Page,
  response: Response | null,
  networkRequests: NetworkRequest[],
  opts: ExtractOptions = {}
): Promise<PageData> {
  const url = page.url();
  const title = await page.title();
  const rawHtml = await page.content();

  const statusCode = response?.status();
  const responseHeaders = response?.headers() || {};
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(responseHeaders)) {
    headers[key] = String(value);
  }

  // Extract visible text only
  const cleanedText = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, [hidden], [aria-hidden="true"]').forEach(el => el.remove());
    return clone.innerText.replace(/\s+/g, ' ').trim();
  });

  const excerpt = cleanedText.slice(0, 500);
  const { categories, keyPhrases } = tagPage(cleanedText, url, title);

  let screenshot: string | undefined;
  if (opts.takeScreenshots) {
    // TODO: Implement screenshot saving
  }

  return {
    url,
    title,
    rawHtml,
    cleanedText,
    excerpt,
    screenshot,
    matchedCategories: categories,
    keyPhrases,
    networkRequests,
    timestamp: new Date().toISOString(),
    statusCode,
    headers,
  };
}

/**
 * Detect e-commerce platform from page content
 */
export async function detectPlatform(page: Page): Promise<string | undefined> {
  return await page.evaluate(() => {
    if ((window as any).Shopify || document.querySelector('[data-shopify]') || document.body.innerHTML.includes('cdn.shopify.com')) {
      return 'Shopify';
    }
    if (document.body.innerHTML.includes('demandware')) {
      return 'SFCC';
    }
    if ((window as any).Mage || document.body.innerHTML.includes('mage/')) {
      return 'Magento';
    }
    if (document.body.innerHTML.includes('bigcommerce.com')) {
      return 'BigCommerce';
    }
    return undefined;
  });
}

/**
 * Detect if site uses headless/JAMstack architecture
 */
export function detectHeadless(pages: PageData[]): boolean {
  const headlessSignals = ['__NEXT_DATA__', '_next/', 'gatsby', '_nuxt/', 'hydrogen'];

  for (const page of pages) {
    for (const signal of headlessSignals) {
      if (page.cleanedText.includes(signal) || page.url.includes(signal)) {
        return true;
      }
    }
  }
  return false;
}
