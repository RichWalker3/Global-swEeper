/**
 * Checkout flow testing
 * Attempts to add items to cart and navigate to checkout
 */

import { BrowserContext } from 'playwright';
import type { CheckoutFlowInfo } from './types.js';
import { extractCheckoutInfo } from './policyExtractor.js';

export interface CheckoutTestResult {
  reachedCheckout: boolean;
  stoppedAt?: string;
  checkoutInfo: CheckoutFlowInfo;
}

export interface CheckoutTestOptions {
  timeout: number;
  verbose?: boolean;
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
  'a[href*="/checkout"]',
  'button:has-text("Checkout")',
  'button:has-text("Check out")',
  'input[name="checkout"]',
  '.checkout-button',
  '#checkout',
];

/**
 * Test checkout flow by adding an item and navigating to checkout
 */
export async function testCheckoutFlow(
  context: BrowserContext,
  seedUrl: string,
  opts: CheckoutTestOptions
): Promise<CheckoutTestResult | null> {
  const page = await context.newPage();
  const base = seedUrl.replace(/\/$/, '');

  try {
    // Step 1: Find a product
    const productUrl = await findProductUrl(page, base, opts.timeout);
    if (!productUrl) {
      await page.close();
      return null;
    }

    // Step 2: Go to product and add to cart
    await page.goto(productUrl, { timeout: opts.timeout, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await tryAddToCart(page);

    // Step 3: Navigate to checkout
    const { reachedCheckout, stoppedAt, html, text } = await navigateToCheckout(page, base, opts.timeout);

    // Extract checkout info
    const checkoutInfo = extractCheckoutInfo(html, text);

    await page.close();

    return { reachedCheckout, stoppedAt, checkoutInfo };
  } catch (error) {
    await page.close();
    throw error;
  }
}

async function findProductUrl(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  base: string,
  timeout: number
): Promise<string | null> {
  const collectionPaths = [`${base}/collections/all`, `${base}/products`];

  for (const path of collectionPaths) {
    try {
      await page.goto(path, { timeout, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const productLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/products/"]'));
        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          if (!href.includes('?variant=') && !href.includes('/products?')) {
            return href;
          }
        }
        return null;
      });

      if (productLink) return productLink;
    } catch {
      continue;
    }
  }

  return null;
}

async function tryAddToCart(page: Awaited<ReturnType<BrowserContext['newPage']>>): Promise<boolean> {
  for (const selector of ADD_TO_CART_SELECTORS) {
    try {
      const button = await page.$(selector);
      if (button && await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(2000);
        return true;
      }
    } catch {
      continue;
    }
  }

  // Try form submission as fallback
  try {
    const form = await page.$('form[action*="/cart/add"]');
    if (form) {
      await form.evaluate((f: HTMLFormElement) => f.submit());
      await page.waitForTimeout(2000);
      return true;
    }
  } catch {
    // Continue
  }

  return false;
}

async function navigateToCheckout(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  base: string,
  timeout: number
): Promise<{ reachedCheckout: boolean; stoppedAt?: string; html: string; text: string }> {
  let checkoutHtml = '';
  let checkoutText = '';
  let reachedCheckout = false;
  let stoppedAt: string | undefined;

  // First try from cart page
  try {
    await page.goto(`${base}/cart`, { timeout, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    checkoutHtml = await page.content();
    checkoutText = await page.evaluate(() => document.body.innerText);

    // Try checkout buttons
    for (const selector of CHECKOUT_BUTTON_SELECTORS) {
      try {
        const button = await page.$(selector);
        if (button && await button.isVisible()) {
          await button.click();
          await page.waitForTimeout(3000);

          const currentUrl = page.url();
          if (currentUrl.includes('checkout') || currentUrl.includes('checkouts')) {
            reachedCheckout = true;
            stoppedAt = currentUrl;
            checkoutHtml = await page.content();
            checkoutText = await page.evaluate(() => document.body.innerText);
          }
          break;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Cart navigation failed
  }

  // Try direct checkout navigation
  if (!reachedCheckout) {
    for (const path of [`${base}/checkout`, `${base}/checkouts`]) {
      try {
        await page.goto(path, { timeout, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const currentUrl = page.url();
        if (currentUrl.includes('checkout')) {
          reachedCheckout = true;
          stoppedAt = currentUrl;
          checkoutHtml = await page.content();
          checkoutText = await page.evaluate(() => document.body.innerText);
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Check if redirected to login
  if (!reachedCheckout && (page.url().includes('account') || page.url().includes('login'))) {
    stoppedAt = 'Login required';
  }

  return { reachedCheckout, stoppedAt, html: checkoutHtml, text: checkoutText };
}
