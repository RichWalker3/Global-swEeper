/**
 * Checkout flow testing
 * Attempts to add items to cart and navigate to checkout
 */

import { BrowserContext, Page, type Response } from 'playwright';
import type { CheckoutFlowInfo, CrawlError } from './types.js';
import { extractCheckoutInfo } from './policyExtractor.js';
import { dismissCookieConsent } from './browser.js';
import { classifyError, gotoWithRetry } from './helpers.js';
import type { KnownPlatform } from './types.js';
import { getPlatformProfile, type PlatformProfile } from './platforms/index.js';
import { isNonContentActionUrl, isUnrenderedTemplateUrl } from './platforms/shared.js';

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
  platform?: KnownPlatform;
  /** When aborted, the checkout page is closed so the flow stops and browser.close() cannot hang. */
  abortSignal?: AbortSignal;
  onDebugUpdate?: (update: {
    stage?: string;
    stoppedAt?: string;
    addToCartResult?: AddToCartResult;
  }) => void;
}

interface AddToCartResult {
  added: boolean;
  currentUrl: string;
  cartReady: boolean;
  blocked?: boolean;
  blockReason?: string;
}

const MAX_CHECKOUT_PRODUCT_ATTEMPTS = 5;

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

const NON_CHECKOUT_URL_PATTERNS = [
  /\/pages\/tracking\b/i,
  /\/order-?tracking\b/i,
  /\/track(?:ing)?\b/i,
];

const NON_CHECKOUT_TEXT_PATTERNS = [
  /track(?:ing)?\s+(?:number|details|page)/i,
  /enter\s+your\s+(?:tracking|order)\s+/i,
];

const SUCCESS_CART_PATTERNS = [
  /added to (cart|bag)/i,
  /item added/i,
];

const LOW_QUALITY_CHECKOUT_PRODUCT_PATTERNS = [
  /gift-?card/i,
  /(gwp|gift-with-purchase|free-?\d|freebie|sample|sampler|promo|promotion|buy-more-save-more)/i,
  /\/(?:shoe-?care|accessories?|care|bags?|rack|cream)(?:\/|$)/i,
];

const NON_PURCHASABLE_CHECKOUT_CANDIDATE_PATTERNS = [
  /Product-ShowQuickView/i,
  /QuickView/i,
  /sold-?out/i,
  /out-?of-?stock/i,
  /\/(?:search|shop|category|collection|collections)(?:\/|$)/i,
];

const ADD_TO_CART_REJECTION_PATTERNS = [
  /unable to add/i,
  /could not add/i,
  /add(?:ing)? to (?:cart|bag) failed/i,
  /invalid quantity/i,
  /is unavailable/i,
  /sold out/i,
  /out of stock/i,
  /please select/i,
  /select (?:a|an) (?:size|color|option)/i,
];

