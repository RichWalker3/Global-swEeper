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

const TOP_PREVIEW_CHARS = 1600;
const EXCERPT_CHARS = 700;
const MAX_EVIDENCE_CHARS = 6500;
const SNIPPET_CONTEXT_CHARS = 260;
const MAX_SNIPPETS = 10;

const CATEGORY_FALLBACK_TERMS: Record<string, string[]> = {
  shipping: ['shipping policy', 'free shipping', 'delivery', 'business days'],
  returns: ['return policy', 'returns', 'exchange', 'final sale'],
  checkout: ['checkout', 'cart', 'shop pay', 'paypal'],
  payments: ['payment', 'apple pay', 'google pay', 'klarna', 'afterpay'],
  duties_taxes: ['duties', 'taxes', 'vat', 'customs'],
  subscriptions: ['subscription', 'subscribe', 'recurring'],
  loyalty: ['rewards', 'loyalty', 'points'],
  international: ['international', 'worldwide', 'currency'],
  compliance: ['restricted items', 'cannot ship', 'hazmat', 'ground shipping only'],
  b2b: ['wholesale', 'trade program', 'bulk order'],
  dropship: ['dropship', 'fulfilled by partner', 'third-party seller'],
  faq: ['faq', 'frequently asked', 'help'],
  gift_cards: ['gift card', 'store credit'],
  pdp: ['add to cart', 'size', 'variant'],
};

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
  const { categories, keyPhrases } = tagPage(cleanedText, url, title);
  const evidenceText = buildEvidenceText(cleanedText, title, categories, keyPhrases);
  const excerpt = evidenceText.slice(0, EXCERPT_CHARS);

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
    evidenceText,
    screenshot,
    matchedCategories: categories,
    keyPhrases,
    networkRequests,
    timestamp: new Date().toISOString(),
    statusCode,
    headers,
  };
}

function buildEvidenceText(
  cleanedText: string,
  title: string,
  categories: string[],
  keyPhrases: string[],
): string {
  if (!cleanedText) return '';

  const openingPreview = cleanedText.slice(0, TOP_PREVIEW_CHARS).trim();
  const snippetTerms = buildSnippetTerms(title, categories, keyPhrases);
  const snippetRanges = collectSnippetRanges(cleanedText, snippetTerms);
  const snippets = snippetRanges
    .map(({ start, end }) => cleanedText.slice(start, end).trim())
    .filter(Boolean)
    .filter(snippet => !openingPreview.includes(snippet));

  const sections = [openingPreview];
  if (snippets.length > 0) {
    sections.push('[Relevant snippets]');
    sections.push(...snippets);
  }

  const combined = sections.join('\n\n');
  if (combined.length <= MAX_EVIDENCE_CHARS) return combined;
  return `${combined.slice(0, MAX_EVIDENCE_CHARS).trim()}\n\n[...truncated...]`;
}

function buildSnippetTerms(title: string, categories: string[], keyPhrases: string[]): string[] {
  const terms = new Set<string>();

  for (const phrase of keyPhrases) {
    if (phrase.trim().length >= 4) {
      terms.add(phrase.trim());
    }
  }

  for (const category of categories) {
    for (const term of CATEGORY_FALLBACK_TERMS[category] || []) {
      terms.add(term);
    }
  }

  for (const titleTerm of title.split(/\s+/)) {
    const cleaned = titleTerm.replace(/[^\w&/-]/g, '').trim();
    if (cleaned.length >= 5) {
      terms.add(cleaned);
    }
  }

  return [...terms].slice(0, 30);
}

function collectSnippetRanges(text: string, terms: string[]): Array<{ start: number; end: number }> {
  const lowerText = text.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];

  for (const term of terms) {
    let searchFrom = 0;
    const normalizedTerm = term.toLowerCase();
    while (ranges.length < MAX_SNIPPETS) {
      const index = lowerText.indexOf(normalizedTerm, searchFrom);
      if (index === -1) break;

      ranges.push({
        start: Math.max(0, index - SNIPPET_CONTEXT_CHARS),
        end: Math.min(text.length, index + term.length + SNIPPET_CONTEXT_CHARS),
      });

      searchFrom = index + term.length;
    }

    if (ranges.length >= MAX_SNIPPETS) {
      break;
    }
  }

  return mergeRanges(ranges);
}

function mergeRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (const range of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (range.start <= current.end + 80) {
      current.end = Math.max(current.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged.slice(0, MAX_SNIPPETS);
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
