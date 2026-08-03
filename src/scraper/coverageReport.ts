import type { CrawlSummary } from './types.js';

export type EvidenceCoverageLevel = 'strong' | 'usable' | 'partial' | 'blocked' | 'empty';

export interface EvidenceCoverageReport {
  level: EvidenceCoverageLevel;
  headline: string;
  /** Short “what happened” line for the Summary card. */
  whatHappened: string;
  /** Clear advice on how the SE should proceed. */
  howToProceed: string;
  gathered: string[];
  missing: string[];
  notes: string[];
}

function hasPolicySignal(summary: CrawlSummary): boolean {
  const policy = summary.policyInfo;
  if (!policy) return false;
  return Boolean(
    policy.returnWindow ||
      policy.returnProvider ||
      policy.returnPortal ||
      (policy.returnFees && policy.returnFees.length > 0) ||
      (policy.finalSaleItems && policy.finalSaleItems.length > 0) ||
      policy.freeReturns ||
      policy.freeExchanges ||
      policy.giftWithPurchase
  );
}

function hasCatalogSignal(summary: CrawlSummary): boolean {
  const catalog = summary.catalogFeatures;
  if (!catalog) return false;
  return Boolean(
    catalog.bundlesDetected ||
      catalog.customizableProducts ||
      catalog.virtualProducts ||
      catalog.giftCardsDetected ||
      catalog.subscriptionsDetected ||
      catalog.preOrdersDetected ||
      catalog.gwpDetected
  );
}

function hasCheckoutDetail(summary: CrawlSummary): boolean {
  const info = summary.checkoutInfo;
  if (!info) return false;
  return Boolean(
    (info.expressWallets && info.expressWallets.length > 0) ||
      (info.paymentMethods && info.paymentMethods.length > 0) ||
      (info.bnplOptions && info.bnplOptions.length > 0) ||
      (info.shippingOptions && info.shippingOptions.length > 0) ||
      info.giftCardOption ||
      info.checkoutType
  );
}

function formatMissingForAdvice(missing: string[]): string {
  const shortLabels = missing
    .map((item) => {
      if (/checkout/i.test(item)) return 'checkout / payments';
      if (/product page/i.test(item)) return 'PDP details';
      if (/policy/i.test(item)) return 'returns / shipping policy';
      if (/apps|third-party/i.test(item)) return 'apps / integrations';
      if (/catalog/i.test(item)) return 'catalog features';
      if (/site pages/i.test(item)) return 'page evidence';
      return item;
    })
    .filter((value, index, all) => all.indexOf(value) === index);
  if (shortLabels.length === 0) return 'the gaps listed below';
  if (shortLabels.length === 1) return shortLabels[0];
  if (shortLabels.length === 2) return `${shortLabels[0]} and ${shortLabels[1]}`;
  return `${shortLabels.slice(0, -1).join(', ')}, and ${shortLabels[shortLabels.length - 1]}`;
}

/**
 * Human-readable gathered vs missing coverage for Summary UI and WA prompts.
 * Checkout is treated as best-effort for SFCC (and never required for a usable WA).
 */
