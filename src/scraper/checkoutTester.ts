/**
 * Checkout flow testing
 * Attempts to add items to cart and navigate to checkout
 */

import { BrowserContext, Page } from 'playwright';
import type { CheckoutFlowInfo, CrawlError } from './types.js';
import { extractCheckoutInfo } from './policyExtractor.js';
import { dismissCookieConsent } from './browser.js';
import { classifyError, gotoWithRetry } from './helpers.js';

export interface CheckoutTestResult {
  reachedCheckout: boolean;
  stoppedAt?: string;
  checkoutInfo: CheckoutFlowInfo;
  errors: CrawlError[];
}

export interface CheckoutTestOptions {
  timeout: number;
  verbose?: boolean;
  preferredProductUrls?: string[];
  /** When aborted, the checkout page is closed so the flow stops and browser.close() cannot hang. */
  abortSignal?: AbortSignal;
  onDebugUpdate?: (update: {
    stage?: string;
    stoppedAt?: string;
    addToCartResult?: { added: boolean; currentUrl: string; cartReady: boolean };
  }) => void;
}

function emptyCheckoutInfo(): CheckoutFlowInfo {
  return {
    expressWallets: [],
    paymentMethods: [],
    bnplOptions: [],
    giftCardOption: false,
    shippingOptions: [],
  };
}

function pushCheckoutError(
  errors: CrawlError[],
  url: string,
  issue: { error?: string | null; blocked?: boolean; blockType?: string | null },
  statusCode?: number
): void {
  if (issue.error) {
    errors.push({ url, error: issue.error, type: classifyError(issue.error) });
    return;
  }

  if (issue.blocked) {
    errors.push({
      url,
      error: `Bot detection: ${issue.blockType}`,
      type: 'blocked',
      blockType: issue.blockType || undefined,
    });
    return;
  }

  if (statusCode && statusCode >= 400) {
    errors.push({ url, error: `HTTP ${statusCode}`, type: classifyError('', statusCode) });
  }
}

const ADD_TO_CART_SELECTORS = [
  // Standard Shopify patterns
  'button[name="add"]',
  'button[type="submit"][form*="product"]',
  '.product-form__submit',
  '[data-add-to-cart]',
  '[data-action="add-to-cart"]',

  // Text-based selectors
  'button:has-text("Add to cart")',
  'button:has-text("Add to Cart")',
  'button:has-text("ADD TO CART")',
  'button:has-text("Add to bag")',
  'button:has-text("Add to Bag")',
  'button:has-text("ADD TO BAG")',
  'button:has-text("Buy now")',
  'button:has-text("Buy Now")',
  'button:has-text("Add")',

  // Class-based selectors
  '.add-to-cart',
  '#add-to-cart',
  '.btn-add-to-cart',
  '.btn-addtocart',
  '.addtocart',
  '.add-to-cart-btn',
  '.product__add-to-cart',
  '.product-add-to-cart',
  '[class*="add-to-cart"]',
  '[class*="addToCart"]',

  // Dawn theme (Shopify 2.0)
  '.product-form__buttons button[type="submit"]',
  '.shopify-payment-button button',

  // Common theme patterns
  '#AddToCart',
  '#addToCart',
  '[id*="AddToCart"]',
  '[id*="add-to-cart"]',

  // Aria labels
  'button[aria-label*="Add to cart"]',
  'button[aria-label*="Add to bag"]',
];

const CHECKOUT_BUTTON_SELECTORS = [
  'button[name="checkout"]',
  'button[type="submit"][name="checkout"]',
  'a[href*="/checkout"]',
  'button:has-text("Checkout")',
  'button:has-text("Check out")',
  'button:has-text("Proceed to checkout")',
  'button:has-text("Proceed to Checkout")',
  'button:has-text("Secure checkout")',
  'button:has-text("Secure Checkout")',
  'input[name="checkout"]',
  '.checkout-button',
  '#checkout',
  '[data-checkout-button]',
  '[class*="checkout"]',
];

const CART_TRIGGER_SELECTORS = [
  'a[href*="/cart"]',
  'button[aria-label*="cart" i]',
  'button[aria-label*="bag" i]',
  '[data-cart-toggle]',
  '[data-drawer-toggle="cart"]',
  '[class*="cart-toggle"]',
  '[class*="mini-cart"]',
];

const CART_DRAWER_SELECTORS = [
  '[data-cart-drawer]',
  '[data-drawer="cart"]',
  '[id*="cart-drawer"]',
  '[class*="cart-drawer"]',
  '[class*="mini-cart"]',
  '[class*="drawer"][class*="cart"]',
];