const ADD_TO_CART_RATE_LIMIT_PATTERNS = [
  /too many requests/i,
  /rate limit/i,
  /\b429\b/,
  /access denied/i,
  /request blocked/i,
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

function inferLocalePathPrefix(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length < 1) return null;
    if (parts.length === 1 && /^[a-z]{2}$/i.test(parts[0])) {
      return `/${parts[0]}`;
    }
    const maybeCountry = parts[0];
    const maybeLanguage = parts[1];
    if (/^[a-z]{2}$/i.test(maybeCountry) && parts.length >= 2 && !/^[a-z]{2}$/i.test(maybeLanguage)) {
      return `/${maybeCountry}`;
    }
    if (/^[a-z]{2}$/i.test(maybeCountry) && /^[a-z]{2}$/i.test(maybeLanguage)) {
      return `/${maybeCountry}/${maybeLanguage}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reuse PDP URLs already collected during the crawl so checkout testing does not
 * waste most of its budget rediscovering products on slow catalogs.
 */
export function buildCheckoutProductCandidates(base: string, preferredProductUrls: string[] = []): string[] {
  return buildCheckoutProductCandidatesForPlatform(base, preferredProductUrls, undefined);
}

export function buildCheckoutProductCandidatesForPlatform(
  base: string,
  preferredProductUrls: string[] = [],
  platform?: KnownPlatform
): string[] {
  const profile = getPlatformProfile(platform);
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
      if (!isPurchasableCheckoutCandidate(url, profile)) return false;
      seen.add(url);
      return true;
    })
    .sort((left, right) => scoreCheckoutProductCandidate(right, profile) - scoreCheckoutProductCandidate(left, profile));
}

function scoreCheckoutProductCandidate(url: string, profile: PlatformProfile): number {
  let score = 0;
  for (const scoring of profile.productUrlScorePatterns) {
    if (scoring.pattern.test(url)) score += scoring.score;
  }
  if (url.includes('?variant=')) score += 6;
  if (/[?&](dwvar_|color=|size=|width=|style=|pid=)/i.test(url)) score += 4;
  if (LOW_QUALITY_CHECKOUT_PRODUCT_PATTERNS.some((pattern) => pattern.test(url))) {
    score -= 10;
  }
  return score;
}

function isPurchasableCheckoutCandidate(url: string, profile: PlatformProfile): boolean {
  if (isUnrenderedTemplateUrl(url)) return false;
  if (isNonContentActionUrl(url)) return false;
  if (NON_PURCHASABLE_CHECKOUT_CANDIDATE_PATTERNS.some((pattern) => pattern.test(url))) {
    return false;
  }
  return scoreCheckoutProductCandidate(url, profile) > 0;
}

function urlLooksLikeCheckout(url: string, profile: PlatformProfile): boolean {
  return profile.checkoutUrlPatterns.some((pattern) => pattern.test(url));
}

function urlLooksLikeCart(url: string): boolean {
  return /\/cart\b|Cart-/i.test(url);
}

function hasPattern(patterns: RegExp[], source: string): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

export function evaluateCheckoutDestination(
  url: string,
  html: string,
  text: string,
  platform?: KnownPlatform
): { confirmed: boolean; reason?: string } {
  const combined = `${html}\n${text}`;
  const profile = getPlatformProfile(platform);

  if (hasPattern(NON_CHECKOUT_URL_PATTERNS, url) || hasPattern(NON_CHECKOUT_TEXT_PATTERNS, combined)) {
    return { confirmed: false, reason: `Redirected to tracking page: ${url}` };
  }

  if (url.includes('account') || url.includes('login')) {
    return { confirmed: false, reason: 'Login required' };
  }

  if (!urlLooksLikeCheckout(url, profile)) {
    return { confirmed: false };
  }

  if (hasPattern(profile.checkoutContentPatterns, combined)) {
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

async function pageLooksSoldOut(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body.innerText || '').toLowerCase();
    const soldOutSignal =
      /sold out|out of stock|currently unavailable|unavailable/.test(text) ||
      /sold-?out/.test(window.location.pathname);
    if (!soldOutSignal) return false;

    const addButtons = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], a'));
    const hasEnabledAddToCart = addButtons.some((node) => {
      const label = `${node.textContent || (node as HTMLInputElement).value || ''}`.toLowerCase();
      if (!/add to (cart|bag)|add\b/.test(label)) return false;
      const disabled =
        (node as HTMLButtonElement).disabled ||
        node.getAttribute('aria-disabled') === 'true' ||
        node.hasAttribute('disabled');
      return !disabled;
    });

    return !hasEnabledAddToCart;
  });
}

async function readResponseText(response: Response | null): Promise<string> {
  if (!response) return '';
  try {
    const body = await response.text();
    return body.slice(0, 4000).toLowerCase();
  } catch {
    return '';
  }
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

    // Magento/custom swatch fallback: select one available option per configurable group.
    const configurableGroups = Array.from(document.querySelectorAll<HTMLElement>('[data-attribute-code], [data-role="swatch-options"]'));
    const clickedGroups = new Set<string>();
    for (const group of configurableGroups) {
      const groupKey =
        group.getAttribute('data-attribute-code') ||
        group.getAttribute('id') ||
        group.className?.toString().slice(0, 80) ||
        String(clickedGroups.size);
      if (clickedGroups.has(groupKey)) continue;

      const optionCandidate = Array.from(
        group.querySelectorAll<HTMLElement>(
          '[data-option-id], [option-id], [data-value], button, li, [role="option"], [class*="swatch"]'
        )
      ).find((el) => {
        const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
        const classes = el.className?.toString().toLowerCase() || '';
        const unavailable =
          el.getAttribute('aria-disabled') === 'true' ||
          el.getAttribute('disabled') !== null ||
          classes.includes('disabled') ||
          classes.includes('unavailable') ||
          classes.includes('soldout') ||
          classes.includes('sold-out') ||
          text.includes('sold out') ||
          text.includes('unavailable') ||
          text.includes('notify me');
        return !unavailable;
      });

      if (optionCandidate) {
        optionCandidate.click();
        optionCandidate.dispatchEvent(new Event('change', { bubbles: true }));
        optionCandidate.dispatchEvent(new Event('input', { bubbles: true }));
        clickedGroups.add(groupKey);
      }
    }

    // SFCC/custom swatch fallback: ensure each swatch group has one available selection.
    const swatchAnchors = Array.from(
      document.querySelectorAll<HTMLElement>('.swatchanchor, [role="radio"], [aria-label*="size" i], [aria-label*="width" i]')
    );
    const swatchGroups = new Map<string, Array<{ anchor: HTMLElement; text: string; unavailable: boolean; selected: boolean }>>();
    for (const anchor of swatchAnchors) {
      const text = (anchor.textContent || anchor.getAttribute('aria-label') || '').trim();
      if (!text) continue;
      const classes = `${anchor.className || ''} ${anchor.parentElement?.className || ''}`.toLowerCase();
      const unavailable =
        anchor.getAttribute('aria-disabled') === 'true' ||
        anchor.getAttribute('disabled') !== null ||
        classes.includes('disabled') ||
        classes.includes('unavailable') ||
        classes.includes('unselectable') ||
        classes.includes('soldout') ||
        classes.includes('sold-out');
      const selected =
        classes.includes('selected') ||
        classes.includes('active') ||
        classes.includes('current') ||
        anchor.getAttribute('aria-checked') === 'true';
      const groupRoot = anchor.closest('[data-attribute-id], [data-attribute-code], [id*="size"], [id*="width"], [class*="size"], [class*="width"], ul, ol, fieldset');
      const groupKey =
        groupRoot?.getAttribute('data-attribute-id') ||
        groupRoot?.getAttribute('data-attribute-code') ||
        groupRoot?.getAttribute('id') ||
        groupRoot?.className?.toString().slice(0, 120) ||
        `group-${swatchGroups.size}`;
      const group = swatchGroups.get(groupKey) || [];
      group.push({ anchor, text, unavailable, selected });
      swatchGroups.set(groupKey, group);
    }

    for (const group of swatchGroups.values()) {
      const available = group.filter((entry) => !entry.unavailable);
      if (available.length <= 1) continue;
      if (available.some((entry) => entry.selected)) continue;

      const numericPreferred = available.find((entry) => /^\d+(?:\.\d+)?$/.test(entry.text));
      const target = numericPreferred || available[0];
      target.anchor.click();
      target.anchor.dispatchEvent(new Event('change', { bubbles: true }));
      target.anchor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

async function selectPurchasableOptionsWithTrustedClicks(page: Page, verbose = false): Promise<void> {
  const groupSelectors = [
    'ul.swatches.size',
    'ul.swatches.width',
    'ul[class*="size" i]',
    'ul[class*="width" i]',
    '[data-attribute-id*="size" i], [data-attribute-code*="size" i]',
    '[data-attribute-id*="width" i], [data-attribute-code*="width" i]',
  ];

  for (const groupSelector of groupSelectors) {
    const groups = page.locator(groupSelector);
    const groupCount = Math.min(await groups.count().catch(() => 0), 4);
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
      const group = groups.nth(groupIndex);
      const options = group.locator('.swatchanchor, [role="radio"], button, a, label');
      const optionCount = Math.min(await options.count().catch(() => 0), 18);
      if (optionCount <= 1) continue;

      const optionMeta: Array<{ index: number; text: string; selected: boolean; unavailable: boolean }> = [];
      for (let optionIndex = 0; optionIndex < optionCount; optionIndex++) {
        const option = options.nth(optionIndex);
        const visible = await option.isVisible({ timeout: 300 }).catch(() => false);
        if (!visible) continue;
        const details = await option.evaluate((node) => {
          const text = (node.textContent || node.getAttribute('aria-label') || '').trim();
          const classes = `${node.className || ''} ${node.parentElement?.className || ''}`.toLowerCase();
          const selected =
            classes.includes('selected') ||
            classes.includes('active') ||
            classes.includes('current') ||
            node.getAttribute('aria-checked') === 'true';
          const unavailable =
            node.getAttribute('aria-disabled') === 'true' ||
            node.getAttribute('disabled') !== null ||
            classes.includes('disabled') ||
            classes.includes('unavailable') ||
            classes.includes('unselectable') ||
            classes.includes('soldout') ||
            classes.includes('sold-out');
          return { text, selected, unavailable };
        });
        if (!details.text) continue;
        optionMeta.push({ index: optionIndex, ...details });
      }

      if (optionMeta.length <= 1 || optionMeta.some((entry) => entry.selected && !entry.unavailable)) {
        continue;
      }
      const available = optionMeta.filter((entry) => !entry.unavailable);
      if (available.length === 0) continue;

      const numericPreferred = available.find((entry) => /^\d+(?:\.\d+)?$/.test(entry.text));
      const target = numericPreferred || available[0];
      const targetOption = options.nth(target.index);
      await targetOption.scrollIntoViewIfNeeded().catch(() => {});
      await targetOption.click({ timeout: 2000 }).catch(async () => {
        await targetOption.click({ timeout: 2000, force: true }).catch(() => {});
      });
      await page.waitForTimeout(450);
      if (verbose) {
        console.log(`    → Selected swatch option via trusted click: ${target.text}`);
      }
    }
  }
}

async function hasVariantId(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        [
          'form[action*="/cart/add"] input[name="id"]',
          'form[action*="/bag/add"] input[name="id"]',
          'input[name="id"]',
          'input[name="selected_configurable_option"]',
          'input[name*="super_attribute"][value]',
        ].join(', ')
      )
    );
    if (inputs.some((input) => input.value.trim().length > 0 && !input.disabled)) {
      return true;
    }

    // Fallback readiness signal for custom storefronts that don't expose variant id inputs.
    const addToCart = Array.from(document.querySelectorAll<HTMLButtonElement>('button, input[type="submit"]')).find((node) => {
      const text = `${node.textContent || node.value || ''}`.toLowerCase();
      return /add to (cart|bag)|add\b/.test(text);
    });
    if (!addToCart) return false;
    if ((addToCart as HTMLButtonElement).disabled || addToCart.getAttribute('aria-disabled') === 'true') return false;

    const requiredSelects = Array.from(document.querySelectorAll<HTMLSelectElement>('select[required], select[name*="attribute"], select[id*="attribute"]'));
    const hasUnselectedRequired = requiredSelects.some((select) => {
      const chosen = select.selectedOptions[0];
      const label = `${chosen?.text || ''} ${chosen?.value || ''}`.toLowerCase();
      return !chosen || chosen.disabled || chosen.index === 0 || label.includes('choose') || label.includes('select');
    });
    if (hasUnselectedRequired) return false;

    const swatchAnchors = Array.from(document.querySelectorAll<HTMLElement>('.swatchanchor'));
    const numericSizeSwatches = swatchAnchors.filter((anchor) => /^\d+(?:\.\d+)?$/.test((anchor.textContent || '').trim()));
    if (numericSizeSwatches.length > 0) {
      const hasSelectedNumericSwatch = numericSizeSwatches.some((anchor) => {
        const classes = `${anchor.className || ''} ${anchor.parentElement?.className || ''}`.toLowerCase();
        return classes.includes('selected') || classes.includes('active') || classes.includes('current') || anchor.getAttribute('aria-checked') === 'true';
      });
      if (!hasSelectedNumericSwatch) return false;
    }

    return true;
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
    await selectPurchasableOptionsWithTrustedClicks(page, verbose);
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
  const cartSignals = await page.evaluate(() => {
    const text = (document.body.innerText || '').toLowerCase();
    const hasLineItems = Boolean(
      document.querySelector(
        [
          '[data-cart-item]',
          '[data-item-id]',
          '[class*="cart-item"]',
          '[class*="line-item"]',
          '[class*="product-line-item"]',
          '.cart-item',
          '.line-item',
        ].join(', ')
      )
    );
    const hasPositiveQuantity = Array.from(document.querySelectorAll<HTMLInputElement>('input[name*="qty" i], input[name*="quantity" i]'))
      .some((input) => Number.parseInt((input.value || '').trim(), 10) > 0);
    const hasNonZeroBadge = Array.from(document.querySelectorAll<HTMLElement>('[class*="cart-count"], [class*="bag-count"], [data-cart-count], [aria-label*="cart" i], [aria-label*="bag" i]'))
      .some((node) => {
        const value = (node.textContent || node.getAttribute('data-cart-count') || '').trim();
        const count = Number.parseInt(value, 10);
        return Number.isFinite(count) && count > 0;
      });
    const hasCheckoutCta = Array.from(document.querySelectorAll('a, button, input')).some((node) => {
      const buttonText = (node.textContent || (node as HTMLInputElement).value || '').trim();
      const href = (node as HTMLAnchorElement).href || '';
      return /checkout/i.test(buttonText) || /\/checkout|checkout-begin|coshipping/i.test(href);
    });
    return { text, hasLineItems, hasPositiveQuantity, hasNonZeroBadge, hasCheckoutCta };
  });

  if (cartSignals.hasLineItems || cartSignals.hasPositiveQuantity || cartSignals.hasNonZeroBadge) {
    return true;
  }
  if (EMPTY_CART_PATTERNS.some((pattern) => pattern.test(cartSignals.text))) {
    return false;
  }

  // Checkout CTAs can appear even on empty carts, so don't treat them as proof of line items.
  return false;
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

async function clickCheckoutCta(page: Page, profile: PlatformProfile): Promise<boolean> {
  const clickedBySelector = await clickFirstVisible(page, profile.checkoutButtonSelectors);
  if (clickedBySelector) {
    return true;
  }

  return page.evaluate(() => {
    const isVisible = (element: Element): boolean => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    const getScore = (element: Element): number => {
      const htmlElement = element as HTMLElement;
      const anchor = element as HTMLAnchorElement;
      const input = element as HTMLInputElement;
      const form = element.closest('form') as HTMLFormElement | null;
      const text = `${htmlElement.textContent || ''} ${input.value || ''}`.toLowerCase();
      const href = `${anchor.getAttribute('href') || ''}`.toLowerCase();
      const classes = `${htmlElement.className || ''}`.toLowerCase();
      const name = `${htmlElement.getAttribute('name') || ''}`.toLowerCase();
      const id = `${htmlElement.id || ''}`.toLowerCase();
      const dataAction = `${htmlElement.getAttribute('data-action') || ''}`.toLowerCase();
      const formAction = `${form?.getAttribute('action') || ''}`.toLowerCase();
      const searchable = `${text} ${href} ${classes} ${name} ${id} ${dataAction} ${formAction}`;

      if (/(continue shopping|view cart|remove|delete|wishlist|promo|coupon|track)/i.test(searchable)) {
        return -5;
      }

      let score = 0;
      if (/(checkout|check out|proceed to checkout|secure checkout|continue to checkout|begin checkout|go to checkout)/i.test(searchable)) score += 8;
      if (/(checkout-begin|coshipping|cobilling|cart-redirecttoshipping|submitcheckout|\/checkout)/i.test(searchable)) score += 8;
      if ((htmlElement.getAttribute('type') || '').toLowerCase() === 'submit') score += 1;
      if (/paypal|apple pay|google pay|shop pay/.test(searchable)) score -= 2;
      return score;
    };

    const candidates = Array.from(
      document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')
    )
      .filter((element) => {
        const htmlElement = element as HTMLElement;
        return (
          isVisible(element) &&
          !htmlElement.hasAttribute('disabled') &&
          htmlElement.getAttribute('aria-disabled') !== 'true'
        );
      })
      .map((element) => ({ element, score: getScore(element) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);

    const target = candidates[0]?.element as HTMLElement | undefined;
    if (!target) return false;
    target.click();
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
}

async function submitCheckoutFormIfPresent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button[name*="checkout" i], input[name*="checkout" i], button[id*="checkout" i], input[id*="checkout" i]'
      )
    ).filter((control) => {
      const style = window.getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });

    const target = controls[0];
    if (!target) return false;

    const form = target.closest('form') as HTMLFormElement | null;
    if (form) {
      form.requestSubmit(target as HTMLElement as HTMLButtonElement);
      return true;
    }

    target.click();
    return true;
  });
}

async function discoverCheckoutTargetsOnPage(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const targets = new Set<string>();
    const checkoutIntent = /(checkout|check out|co(?:shipping|billing)|checkout-begin|cart-redirecttoshipping|startcheckout|submitcheckout)/i;

    const maybePushUrl = (raw: string | null | undefined): void => {
      if (!raw) return;
      const candidate = raw.trim();
      if (!candidate || candidate.startsWith('javascript:') || candidate.startsWith('#')) return;
      if (!checkoutIntent.test(candidate)) return;
      try {
        const resolved = new URL(candidate, window.location.href);
        if (resolved.origin === window.location.origin) {
          targets.add(resolved.toString());
        }
      } catch {
        // ignore bad URLs
      }
    };

    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const searchable = `${anchor.getAttribute('href') || ''} ${anchor.textContent || ''}`;
      if (checkoutIntent.test(searchable)) {
        maybePushUrl(anchor.getAttribute('href'));
      }
    }

    for (const form of Array.from(document.querySelectorAll<HTMLFormElement>('form[action]'))) {
      const searchable = `${form.getAttribute('action') || ''} ${form.className || ''} ${form.id || ''}`;
      if (checkoutIntent.test(searchable)) {
        maybePushUrl(form.getAttribute('action'));
      }
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-url], [formaction], [data-action], [name], [id], [class]'))) {
      const searchable = [
        element.getAttribute('data-url') || '',
        element.getAttribute('formaction') || '',
        element.getAttribute('data-action') || '',
        element.getAttribute('name') || '',
        element.id || '',
        element.className || '',
        element.textContent || '',
      ].join(' ');
      if (!checkoutIntent.test(searchable)) continue;
      maybePushUrl(element.getAttribute('data-url'));
      maybePushUrl(element.getAttribute('formaction'));
      maybePushUrl(element.getAttribute('data-action'));
    }

    return Array.from(targets).slice(0, 10);
  });
}

async function inspectCheckoutDestination(
  page: Page,
  profile: PlatformProfile
): Promise<{ confirmed: boolean; url: string; html: string; text: string; reason?: string }> {
  const url = page.url();
  const { html, text } = await capturePageContent(page);
  return { url, html, text, ...evaluateCheckoutDestination(url, html, text, profile.id) };
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
  const profile = getPlatformProfile(opts.platform);
  const errors: CrawlError[] = [];
  const debug = (update: { stage?: string; stoppedAt?: string; addToCartResult?: AddToCartResult }): void => {
    opts.onDebugUpdate?.(update);
  };

  const onAbort = (): void => {
    void page.close().catch(() => {});
  };
  opts.abortSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    // Step 1: Find a product
    debug({ stage: 'finding-product' });
    const productUrls = await findProductUrls(page, base, opts, errors, profile);
    if (productUrls.length === 0) {
      return {
        reachedCheckout: false,
        stoppedAt: errors.length > 0 ? 'Checkout product discovery failed' : 'No product found for checkout test',
        checkoutInfo: emptyCheckoutInfo(),
        errors,
      };
    }
    let selectedProductUrl: string | undefined;
    let lastStoppedAt: string | undefined;
    let lastCheckoutInfo: CheckoutFlowInfo = emptyCheckoutInfo();

    // Step 2: Try multiple PDPs to reduce false negatives from low-quality candidate pages.
    for (const [index, productUrl] of productUrls.entries()) {
      selectedProductUrl = productUrl;
      if (opts.verbose) {
        console.log(`    → Checkout PDP attempt ${index + 1}/${productUrls.length}: ${productUrl}`);
      }

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
        continue;
      }

      await page.waitForTimeout(1500);
      if (await pageLooksSoldOut(page)) {
        if (opts.verbose) {
          console.log('    → Skipping sold-out/unavailable PDP candidate');
        }
        continue;
      }
      debug({ stage: 'add-to-cart' });
      const addToCartResult = await tryAddToCart(page, base, opts.verbose, profile);
      debug({ stage: 'after-add-to-cart', addToCartResult });
      if (addToCartResult.added) {
        // Step 3: Navigate to checkout once add-to-cart is confirmed.
        debug({ stage: 'checkout-navigation' });
        const { reachedCheckout, stoppedAt, html, text } = await navigateToCheckout(
          page,
          base,
          opts,
          errors,
          profile,
          addToCartResult,
          productUrl
        );
        debug({ stage: reachedCheckout ? 'checkout-reached' : 'checkout-not-reached', stoppedAt });

        const checkoutInfo = extractCheckoutInfo(html, text, `${profile.label} checkout`);
        lastStoppedAt = stoppedAt;
        lastCheckoutInfo = checkoutInfo;
        if (reachedCheckout) {
          return { reachedCheckout, stoppedAt, checkoutInfo, errors: [] };
        }

        // If a candidate fell into tracking/empty-cart dead ends, keep trying other PDP candidates.
        if (stoppedAt && /tracking page|cart remained empty|add-to-cart|checkout-navigation/i.test(stoppedAt)) {
          if (opts.verbose) {
            console.log(`    → Checkout candidate did not progress (${stoppedAt}); trying next PDP candidate`);
          }
          continue;
        }

        // For non-retryable outcomes (e.g. login required), stop early and return what we learned.
        return { reachedCheckout: false, stoppedAt, checkoutInfo, errors };
      } else if (addToCartResult.blocked) {
        lastStoppedAt = addToCartResult.blockReason || 'Blocked during add-to-cart';
        errors.push({
          url: productUrl,
          error: lastStoppedAt,
          type: 'blocked',
        });
      }
    }

    return {
      reachedCheckout: false,
      stoppedAt: lastStoppedAt || (selectedProductUrl
        ? `Add-to-cart could not be confirmed across ${productUrls.length} PDP candidate(s)`
        : 'Checkout product page failed to load'),
      checkoutInfo: lastCheckoutInfo,
      errors,
    };
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

async function findProductUrls(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  base: string,
  opts: CheckoutTestOptions,
  errors: CrawlError[],
  profile: PlatformProfile
): Promise<string[]> {
  const preferredCandidates = buildCheckoutProductCandidatesForPlatform(base, opts.preferredProductUrls, profile.id);
  const candidates: string[] = [];
  const seen = new Set<string>();
  const remember = (url: string | null): void => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push(url);
  };

  if (preferredCandidates.length > 0) {
    const bestStandardCandidate = preferredCandidates.find(
      (url) => !LOW_QUALITY_CHECKOUT_PRODUCT_PATTERNS.some((pattern) => pattern.test(url))
    );
    const orderedCandidates = bestStandardCandidate
      ? [bestStandardCandidate, ...preferredCandidates.filter((url) => url !== bestStandardCandidate)]
      : preferredCandidates;
    if (opts.verbose) {
      console.log(`    → Checkout candidate PDP: ${orderedCandidates[0]}`);
      if (bestStandardCandidate && preferredCandidates[0] !== orderedCandidates[0]) {
        console.log('    → Skipped promo/sample candidate in favor of a standard PDP');
      }
    }
    for (const candidate of orderedCandidates) {
      remember(candidate);
      if (candidates.length >= MAX_CHECKOUT_PRODUCT_ATTEMPTS) return candidates;
    }
  }

  const collectionPaths = profile.productDiscoveryPaths.map((path) => path === '/' ? base : buildSiteUrl(base, path));

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
            const hasProductHint = /\/products\/[^/?#]+|\/p\/[^/?#]+|Product-Show|[?&]pid=|\/product\/[^/?#]+/i.test(href);
            const isQuickView = /Product-ShowQuickView|QuickView/i.test(href);
            const isNonPurchasableAction = /Wishlist-Add|Compare-AddProduct|Search-ShowAjax|\/on\/demandware\.store\/.*(?:Wishlist|Compare|Account)-/i.test(href);

            if (!hasProductHint || isQuickView || isNonPurchasableAction) {
              return { href, score: -100 };
            }

            if (/\/products\/[^/?#]+/i.test(href)) score += 8;
            if (/\/p\/[^/?#]+/i.test(href)) score += 8;
            if (/Product-Show|[?&]pid=|\/product\/[^/?#]+/i.test(href)) score += 8;
            if (/product|card|tile|item/i.test(classes)) score += 4;
            if (/shop now|quick add|add to cart|buy now/i.test(text)) score += 3;
            if (/collections|pages|blog|account|login|cart|checkout/i.test(href)) score -= 6;
            if (/sold-?out|out-?of-?stock/i.test(href)) score -= 10;
            if (href.includes('?variant=')) score -= 4;

            return { href, score };
          })
          .filter((candidate) => candidate.href && candidate.score > 0)
          .sort((a, b) => b.score - a.score);

        return candidates[0]?.href || null;
      });

      if (productLink) {
        remember(productLink);
        if (candidates.length >= MAX_CHECKOUT_PRODUCT_ATTEMPTS) break;
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

async function tryAddToCart(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  base: string,
  verbose = false,
  profile: PlatformProfile
): Promise<AddToCartResult> {
  await dismissInterferingOverlays(page, verbose);
  await ensurePurchasableVariant(page, verbose);
  await dismissInterferingOverlays(page, verbose);

  const startingUrl = page.url();
  const addToCartResponsePattern = /Cart-Add|AddProuctVariationSelection|cart\/add|bag\/add/i;
  let sawBlockedAddToCart = false;
  for (const selector of profile.addToCartSelectors) {
    try {
      const matches = page.locator(selector);
      const count = Math.min(await matches.count(), 6);
      for (let index = 0; index < count; index++) {
        const button = matches.nth(index);
        if (await button.isVisible({ timeout: 1200 }).catch(() => false)) {
          const addToCartResponsePromise = page
            .waitForResponse((response) => {
              return (
                addToCartResponsePattern.test(response.url()) &&
                ['POST', 'PUT', 'PATCH'].includes(response.request().method().toUpperCase())
              );
            }, { timeout: 5000 })
            .catch(() => null);

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
          const addToCartResponse = await addToCartResponsePromise;
          const addToCartResponseStatus = addToCartResponse?.status() ?? null;
          const addToCartResponseText = await readResponseText(addToCartResponse);
          await page.waitForTimeout(2500);

          const responseRateLimited =
            addToCartResponseStatus === 429 ||
            ADD_TO_CART_RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(addToCartResponseText));
          if (responseRateLimited) {
            if (verbose) {
              console.log('    → Add-to-cart appears rate-limited; backing off before next attempt');
            }
            sawBlockedAddToCart = true;
            await page.waitForTimeout(4500);
            continue;
          }

          const responseRejected = ADD_TO_CART_REJECTION_PATTERNS.some((pattern) => pattern.test(addToCartResponseText));
          if (addToCartResponse && addToCartResponseStatus !== null && addToCartResponseStatus >= 400) {
            continue;
          }

          if (addToCartResponse && addToCartResponseStatus !== null && addToCartResponseStatus < 400 && !responseRejected) {
            return { added: true, currentUrl: page.url(), cartReady: true };
          }

          if (urlLooksLikeCheckout(page.url(), profile)) {
            return { added: true, currentUrl: page.url(), cartReady: true };
          }

          const pageText = await page.evaluate(() => document.body.innerText);
          const combinedDiagnosticText = `${addToCartResponseText}\n${pageText.toLowerCase()}`;
          if (ADD_TO_CART_RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(combinedDiagnosticText))) {
            if (verbose) {
              console.log('    → Rate-limit/block signal detected from page content; retrying with backoff');
            }
            sawBlockedAddToCart = true;
            await page.waitForTimeout(4500);
            continue;
          }
          if (ADD_TO_CART_REJECTION_PATTERNS.some((pattern) => pattern.test(combinedDiagnosticText))) {
            continue;
          }
          const reportsEmptyCart = EMPTY_CART_PATTERNS.some((pattern) => pattern.test(pageText.toLowerCase()));
          if (!reportsEmptyCart && SUCCESS_CART_PATTERNS.some((pattern) => pattern.test(pageText))) {
            if (await confirmCartHasItems(page)) {
              return { added: true, currentUrl: page.url(), cartReady: true };
            }
          }

          const drawerOpened = await openCartDrawerIfPresent(page);
          if (drawerOpened) {
            const cartHasItems = await confirmCartHasItems(page);
            if (cartHasItems) {
              return { added: true, currentUrl: page.url(), cartReady: true };
            }
          }

          if (page.url() !== startingUrl) {
            if (urlLooksLikeCart(page.url()) && !(await confirmCartHasItems(page))) {
              continue;
            }
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
    const form = await page.$(
      [
        'form.pdpForm',
        'form[action*="/cart/add"]',
        'form[action*="/bag/add"]',
        'form[action*="Cart-AddProduct"]',
        'form[action*="Cart-AddProuct"]',
        'form[action*="AddProuctVariationSelection"]',
      ].join(', ')
    );
    if (form) {
      const addToCartResponsePromise = page
        .waitForResponse((response) => {
          return (
            addToCartResponsePattern.test(response.url()) &&
            ['POST', 'PUT', 'PATCH'].includes(response.request().method().toUpperCase())
          );
        }, { timeout: 5000 })
        .catch(() => null);
      await form.evaluate((f: HTMLFormElement) => f.requestSubmit());
      const addToCartResponse = await addToCartResponsePromise;
      const addToCartResponseStatus = addToCartResponse?.status() ?? null;
      const addToCartResponseText = await readResponseText(addToCartResponse);
      await page.waitForTimeout(2000);
      const responseRateLimited =
        addToCartResponseStatus === 429 ||
        ADD_TO_CART_RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(addToCartResponseText));
      if (responseRateLimited) {
        sawBlockedAddToCart = true;
        await page.waitForTimeout(4500);
      } else if (
        addToCartResponse &&
        addToCartResponseStatus !== null &&
        addToCartResponseStatus < 400 &&
        !ADD_TO_CART_REJECTION_PATTERNS.some((pattern) => pattern.test(addToCartResponseText))
      ) {
        return { added: true, currentUrl: page.url(), cartReady: true };
      }
      if (await confirmCartHasItems(page)) {
        return { added: true, currentUrl: page.url(), cartReady: true };
      }
    }
  } catch {
    // Continue
  }

  const cartUrl = buildSiteUrl(base, profile.cartPaths[0] || '/cart');
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

  return {
    added: false,
    currentUrl: page.url(),
    cartReady: false,
    blocked: sawBlockedAddToCart,
    blockReason: sawBlockedAddToCart ? 'Blocked or rate-limited during add-to-cart' : undefined,
  };
}

async function navigateToCheckout(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  base: string,
  opts: CheckoutTestOptions,
  errors: CrawlError[],
  profile: PlatformProfile,
  addToCartResult: AddToCartResult,
  sourceProductUrl?: string
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

  if (urlLooksLikeCheckout(addToCartResult.currentUrl, profile)) {
    const destination = await inspectCheckoutDestination(page, profile);
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

  const localePrefix =
    inferLocalePathPrefix(addToCartResult.currentUrl) ||
    inferLocalePathPrefix(sourceProductUrl || '') ||
    inferLocalePathPrefix(page.url());

  // First try from cart page
  try {
    const cartCandidates = Array.from(new Set([
      ...(addToCartResult.currentUrl ? [addToCartResult.currentUrl] : []),
      ...profile.cartPaths.map((cartPath) => buildSiteUrl(base, cartPath)),
      buildSiteUrl(base, '/cart'),
      ...(localePrefix ? [buildSiteUrl(base, `${localePrefix}/cart`)] : []),
    ]));

    for (const cartUrl of cartCandidates) {
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
        continue;
      }

      await page.waitForTimeout(1500);
      await dismissInterferingOverlays(page, opts.verbose);

      const cartContent = await capturePageContent(page);
      checkoutState.checkoutHtml = cartContent.html;
      checkoutState.checkoutText = cartContent.text;

      if (!await confirmCartHasItems(page) && addToCartResult.added) {
        checkoutState.stoppedAt = 'Cart remained empty after add-to-cart attempt';
        opts.onDebugUpdate?.({ stage: 'cart-empty-after-add-to-cart', stoppedAt: checkoutState.stoppedAt });
      }

      if (await clickCheckoutCta(page, profile)) {
        await page.waitForTimeout(3000);

        const destination = await inspectCheckoutDestination(page, profile);
        applyCheckoutDestination(destination, checkoutState);
        if (checkoutState.stoppedAt) {
          opts.onDebugUpdate?.({ stage: 'checkout-cta-result', stoppedAt: checkoutState.stoppedAt });
        }
      }
      if (!checkoutState.reachedCheckout) {
        await dismissInterferingOverlays(page, opts.verbose);
        const drawerOpened = await openCartDrawerIfPresent(page);
        if (drawerOpened) {
          if (await clickCheckoutCta(page, profile)) {
            await page.waitForTimeout(3000);
            const destination = await inspectCheckoutDestination(page, profile);
            applyCheckoutDestination(destination, checkoutState);
            if (checkoutState.stoppedAt) {
              opts.onDebugUpdate?.({ stage: 'drawer-checkout-cta-result', stoppedAt: checkoutState.stoppedAt });
            }
          }
        }
      }

      if (!checkoutState.reachedCheckout && !checkoutState.stoppedAt && await submitCheckoutFormIfPresent(page)) {
        await page.waitForTimeout(2500);
        const destination = await inspectCheckoutDestination(page, profile);
        applyCheckoutDestination(destination, checkoutState);
        if (checkoutState.stoppedAt) {
          opts.onDebugUpdate?.({ stage: 'checkout-form-submit-result', stoppedAt: checkoutState.stoppedAt });
        }
      }

      if (!checkoutState.reachedCheckout) {
        const discoveredTargets = await discoverCheckoutTargetsOnPage(page);
        for (const target of discoveredTargets) {
          const navResult = await gotoWithRetry(page, target, {
            timeout: opts.timeout,
            maxRetries: 1,
            verbose: opts.verbose,
            referer: cartUrl,
            waitForNetworkIdle: true,
          });
          const statusCode = navResult.response?.status();
          if (navResult.error || navResult.blocked || (statusCode && statusCode >= 400)) {
            pushCheckoutError(errors, target, navResult, statusCode);
            continue;
          }

          await page.waitForTimeout(1500);
          const destination = await inspectCheckoutDestination(page, profile);
          applyCheckoutDestination(destination, checkoutState);
          if (checkoutState.stoppedAt) {
            opts.onDebugUpdate?.({ stage: 'discovered-checkout-target-result', stoppedAt: checkoutState.stoppedAt });
          }
          if (destination.confirmed || destination.reason) {
            break;
          }
        }
      }

      if (checkoutState.reachedCheckout || checkoutState.stoppedAt) {
        break;
      }
    }
  } catch {
    // Cart navigation failed
  }

  // Try direct checkout navigation
  if (!checkoutState.reachedCheckout) {
    const rawCheckoutPaths = new Set<string>(profile.checkoutPaths);
    if (localePrefix) {
      for (const checkoutPath of profile.checkoutPaths) {
        const normalized = checkoutPath.startsWith('/') ? checkoutPath : `/${checkoutPath}`;
        rawCheckoutPaths.add(`${localePrefix}${normalized}`);
      }
      rawCheckoutPaths.add(`${localePrefix}/checkout`);
      rawCheckoutPaths.add(`${localePrefix}/Checkout-Begin`);
      rawCheckoutPaths.add(`${localePrefix}/COShipping-Start`);
    }

    for (const path of Array.from(rawCheckoutPaths).map((checkoutPath) => buildSiteUrl(base, checkoutPath))) {
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

        const destination = await inspectCheckoutDestination(page, profile);
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