export function buildEvidenceCoverageReport(summary: CrawlSummary): EvidenceCoverageReport {
  const gathered: string[] = [];
  const missing: string[] = [];
  const notes: string[] = [];
  const isSfcc = summary.selectedPlatform?.id === 'sfcc';
  const rateLimited = (summary.scrapeQuality?.degradedReasons || []).includes('rate_limited')
    || /rate limit|429/i.test(summary.checkoutStoppedAt || '')
    || (summary.errors || []).some((error) => /429|503|rate limit/i.test(error.error));

  if (summary.pagesVisited > 0) {
    gathered.push(`Site pages crawled (${summary.pagesVisited})`);
  } else {
    missing.push('Site pages (crawl collected 0 pages)');
  }

  if (summary.productPagesScraped > 0) {
    gathered.push(`Product pages sampled (${summary.productPagesScraped})`);
  } else if (summary.checkoutReached) {
    notes.push('Dedicated PDP sample count is 0, but a product path was used to reach checkout.');
  } else {
    missing.push('Dedicated product page samples');
  }

  if (hasPolicySignal(summary)) {
    gathered.push('Policy / returns signals');
  } else {
    missing.push('Policy / returns signals');
  }

  if ((summary.thirdPartiesDetected || []).length > 0 || (summary.technologies || []).length > 0) {
    gathered.push('Apps / third-party detections');
  } else {
    missing.push('Apps / third-party detections');
  }

  if (hasCatalogSignal(summary)) {
    gathered.push('Catalog feature signals');
  } else {
    missing.push('Catalog feature signals');
  }

  if (summary.checkoutReached) {
    gathered.push('Checkout page reached');
    if (hasCheckoutDetail(summary)) {
      gathered.push('Checkout payment / wallet / shipping details');
    }
  } else if (summary.checkoutSkipped) {
    notes.push(
      summary.checkoutStoppedAt
        ? `Checkout skipped: ${summary.checkoutStoppedAt}`
        : 'Checkout was skipped for this run.'
    );
    missing.push('Checkout page (not reached)');
  } else {
    missing.push(
      summary.checkoutStoppedAt
        ? `Checkout page (stopped: ${summary.checkoutStoppedAt})`
        : 'Checkout page (not reached)'
    );
  }

  if (summary.botDetectionWarning) {
    notes.push(summary.botDetectionWarning);
  }
  if (summary.scrapingCompletionWarning) {
    notes.push(summary.scrapingCompletionWarning);
  }
  if (rateLimited) {
    notes.push('Site rate-limited Sweep (HTTP 429/503). Further product/checkout probing was limited.');
  }
  if (isSfcc) {
    notes.push(
      'On SFCC, checkout is best-effort. Missing checkout does not mean the assessment failed when pages, policies, or apps were collected.'
    );
  }

  const fillIn = formatMissingForAdvice(missing);
  let level: EvidenceCoverageLevel;
  let headline: string;
  let whatHappened: string;
  let howToProceed: string;

  if (summary.pagesVisited === 0 && summary.botDetectionWarning) {
    level = 'blocked';
    headline = 'Blocked — Sweep could not collect site evidence.';
    whatHappened = 'The site’s bot protection stopped the crawl before useful pages were collected.';
    howToProceed =
      'Do not draft the WA from this run alone. Retry later, use merchant-provided links/screenshots, or continue manually in your browser and fill the WA from that.';
  } else if (summary.pagesVisited === 0) {
    level = 'empty';
    headline = 'No usable page evidence collected.';
    whatHappened = 'The crawl finished without storing page content Sweep can use for a WA.';
    howToProceed =
      'Retry the run, confirm the URL/platform, or gather evidence manually and fill in the WA yourself.';
  } else if (summary.checkoutReached && summary.pagesVisited >= 5) {
    level = 'strong';
    headline = 'Strong coverage — crawl and checkout evidence available.';
    whatHappened = 'Sweep collected pages and reached checkout, so most WA sections have automated evidence.';
    howToProceed =
      missing.length > 0
        ? `Copy the prompt and generate the WA, then quickly fill in ${fillIn} if still needed.`
        : 'Copy the prompt and generate the WA. Spot-check anything that looks thin, then send.';
  } else if (summary.pagesVisited >= 5 && (hasPolicySignal(summary) || (summary.thirdPartiesDetected || []).length > 0)) {
    level = 'usable';
    headline = isSfcc
      ? 'Useful SFCC evidence — continue the WA, but fill in gaps.'
      : 'Useful evidence — continue the WA, but fill in gaps.';
    whatHappened = isSfcc
      ? 'Sweep gathered enough pages/policies/apps for a usable assessment. Checkout was best-effort and was not fully completed.'
      : 'Sweep gathered useful site evidence, but some sections are incomplete.';
    howToProceed =
      `Use what Sweep gathered for the draft WA, then manually fill in ${fillIn} (open the live site if needed). Mark those fields Unconfirmed until you verify them.`;
  } else {
    level = 'partial';
    headline = 'Partial evidence — useful start, but you will need to fill in more.';
    whatHappened = 'Sweep only collected a limited slice of the site, so several WA sections will be thin or blank.';
    howToProceed =
      `Keep anything Sweep found, then fill in ${fillIn} from the live site or merchant materials before you finalize.`;
  }

  return { level, headline, whatHappened, howToProceed, gathered, missing, notes };
}