const CHECKOUT_URL_PATTERNS = [
  /\/checkout\b/i,
  /\/checkouts\b/i,
  /shopify\.com\/authentication/i,
];

const NON_CHECKOUT_URL_PATTERNS = [
  /\/pages\/tracking\b/i,
  /\/order-?tracking\b/i,
  /\/track(?:ing)?\b/i,
];

const NON_CHECKOUT_TEXT_PATTERNS = [
  /track(?:ing)?\s+(?:number|details|page)/i,
  /track\s+your\s+order/i,
  /order\s+status/i,
  /enter\s+your\s+(?:tracking|order)\s+/i,
];

const CHECKOUT_CONTENT_PATTERNS = [
  /contact\s+information/i,
  /shipping\s+address/i,
  /shipping\s+method/i,
  /delivery/i,
  /billing\s+address/i,
  /payment/i,
  /complete\s+order/i,
  /place\s+order/i,
  /review\s+and\s+pay/i,
  /return\s+to\s+cart/i,
  /name=["']checkout\[/i,
  /shopify[-\s]?checkout/i,
];

const SUCCESS_CART_PATTERNS = [
  /added to (cart|bag)/i,
  /item added/i,
  /view cart/i,
  /checkout/i,
];

const EMPTY_CART_PATTERNS = [
  /your (cart|bag|basket) is empty/i,
  /cart is empty/i,
  /bag is empty/i,
  /basket is empty/i,
  /0 items?/i,
];

const OVERLAY_CLOSE_SELECTORS = [
  '[role="dialog"] button[aria-label*="close" i]',
  '[role="dialog"] [aria-label*="close" i]',
  '[role="dialog"] button:has-text("Close")',
  '[role="dialog"] button:has-text("No thanks")',
  '[role="dialog"] button:has-text("No, thanks")',
  '[role="dialog"] button:has-text("Not now")',
  '[role="dialog"] button:has-text("Maybe later")',
  '.needsclick button[aria-label*="close" i]',
  '.needsclick button:has-text("Close")',
  '.needsclick button:has-text("No thanks")',
  '.needsclick button:has-text("No, thanks")',
];

function normalizeBaseUrl(seedUrl: string): string {
  return new URL(seedUrl).origin;
}

function buildSiteUrl(base: string, path: string): string {
  return new URL(path, `${base.replace(/\/+$/, '')}/`).toString();
}

/**
 * Reuse PDP URLs already collected during the crawl so checkout testing does not
 * waste most of its budget rediscovering products on slow catalogs.
 */
export function buildCheckoutProductCandidates(base: string, preferredProductUrls: string[] = []): string[] {
  const seen = new Set<string>();

  return preferredProductUrls
    .map((url) => {
      try {
        return new URL(url, base).toString();
      } catch {
        return null;
      }
    })
    .filter((url): url is string => {
      if (!url || seen.has(url)) return false;
      if (new URL(url).origin !== base) return false;
      seen.add(url);
      return true;
    })
    .sort((left, right) => scoreCheckoutProductCandidate(right) - scoreCheckoutProductCandidate(left));
}

function scoreCheckoutProductCandidate(url: string): number {
  let score = 0;
  if (/\/products\/[^/?#]+/i.test(url)) score += 10;
  if (url.includes('?variant=')) score += 6;
  if (/gift-?card/i.test(url)) score -= 8;
  return score;
}

function urlLooksLikeCheckout(url: string): boolean {
  return CHECKOUT_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function hasPattern(patterns: RegExp[], source: string): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

export function evaluateCheckoutDestination(
  url: string,
  html: string,
  text: string
): { confirmed: boolean; reason?: string } {
  const combined = `${html}\n${text}`;

  if (hasPattern(NON_CHECKOUT_URL_PATTERNS, url) || hasPattern(NON_CHECKOUT_TEXT_PATTERNS, combined)) {
    return { confirmed: false, reason: `Redirected to tracking page: ${url}` };
  }

  if (url.includes('account') || url.includes('login')) {
    return { confirmed: false, reason: 'Login required' };
  }

  if (!urlLooksLikeCheckout(url)) {
    return { confirmed: false };
  }

  if (hasPattern(CHECKOUT_CONTENT_PATTERNS, combined)) {
    return { confirmed: true };
  }

  return { confirmed: false, reason: `Reached checkout-looking URL without checkout form: ${url}` };
}

async function capturePageContent(page: Page): Promise<{ html: string; text: string }> {
  return {
    html: await page.content(),
    text: await page.evaluate(() => document.body.innerText),
  };
}

async function selectPurchasableOptions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const radioGroups = new Map<string, HTMLInputElement[]>();
    for (const radio of radios) {
      const key = radio.name || radio.closest('fieldset')?.textContent?.slice(0, 80) || '__ungrouped__';
      const group = radioGroups.get(key) || [];
      group.push(radio);
      radioGroups.set(key, group);
    }

    for (const group of radioGroups.values()) {
      const checkedAvailable = group.find((input) => {
        const label = input.id
          ? document.querySelector<HTMLElement>(`label[for="${input.id}"]`)
          : input.closest<HTMLElement>('label');
        const inputText = `${input.value} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
        const labelText = `${label?.textContent || ''} ${label?.getAttribute('aria-label') || ''}`.toLowerCase();
        const inputClasses = input.className?.toString().toLowerCase() || '';
        const labelClasses = label?.className?.toString().toLowerCase() || '';
        const unavailable =
          input.hasAttribute('disabled') ||
          input.getAttribute('aria-disabled') === 'true' ||
          inputClasses.includes('disabled') ||
          inputClasses.includes('soldout') ||
          inputClasses.includes('sold-out') ||
          labelClasses.includes('disabled') ||
          labelClasses.includes('soldout') ||
          labelClasses.includes('sold-out') ||
          inputText.includes('sold out') ||
          inputText.includes('unavailable') ||
          inputText.includes('notify me') ||
          labelText.includes('sold out') ||
          labelText.includes('unavailable') ||
          labelText.includes('notify me');
        return input.checked && !unavailable;
      });
      if (checkedAvailable) continue;

      const candidate = group.find((input) => {
        const label = input.id
          ? document.querySelector<HTMLElement>(`label[for="${input.id}"]`)
          : input.closest<HTMLElement>('label');
        const inputText = `${input.value} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
        const labelText = `${label?.textContent || ''} ${label?.getAttribute('aria-label') || ''}`.toLowerCase();
        const inputClasses = input.className?.toString().toLowerCase() || '';
        const labelClasses = label?.className?.toString().toLowerCase() || '';
        return !(
          input.hasAttribute('disabled') ||
          input.getAttribute('aria-disabled') === 'true' ||
          inputClasses.includes('disabled') ||
          inputClasses.includes('soldout') ||
          inputClasses.includes('sold-out') ||
          labelClasses.includes('disabled') ||
          labelClasses.includes('soldout') ||
          labelClasses.includes('sold-out') ||
          inputText.includes('sold out') ||
          inputText.includes('unavailable') ||
          inputText.includes('notify me') ||
          labelText.includes('sold out') ||
          labelText.includes('unavailable') ||
          labelText.includes('notify me')
        );
      });
      if (!candidate) continue;

      const target = candidate.id
        ? document.querySelector<HTMLElement>(`label[for="${candidate.id}"]`) || candidate
        : candidate.closest<HTMLElement>('label') || candidate;
      target.click();
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const roleOptions = Array.from(
      document.querySelectorAll<HTMLElement>('button[role="radio"], [role="option"], [role="radio"]')
    );
    const roleGroups = new Map<string, HTMLElement[]>();
    for (const option of roleOptions) {
      const key =
        option.getAttribute('name') ||
        option.closest('[role="radiogroup"], [role="listbox"], fieldset')?.textContent?.slice(0, 80) ||
        option.parentElement?.className?.toString().slice(0, 80) ||
        '__ungrouped__';
      const group = roleGroups.get(key) || [];
      group.push(option);
      roleGroups.set(key, group);
    }

    for (const group of roleGroups.values()) {
      const selected = group.find((option) => {
        const text = `${option.textContent || ''} ${option.getAttribute('aria-label') || ''}`.toLowerCase();
        const classes = option.className?.toString().toLowerCase() || '';
        const unavailable =
          option.hasAttribute('disabled') ||
          option.getAttribute('aria-disabled') === 'true' ||
          classes.includes('disabled') ||
          classes.includes('soldout') ||
          classes.includes('sold-out') ||
          text.includes('sold out') ||
          text.includes('unavailable') ||
          text.includes('notify me');
        return option.getAttribute('aria-checked') === 'true' && !unavailable;
      });
      if (selected) continue;
      const candidate = group.find((option) => {
        const text = `${option.textContent || ''} ${option.getAttribute('aria-label') || ''}`.toLowerCase();
        const classes = option.className?.toString().toLowerCase() || '';
        return !(
          option.hasAttribute('disabled') ||
          option.getAttribute('aria-disabled') === 'true' ||
          classes.includes('disabled') ||
          classes.includes('soldout') ||
          classes.includes('sold-out') ||
          text.includes('sold out') ||
          text.includes('unavailable') ||
          text.includes('notify me')
        );
      });
      if (candidate) {
        candidate.click();
        candidate.dispatchEvent(new Event('change', { bubbles: true }));
        candidate.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('select'));
    for (const select of selects) {
      const current = select.selectedOptions[0];
      const currentLabel = current ? `${current.text} ${current.value}`.toLowerCase() : '';
      const currentLooksPlaceholder =
        !current ||
        current.disabled ||
        current.index === 0 ||
        currentLabel.includes('choose') ||
        currentLabel.includes('select') ||
        currentLabel.includes('sold out') ||
        currentLabel.includes('unavailable');

      if (!currentLooksPlaceholder) continue;

      const validOption = Array.from(select.options).find((option, index) => {
        const label = `${option.text} ${option.value}`.toLowerCase();
        return (
          !option.disabled &&
          index > 0 &&
          !label.includes('choose') &&
          !label.includes('select') &&
          !label.includes('sold out') &&
          !label.includes('unavailable')
        );
      });
      if (validOption) {
        select.value = validOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
}

async function hasVariantId(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'form[action*="/cart/add"] input[name="id"], form[action*="/bag/add"] input[name="id"], input[name="id"]'
      )
    );
    return inputs.some((input) => input.value.trim().length > 0 && !input.disabled);
  });
}

interface ResolvedVariantCandidate {
  id: string;
  available: boolean;
  options: string[];
}

function normalizeResolvedVariants(rawVariants: Array<Record<string, unknown>>): ResolvedVariantCandidate[] {
  return rawVariants
    .map((variant) => {
      const id = String(variant.id ?? '').trim();
      const available = variant.available !== false && variant.availableForSale !== false;
      const optionValues = Array.isArray(variant.options)
        ? variant.options.map((value) => String(value ?? '').trim()).filter(Boolean)
        : Array.isArray(variant.selectedOptions)
          ? variant.selectedOptions
              .map((entry) => {
                if (!entry || typeof entry !== 'object') return '';
                return String((entry as { value?: unknown }).value ?? '').trim();
              })
              .filter(Boolean)
          : [variant.option1, variant.option2, variant.option3]
              .map((value) => String(value ?? '').trim())
              .filter(Boolean);

      return id ? { id, available, options: optionValues } : null;
    })
    .filter((variant): variant is ResolvedVariantCandidate => Boolean(variant));
}

function pickMatchingVariant(
  selectedOptionValues: string[],
  variants: ResolvedVariantCandidate[]
): ResolvedVariantCandidate | null {
  const normalizedSelected = selectedOptionValues.map((value) => value.trim().toLowerCase()).filter(Boolean);
  const availableVariants = variants.filter((variant) => variant.available);
  if (availableVariants.length === 0) return null;

  if (normalizedSelected.length === 0) {
    return availableVariants[0];
  }

  const exact = availableVariants.find((variant) => {
    const variantOptions = variant.options.map((value) => value.toLowerCase());
    return normalizedSelected.every((value, index) => !value || variantOptions[index] === value);
  });
  if (exact) return exact;

  const partial = availableVariants.find((variant) => {
    const variantOptions = variant.options.map((value) => value.toLowerCase());
    return normalizedSelected.every((value) => variantOptions.includes(value));
  });
  if (partial) return partial;

  return availableVariants[0];
}

async function resolveVariantIdFromPage(
  page: Page,
  verbose = false
): Promise<ResolvedVariantCandidate | null> {
  const extracted = await page.evaluate(() => {
    const selectedOptionValues: string[] = [];
    const radioGroups = new Map<string, string>();
    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked'))) {
      const key = input.name || input.closest('fieldset')?.textContent?.slice(0, 80) || input.value;
      if (!radioGroups.has(key) && input.value.trim()) {
        radioGroups.set(key, input.value.trim());
      }
    }
    selectedOptionValues.push(...radioGroups.values());

    for (const select of Array.from(document.querySelectorAll<HTMLSelectElement>('select'))) {
      const value = (select.selectedOptions[0]?.value || select.selectedOptions[0]?.text || '').trim();
      if (value) selectedOptionValues.push(value);
    }

    for (const option of Array.from(document.querySelectorAll<HTMLElement>('[role="radio"][aria-checked="true"], [role="option"][aria-selected="true"]'))) {
      const value = (option.getAttribute('data-value') || option.getAttribute('aria-label') || option.textContent || '').trim();
      if (value) selectedOptionValues.push(value);
    }

    const rawVariants: Array<Record<string, unknown>> = [];
    const predictProduct = (window as typeof window & { predictProduct?: { variants?: unknown } }).predictProduct;
    if (predictProduct && Array.isArray(predictProduct.variants)) {
      rawVariants.push(...(predictProduct.variants as Array<Record<string, unknown>>));
    }

    const product = (window as typeof window & { product?: { variants?: unknown } }).product;
    if (rawVariants.length === 0 && product && Array.isArray(product.variants)) {
      rawVariants.push(...(product.variants as Array<Record<string, unknown>>));
    }

    const activeProduct = (window as typeof window & { customerHub?: { activeProduct?: { variants?: unknown } } }).customerHub?.activeProduct;
    if (rawVariants.length === 0 && activeProduct && Array.isArray(activeProduct.variants)) {
      rawVariants.push(...(activeProduct.variants as Array<Record<string, unknown>>));
    }

    for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script'))) {
      if (rawVariants.length > 0) break;
      const text = (script.textContent || '').trim();
      if (!text || !text.includes('variants')) continue;

      if (script.type === 'application/json') {
        try {
          const parsed = JSON.parse(text) as { variants?: unknown };
          if (parsed && Array.isArray(parsed.variants)) {
            rawVariants.push(...(parsed.variants as Array<Record<string, unknown>>));
          }
          if (rawVariants.length > 0) break;
        } catch {
          // Continue
        }
      }

      try {
        const parsed = new Function(
          `${text}; return typeof predictProduct !== 'undefined' ? predictProduct : (typeof product !== 'undefined' ? product : (typeof activeProduct !== 'undefined' ? activeProduct : null));`
        )() as { variants?: unknown } | null;
        if (parsed && Array.isArray(parsed.variants)) {
          rawVariants.push(...(parsed.variants as Array<Record<string, unknown>>));
        }
        if (rawVariants.length > 0) break;
      } catch {
        // Continue
      }
    }

    return { selectedOptionValues, rawVariants };
  });

  const candidate = pickMatchingVariant(
    extracted.selectedOptionValues,
    normalizeResolvedVariants(extracted.rawVariants)
  );
  if (!candidate) return null;

  await page.evaluate((variant) => {
    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[name="id"]'))) {
      input.disabled = false;
      input.value = variant.id;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, candidate);

  if (verbose) {
    console.log(`    → Resolved variant ID fallback: ${candidate.id} (${candidate.options.join(' / ')})`);
  }

  return candidate;
}

async function ensurePurchasableVariant(page: Page, verbose = false): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await selectPurchasableOptions(page);
    await page.waitForTimeout(700);
    if (await hasVariantId(page)) {
      return true;
    }
    await resolveVariantIdFromPage(page, verbose);
    await page.waitForTimeout(300);
    if (await hasVariantId(page)) {
      return true;
    }
  }

  if (verbose) {
    console.log('    → No populated variant ID found before add-to-cart');
  }
  return false;
}

async function clickFirstVisible(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const matches = page.locator(selector);
      const count = Math.min(await matches.count(), 6);
      for (let index = 0; index < count; index++) {
        const element = matches.nth(index);
        if (await element.isVisible({ timeout: 1000 })) {
          await element.scrollIntoViewIfNeeded();
          await element.click({ timeout: 2000 });
          return true;
        }
      }
    } catch {
      continue;
    }
  }
  return false;
}

async function dismissInterferingOverlays(page: Page, verbose = false): Promise<boolean> {
  let dismissed = await dismissCookieConsent(page, verbose);

  await page.keyboard.press('Escape').catch(() => {});

  for (const selector of OVERLAY_CLOSE_SELECTORS) {
    try {
      const matches = page.locator(selector);
      const count = Math.min(await matches.count(), 5);
      for (let index = 0; index < count; index++) {
        const element = matches.nth(index);
        if (!(await element.isVisible({ timeout: 500 }).catch(() => false))) continue;
        await element.scrollIntoViewIfNeeded().catch(() => {});
        try {
          await element.click({ timeout: 1500 });
        } catch {
          await element.click({ timeout: 1500, force: true });
        }
        dismissed = true;
        if (verbose) {
          console.log(`    → Dismissed overlay: ${selector}`);
        }
        await page.waitForTimeout(400);
      }
    } catch {
      // Continue to next selector
    }
  }

  return dismissed;
}

async function confirmCartHasItems(page: Page): Promise<boolean> {
  const text = await page.evaluate(() => document.body.innerText);
  const lowerText = text.toLowerCase();
  if (EMPTY_CART_PATTERNS.some((pattern) => pattern.test(lowerText))) {
    return false;
  }

  const hasCheckoutCta = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, input')).some((node) => {
      const text = (node.textContent || (node as HTMLInputElement).value || '').trim();
      const href = (node as HTMLAnchorElement).href || '';
      return /checkout/i.test(text) || /\/checkout/i.test(href);
    });
  });

  return hasCheckoutCta || !/empty/.test(lowerText);
}

async function openCartDrawerIfPresent(page: Page): Promise<boolean> {
  const opened = await clickFirstVisible(page, CART_TRIGGER_SELECTORS);
  if (!opened) return false;

  try {
    await page.waitForTimeout(1500);
    return await page.locator(CART_DRAWER_SELECTORS.join(', ')).first().isVisible({ timeout: 1500 });
  } catch {
    return false;
  }
}

async function clickCheckoutCta(page: Page): Promise<boolean> {
  return clickFirstVisible(page, CHECKOUT_BUTTON_SELECTORS);
}

async function inspectCheckoutDestination(
  page: Page
): Promise<{ confirmed: boolean; url: string; html: string; text: string; reason?: string }> {
  const url = page.url();
  const { html, text } = await capturePageContent(page);
  return { url, html, text, ...evaluateCheckoutDestination(url, html, text) };
}

function applyCheckoutDestination(
  destination: { confirmed: boolean; url: string; html: string; text: string; reason?: string },
  state: { reachedCheckout: boolean; stoppedAt?: string; checkoutHtml: string; checkoutText: string }
): void {
  if (destination.confirmed) {
    state.reachedCheckout = true;
    state.stoppedAt = destination.url;
    state.checkoutHtml = destination.html;
    state.checkoutText = destination.text;
    return;
  }

  if (destination.reason) {
    state.stoppedAt = destination.reason;
    state.checkoutHtml = destination.html;
    state.checkoutText = destination.text;
  }
}

/**
 * Test checkout flow by adding an item and navigating to checkout
 */
export async function testCheckoutFlow(
  context: BrowserContext,
  seedUrl: string,
  opts: CheckoutTestOptions
): Promise<CheckoutTestResult | null> {
  const page = await context.newPage();
  const base = normalizeBaseUrl(seedUrl);
  const errors: CrawlError[] = [];
  const debug = (update: { stage?: string; stoppedAt?: string; addToCartResult?: { added: boolean; currentUrl: string; cartReady: boolean } }): void => {
    opts.onDebugUpdate?.(update);
  };

  const onAbort = (): void => {
    void page.close().catch(() => {});
  };
  opts.abortSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    // Step 1: Find a product
    debug({ stage: 'finding-product' });
    const productUrl = await findProductUrl(page, base, opts, errors);
    if (!productUrl) {
      return {
        reachedCheckout: false,
        stoppedAt: errors.length > 0 ? 'Checkout product discovery failed' : 'No product found for checkout test',
        checkoutInfo: emptyCheckoutInfo(),
        errors,
      };
    }

    // Step 2: Go to product and add to cart
    debug({ stage: 'loading-product' });
    const productNav = await gotoWithRetry(page, productUrl, {
      timeout: opts.timeout,
      maxRetries: 2,
      verbose: opts.verbose,
      referer: base,
      waitForNetworkIdle: true,
    });
    const productStatus = productNav.response?.status();
    if (productNav.error || productNav.blocked || (productStatus && productStatus >= 400)) {
      pushCheckoutError(errors, productUrl, productNav, productStatus);
      return {
        reachedCheckout: false,
        stoppedAt: 'Checkout product page failed to load',
        checkoutInfo: emptyCheckoutInfo(),
        errors,
      };
    }

    await page.waitForTimeout(1500);
    debug({ stage: 'add-to-cart' });
    const addToCartResult = await tryAddToCart(page, base, opts.verbose);
    debug({ stage: 'after-add-to-cart', addToCartResult });

    // Step 3: Navigate to checkout
    debug({ stage: 'checkout-navigation' });
    const { reachedCheckout, stoppedAt, html, text } = await navigateToCheckout(
      page,
      base,
      opts,
      errors,
      addToCartResult
    );
    debug({ stage: reachedCheckout ? 'checkout-reached' : 'checkout-not-reached', stoppedAt });

    // Extract checkout info
    const checkoutInfo = extractCheckoutInfo(html, text);

    return { reachedCheckout, stoppedAt, checkoutInfo, errors };
  } catch (error) {
    if (opts.abortSignal?.aborted || page.isClosed()) {
      return null;
    }
    throw error;
  } finally {
    opts.abortSignal?.removeEventListener('abort', onAbort);
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}

async function findProductUrl(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  base: string,
  opts: CheckoutTestOptions,
  errors: CrawlError[]
): Promise<string | null> {
  const preferredCandidates = buildCheckoutProductCandidates(base, opts.preferredProductUrls);
  if (preferredCandidates.length > 0) {
    return preferredCandidates[0];
  }

  const collectionPaths = [
    base,
    `${base}/collections/all`,
    `${base}/collections`,
    `${base}/products`,
    `${base}/shop`,
  ];

  for (const path of collectionPaths) {
    try {
      const navResult = await gotoWithRetry(page, path, {
        timeout: opts.timeout,
        maxRetries: 2,
        verbose: opts.verbose,
        referer: base,
        waitForNetworkIdle: true,
      });
      const statusCode = navResult.response?.status();
      if (navResult.error || navResult.blocked || (statusCode && statusCode >= 400)) {
        pushCheckoutError(errors, path, navResult, statusCode);
        continue;
      }

      await page.waitForTimeout(1500);

      const productLink = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('a[href], [data-product-url]'))
          .map((node) => {
            const href =
              (node as HTMLAnchorElement).href ||
              node.getAttribute('data-product-url') ||
              '';
            const text = `${node.textContent || ''} ${node.getAttribute('aria-label') || ''}`.trim();
            const classes = node.className || '';
            let score = 0;

            if (/\/products\/[^/?#]+/i.test(href)) score += 10;
            if (/\/p\/[^/?#]+/i.test(href)) score += 9;
            if (/product|card|tile|item/i.test(classes)) score += 4;
            if (/shop now|quick add|add to cart|buy now/i.test(text)) score += 3;
            if (/collections|pages|blog|account|login|cart|checkout/i.test(href)) score -= 6;
            if (href.includes('?variant=')) score -= 4;

            return { href, score };
          })
          .filter((candidate) => candidate.href && candidate.score > 0)
          .sort((a, b) => b.score - a.score);

        return candidates[0]?.href || null;
      });

      if (productLink) return productLink;
    } catch {
      continue;
    }
  }

  return null;
}

async function tryAddToCart(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  base: string,
  verbose = false
): Promise<{ added: boolean; currentUrl: string; cartReady: boolean }> {
  await dismissInterferingOverlays(page, verbose);
  await ensurePurchasableVariant(page, verbose);
  await dismissInterferingOverlays(page, verbose);

  const startingUrl = page.url();
  for (const selector of ADD_TO_CART_SELECTORS) {
    try {
      const matches = page.locator(selector);
      const count = Math.min(await matches.count(), 6);
      for (let index = 0; index < count; index++) {
        const button = matches.nth(index);
        if (await button.isVisible({ timeout: 1200 }).catch(() => false)) {
          await button.scrollIntoViewIfNeeded();
          try {
            await button.click({ timeout: 2500 });
          } catch (error) {
            const message = error instanceof Error ? error.message : '';
            if (/intercepts pointer events|not visible|not stable/i.test(message)) {
              await dismissInterferingOverlays(page, verbose);
              await button.click({ timeout: 2500, force: true }).catch(() => {});
            } else {
              throw error;
            }
          }
          await page.waitForTimeout(2500);

          if (urlLooksLikeCheckout(page.url())) {
            return { added: true, currentUrl: page.url(), cartReady: true };
          }

          const pageText = await page.evaluate(() => document.body.innerText);
          if (SUCCESS_CART_PATTERNS.some((pattern) => pattern.test(pageText))) {
            return { added: true, currentUrl: page.url(), cartReady: true };
          }

          const drawerOpened = await openCartDrawerIfPresent(page);
          if (drawerOpened) {
            return { added: true, currentUrl: page.url(), cartReady: true };
          }

          if (page.url() !== startingUrl) {
            return { added: true, currentUrl: page.url(), cartReady: true };
          }
        }
      }
    } catch {
      continue;
    }
  }

  // Try form submission as fallback
  try {
    const form = await page.$('form[action*="/cart/add"], form[action*="/bag/add"]');
    if (form) {
      await form.evaluate((f: HTMLFormElement) => f.requestSubmit());
      await page.waitForTimeout(2000);
      return { added: true, currentUrl: page.url(), cartReady: true };
    }
  } catch {
    // Continue
  }

  const cartUrl = buildSiteUrl(base, '/cart');
  try {
    const cartNav = await gotoWithRetry(page, cartUrl, {
      timeout: 12000,
      maxRetries: 1,
      waitForNetworkIdle: true,
    });
    if (!cartNav.error && !cartNav.blocked && await confirmCartHasItems(page)) {
      return { added: true, currentUrl: page.url(), cartReady: true };
    }
  } catch {
    // keep falling through
  }

  return { added: false, currentUrl: page.url(), cartReady: false };
}

async function navigateToCheckout(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  base: string,
  opts: CheckoutTestOptions,
  errors: CrawlError[],
  addToCartResult: { added: boolean; currentUrl: string; cartReady: boolean }
): Promise<{ reachedCheckout: boolean; stoppedAt?: string; html: string; text: string }> {
  const checkoutState: {
    reachedCheckout: boolean;
    stoppedAt?: string;
    checkoutHtml: string;
    checkoutText: string;
  } = {
    reachedCheckout: false,
    stoppedAt: undefined,
    checkoutHtml: '',
    checkoutText: '',
  };

  if (urlLooksLikeCheckout(addToCartResult.currentUrl)) {
    const destination = await inspectCheckoutDestination(page);
    if (destination.confirmed) {
      return {
        reachedCheckout: true,
        stoppedAt: destination.url,
        html: destination.html,
        text: destination.text,
      };
    }
    checkoutState.stoppedAt = destination.reason || destination.url;
    opts.onDebugUpdate?.({ stage: 'post-add-to-cart-destination', stoppedAt: checkoutState.stoppedAt });
    checkoutState.checkoutHtml = destination.html;
    checkoutState.checkoutText = destination.text;
  }

  // First try from cart page
  try {
    const cartUrl = buildSiteUrl(base, '/cart');
    const cartNav = await gotoWithRetry(page, cartUrl, {
      timeout: opts.timeout,
      maxRetries: 2,
      verbose: opts.verbose,
      referer: base,
      waitForNetworkIdle: true,
    });
    const cartStatus = cartNav.response?.status();
    if (cartNav.error || cartNav.blocked || (cartStatus && cartStatus >= 400)) {
      pushCheckoutError(errors, cartUrl, cartNav, cartStatus);
    } else {
      await page.waitForTimeout(1500);

      const cartContent = await capturePageContent(page);
      checkoutState.checkoutHtml = cartContent.html;
      checkoutState.checkoutText = cartContent.text;

      if (!await confirmCartHasItems(page) && addToCartResult.added) {
        checkoutState.stoppedAt = 'Cart remained empty after add-to-cart attempt';
        opts.onDebugUpdate?.({ stage: 'cart-empty-after-add-to-cart', stoppedAt: checkoutState.stoppedAt });
      }

      if (await clickCheckoutCta(page)) {
        await page.waitForTimeout(3000);

        const destination = await inspectCheckoutDestination(page);
        applyCheckoutDestination(destination, checkoutState);
        if (checkoutState.stoppedAt) {
          opts.onDebugUpdate?.({ stage: 'checkout-cta-result', stoppedAt: checkoutState.stoppedAt });
        }
      }
      if (!checkoutState.reachedCheckout) {
        const drawerOpened = await openCartDrawerIfPresent(page);
        if (drawerOpened) {
          if (await clickCheckoutCta(page)) {
            await page.waitForTimeout(3000);
            const destination = await inspectCheckoutDestination(page);
            applyCheckoutDestination(destination, checkoutState);
            if (checkoutState.stoppedAt) {
              opts.onDebugUpdate?.({ stage: 'drawer-checkout-cta-result', stoppedAt: checkoutState.stoppedAt });
            }
          }
        }
      }
    }
  } catch {
    // Cart navigation failed
  }

  // Try direct checkout navigation
  if (!checkoutState.reachedCheckout) {
    for (const path of [buildSiteUrl(base, '/checkout'), buildSiteUrl(base, '/checkouts')]) {
      try {
        const navResult = await gotoWithRetry(page, path, {
          timeout: opts.timeout,
          maxRetries: 2,
          verbose: opts.verbose,
          referer: buildSiteUrl(base, '/cart'),
          waitForNetworkIdle: true,
        });
        const statusCode = navResult.response?.status();
        if (navResult.error || navResult.blocked || (statusCode && statusCode >= 400)) {
          pushCheckoutError(errors, path, navResult, statusCode);
          continue;
        }

        await page.waitForTimeout(2000);

        const destination = await inspectCheckoutDestination(page);
        applyCheckoutDestination(destination, checkoutState);
        if (checkoutState.stoppedAt) {
          opts.onDebugUpdate?.({ stage: 'direct-checkout-result', stoppedAt: checkoutState.stoppedAt });
        }
        if (destination.confirmed) {
          break;
        }
        if (destination.reason) {
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Check if redirected to login
  if (!checkoutState.reachedCheckout && (page.url().includes('account') || page.url().includes('login'))) {
    checkoutState.stoppedAt = 'Login required';
  } else if (!checkoutState.reachedCheckout && !addToCartResult.added) {
    checkoutState.stoppedAt = checkoutState.stoppedAt || 'Add-to-cart could not be confirmed';
  }

  if (checkoutState.stoppedAt) {
    opts.onDebugUpdate?.({ stage: 'checkout-finished', stoppedAt: checkoutState.stoppedAt });
  }

  return {
    reachedCheckout: checkoutState.reachedCheckout,
    stoppedAt: checkoutState.stoppedAt,
    html: checkoutState.checkoutHtml,
    text: checkoutState.checkoutText,
  };
}
