/**
 * Prompt builder for Claude extraction
 */

import type { ScrapeResult, PageData, CrawlSummary, KnownPlatform } from '../scraper/types.js';
import { BRD_REQUIREMENTS } from '../brd/requirements.js';
import { buildEvidenceCoverageReport } from '../scraper/coverageReport.js';
import { getPlatformProfile } from '../scraper/platforms/index.js';

export type PromptResponseFormat = 'markdown' | 'json';

interface BuildPromptOptions {
  responseFormat?: PromptResponseFormat;
  selectedPlatform?: KnownPlatform;
}

const SYSTEM_PROMPT = `You are analyzing evidence collected from an e-commerce website. Your task is to produce a Website Assessment (WA) using only the provided evidence bundle.

## Writing Perspective

Write from the perspective of a Global-e Presales Solutions Engineer documenting the merchant's current state and any future project scope that the merchant may want included.

- Focus on what the merchant is doing today.
- Capture current cross-border behavior, checkout flows, logistics, payments, localization, and related operating details.
- Note future-state needs only when they are explicitly visible or clearly implied by the evidence.
- Do **not** explain where Global-e fits.
- Do **not** use "GE to provide", "Global-e will", or solution-proposal language.
- Do **not** turn the WA into a recommendation memo. This is a current-state and scope-capture document first.

## Ground Rules

1. **Label every line item** as **✅ Verified**, **❔ Unconfirmed**, or **❌ Absent**.
2. **Show receipts.** Add explicit evidence URLs that resolve to specific pages.
3. **Be honest about certainty.** If something involves deduction, mark it with **[Inference]**.
4. **Use bullet points (-)** not numbered lists (Jira doesn't render numbered lists well).
5. **Anchor the assessment in concrete proof.** Prefer one real PDP URL, one real shipping/returns page, and the farthest checkout/cart state actually reached.
6. **Differentiate skipped vs failed checkout.** If checkout was intentionally skipped for speed, say so plainly instead of implying the site blocked progress.

## Output Template

Generate a complete Website Assessment following this EXACT structure:

### Merchant Overview

- **Brand:** [name]
- **Primary URL:** [url]
- **Other Locales / Sites:** [list or "None detected"]
- **Notes / Scope of this pass:** [e.g., "Desktop, US region, stepped through checkout, no purchase"]

### Evidence Log (Working Links)

- **Home:** [url]
- **PDP (example):** [url]
- **Cart:** [url]
- **Checkout (as far as allowed):** [description]
- **Shipping policy:** [url]
- **Returns policy:** [url]
- **Payments or FAQ page:** [url]
- **Loyalty / Rewards page:** [url or ❌ Absent]
- **Subscriptions page:** [url or ❌ Absent]
- **Other key proof links:** [list]

---

## Platform & Site Structure

- **Platform & Version** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Headless / Frontend architecture** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Domain and subdomain strategy** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Geo / Country selector** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Languages / translation approach** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Mobile experience** — Status: [✅/❔/❌]
  - **Evidence:** [details]

---

## Catalog & Products

- **Product types and variants** — Status: [✅/❔/❌]
  - **Evidence:** [details, note any dangerous goods]
- **Bundles / kits** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Customizable products / product configurator** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Virtual / Digital products** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **GWP / Free product promotions / Try & Buy** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Pre-orders** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Subscriptions on PDP or cart** — Status: [✅/❔/❌]
  - **Evidence:** [details, note provider like Recharge]
- **UGC / Reviews provider** — Status: [✅/❔/❌]
  - **Evidence:** [details]

**Takeaway:** [1-2 sentence summary]

---

## Checkout & Payments

- **Checkout flow type** — Status: [✅/❔/❌]
  - **Evidence:** [e.g., Shopify hosted, multi-step]
- **Express wallets** — Status: [✅/❔/❌]
  - **Evidence:** [list: Shop Pay, PayPal, Apple Pay, Google Pay, etc.]
- **Payment methods** — Status: [✅/❔/❌]
  - **Evidence:** [cards, BNPL like Afterpay/Klarna/Affirm]
- **Gift cards** — Status: [✅/❔/❌]
  - **Evidence:** [native or vendor]
- **Taxes display** — Status: [✅/❔/❌]
  - **Evidence:** [incl or excl, at cart or checkout]
- **Duties display** — Status: [✅/❔/❌]
  - **Evidence:** [estimated or prepaid option]

---

## Shipping & Logistics

- **Shipping tiers and SLAs** — Status: [✅/❔/❌]
  - **Evidence:** [domestic, international rates/times]
- **Carriers** — Status: [✅/❔/❌]
  - **Evidence:** [visible labels or policy mention]
- **Cross-border approach** — Status: [✅/❔/❌]
  - **Evidence:** [same site with calc vs separate intl site]
- **Returns and exchanges** — Status: [✅/❔/❌]
  - **Evidence:** [policy summary, return window, fees]
- **Final Sale / non-returnable items** — Status: [✅/❔/❌]
  - **Evidence:** [where labeled, policy coverage]

**Takeaway:** [1-2 sentence summary]

---

## Loyalty, Subscriptions, and CRM

- **Loyalty / rewards program** — Status: [✅/❔/❌]
  - **Evidence:** [vendor, program name, earn/burn rules]
- **Subscriptions provider** — Status: [✅/❔/❌]
  - **Evidence:** [e.g., Recharge, Bold]
- **Email / SMS** — Status: [✅/❔/❌]
  - **Evidence:** [Klaviyo, Attentive, etc.]

---

## Business Restrictions

- **B2B / wholesale flows** — Status: [✅/❔/❌]
  - **Evidence:** [details]
- **Marketplace presence** — Status: [✅/❔/❌]
  - **Evidence:** [Amazon, eBay, etc.]

**Takeaway:** [1-2 sentence summary]

---

## Apps, Integrations, and Data Layer

- **Notable apps or widgets** — Status: [✅/❔/❌]
  - **Evidence:** [list apps detected]
- **Analytics tags** — Status: [✅/❔/❌]
  - **Evidence:** [GA4, GTM, others]

**Takeaway:** [1-2 sentence summary]

---

## Tech Risks and Integration Notes (Presales)

### 🚩 Red Flags

- [List any critical issues - Smile.io, Recharge, competitors, etc.]

- **Constraints or red flags:** [list]
- **Likely integration surfaces:** [webhooks, APIs, metafields] [Inference]
- **Level of effort estimate:** [T-shirt size] [Inference]

---

## Open Questions

- [List questions needing merchant clarification]

## Next Steps

- [List recommended actions]

---

### Legend

- **✅ Verified** — Direct UI evidence or authoritative policy page.
- **❔ Unconfirmed** — Signal seen but vendor or behavior not fully proven.
- **❌ Absent** — Looked in reasonable places and did not find it.
- **[Inference]** — Clearly labeled deduction with best available evidence.

## Red Flags to Always Call Out (🚩)

- **Smile.io** — NOT supported by Global-e
- **Recharge** — Proprietary checkout, often OoS
- **Reach / Flow Commerce / Zonos** — Competitor cross-border solutions
- **Crypto/Bitcoin payments** — Not supported
- **Amazon fulfillment** — OoS
- **Variable restocking fees** — GE needs static percentage

## Rules

- **Be conservative:** If unsure, mark as ❔ Unconfirmed. Don't hallucinate.
- **Cite evidence:** For ✅ items, include URL and brief quote.
- **Keep quotes concise:** 1-2 sentences max.
- **Use plain URLs:** So document can be copy-pasted into Jira/Confluence.
- **Use bullet points (-):** Not numbered lists.

## BRD Output for Sweep

At the end of the Website Assessment, add a section named exactly:

## BRD Output for Sweep

This section is machine-read by Sweep. Include a bullet **only for BRDs where the WA has evidence, a useful finding, or a scoping note**.

Use this one-line format for included BRDs:

- BRD-001 | Hub locations and entities | Status: Done | SE Output: [concise SE scoping note based only on WA evidence]

Use these rules:
- Use **Status: Done** only when the WA includes evidence, a useful finding, or a scoping note for that BRD.
- **Omit BRDs with no evidence** — do not list absent features. Sweep will default those rows to Phase Out Of Scope without changing Jira status.
- **HubSpot/Sales-primary BRDs** (BRD-001, BRD-002, BRD-003, BRD-004, BRD-005, BRD-007, BRD-010): include them **only when the WA has concrete evidence**. If you have no evidence, omit them — Sweep will write a short "no evidence" note and leave Phase/Status alone for Sales.
- Keep each SE Output note concise but useful for a Jira field.
- Do not invent merchant capabilities.
- Never write "No WA evidence found." or use Status: Canceled.
- Keep each included BRD on one line so Sweep can parse it.`;

const HIGH_SIGNAL_CATEGORIES = new Set([
  'shipping',
  'returns',
  'faq',
  'checkout',
  'pdp',
  'payments',
  'duties_taxes',
  'international',
  'subscriptions',
  'loyalty',
  'gift_cards',
  'compliance',
  'b2b',
  'dropship',
]);

const HIGH_SIGNAL_URL_PATTERNS = [
  /\/(products?|p)\//i,
  /\/(cart|bag|basket)\b/i,
  /\/(checkout|checkouts)\b/i,
  /\/(shipping|returns?|refund|faq|help|support|loyalty|rewards?|subscriptions?)\b/i,
];

export function buildPrompt(
  scrapeResult: ScrapeResult,
  options: BuildPromptOptions = {}
): { system: string; user: string } {
  const { summary, pages } = scrapeResult;
  const responseFormat = options.responseFormat || 'markdown';
  const selectedPlatform = getPlatformProfile(options.selectedPlatform || summary.selectedPlatform?.id);

  // Group pages by tier for token optimization
  const { tierOne, tierTwo, tierThree } = groupPagesByTier(pages);

  const responseContract =
    responseFormat === 'json'
      ? `## Response Format

Return a single valid JSON object. Do not return Markdown.

Use these exact top-level keys:
- meta
- evidenceLog
- platform
- catalog
- checkout
- shipping
- loyaltyCrm
- internationalization
- legal
- businessRestrictions
- integrations
- techRisks
- openQuestions
- nextSteps
- crawlSummary

For every check-style field:
- status must be one of "verified", "unconfirmed", or "absent"
- evidence must be an array of { "url", "quote", "inference?" } when available
- notes and searchedUrls are optional

Keep crawlSummary aligned to the provided summary.`
      : `## Response Format

Respond with ONLY the Markdown Website Assessment. No preamble, no explanation after.`;

  const scrapeErrorCount = summary.errors?.length || 0;
  const coverage = buildEvidenceCoverageReport(summary);
  const scrapeHealthLine =
    scrapeErrorCount === 0 && !summary.scrapingCompletionWarning && !summary.botDetectionWarning
      ? '- **Scrape health guidance:** Evidence collection completed cleanly (no blocked pages/errors). Do not describe this run as a failed sweep; treat checkout gaps as isolated checkout limitations only.'
      : '- **Scrape health guidance:** Treat scraping warnings/errors as scoped limitations. Distinguish partial coverage from total crawl failure.';
  const coverageBlock = [
    `- **Evidence coverage:** ${coverage.headline}`,
    coverage.whatHappened ? `- **What happened:** ${coverage.whatHappened}` : null,
    coverage.howToProceed ? `- **How to proceed:** ${coverage.howToProceed}` : null,
    coverage.gathered.length ? `- **Gathered:** ${coverage.gathered.join('; ')}` : null,
    coverage.missing.length ? `- **Not gathered / incomplete:** ${coverage.missing.join('; ')}` : null,
    ...coverage.notes.map((note) => `- **Note:** ${note}`),
  ]
    .filter(Boolean)
    .join('\n');
  const sfccGuidance =
    selectedPlatform.id === 'sfcc'
      ? '- **SFCC guidance:** Checkout is best-effort on Salesforce Commerce Cloud. Do not frame a missing checkout as a failed assessment when pages/policies/apps were collected. Mark checkout fields Unconfirmed when not reached, and tell the SE which gaps to fill manually.'
      : '';

  // Build the user prompt with evidence
  const userPrompt = `# Website Assessment Request

## Crawl Summary
\`\`\`json
${JSON.stringify(summarizeCrawlForPrompt(summary), null, 2)}
\`\`\`

## Merchant-Provided Context

- **Known ecommerce platform:** ${selectedPlatform.label}
- Treat the selected platform as the expected implementation path for this run. Reconcile it with crawl evidence; if site evidence conflicts with the selected platform, call out the conflict as ❔ Unconfirmed or [Inference] instead of silently overriding it.
- For GEM / Custom, assume a manual Global-e Module style implementation path unless direct evidence proves a packaged platform/plugin path.
${scrapeHealthLine}
${coverageBlock}
${sfccGuidance}
- **Focus guidance:** This summary is intentionally trimmed to scoping-relevant signals. Do not expand the WA with a full technology inventory or list every detected app unless it affects a BRD, red flag, merchant question, or implementation risk.

## Evidence by Category

### High-Signal Pages (Full Content)
${formatFullPages(tierOne)}

### Medium-Signal Pages (Excerpts)
${formatExcerpts(tierTwo)}

### Other Pages Visited
${formatMetadataOnly(tierThree)}

${responseContract}

## Required Output

Generate a complete Website Assessment following the EXACT template structure from the system prompt. Include ALL sections:

1. **Merchant Overview** - Brand, URL, Other Locales, Notes/Scope
2. **Evidence Log** - Working links to all key pages (Home, PDP, Cart, Checkout, Shipping, Returns, Loyalty, Subscriptions)
3. **Platform & Site Structure** - Platform, Headless, Domain strategy, Geo selector, Languages, Mobile
4. **Catalog & Products** - Product types, Bundles, Customizable, Virtual/Digital, GWP, Pre-orders, Subscriptions, Reviews
5. **Checkout & Payments** - Flow type, Express wallets, Payment methods, Gift cards, Taxes, Duties
6. **Shipping & Logistics** - Tiers, Carriers, Cross-border, Returns, Final Sale
7. **Loyalty, Subscriptions, CRM** - Loyalty program, Subscriptions provider, Email/SMS
8. **Business Restrictions** - B2B/wholesale, Marketplace presence
9. **Apps, Integrations, Data Layer** - Notable apps, Analytics
10. **Tech Risks and Integration Notes** - 🚩 Red Flags section, Constraints, Effort estimate
11. **Open Questions** - What needs merchant clarification
12. **Next Steps** - Recommended actions
13. **Legend** - Status indicator definitions
14. **BRD Output for Sweep** — one machine-readable line per BRD **with WA evidence only** (omit BRDs with no signal)

Use this BRD list. Include a line only when you have evidence for that BRD:
${formatBrdPromptList()}

**CRITICAL FORMAT RULES:**
- Use **bullet points (-)** for ALL lists, never numbered lists (Jira renders them poorly)
- Use **plain URLs** not markdown links (for easy copy-paste to Jira)
- Every line item needs a **Status:** ✅ Verified, ❔ Unconfirmed, or ❌ Absent
- Every ✅ item needs an **Evidence:** line with URL and brief quote
- Add **Takeaway:** summaries after major sections
- Mark deductions with **[Inference]**
- Make the scope note explicit about whether checkout was reached, skipped for speed, login-gated, or blocked
- Prefer at least one concrete PDP example and one concrete shipping/returns proof URL when the evidence bundle supports them
- Keep findings focused on BRD/scoping relevance. Do not list every detected site feature unless it affects a BRD, red flag, merchant question, or implementation risk
- For BRD Output for Sweep, include **only** BRDs with evidence using **Status: Done**. Omit BRDs with no WA signal entirely.`;

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  };
}

function formatBrdPromptList(): string {
  return BRD_REQUIREMENTS
    .map((requirement) => `- ${requirement.id} | ${requirement.requirement} | Status: Done (include only if evidence) | SE Output: [one-line note]`)
    .join('\n');
}

export function summarizeCrawlForPrompt(summary: CrawlSummary): Record<string, unknown> {
  const coverage = buildEvidenceCoverageReport(summary);
  return {
    seedUrl: summary.seedUrl,
    domain: summary.domain,
    pagesVisited: summary.pagesVisited,
    productPagesScraped: summary.productPagesScraped,
    selectedPlatform: summary.selectedPlatform,
    platformDetected: summary.platformDetected,
    platformConflict: summary.platformConflict,
    headlessDetected: summary.headlessDetected,
    globalEDetected: summary.globalEDetected,
    checkoutReached: summary.checkoutReached,
    checkoutSkipped: summary.checkoutSkipped,
    checkoutStoppedAt: summary.checkoutStoppedAt,
    evidenceCoverage: coverage,
    redFlags: summary.redFlags,
    thirdPartiesDetected: (summary.thirdPartiesDetected || []).slice(0, 20),
    returnProvider: summary.policyInfo?.returnProvider,
    returnPortal: summary.policyInfo?.returnPortal,
    catalogFeatures: summary.catalogFeatures,
    loyaltyProgram: summary.loyaltyProgram,
    marketplacePresence: summary.marketplacePresence,
    policyInfo: summary.policyInfo,
    checkoutInfo: summary.checkoutInfo,
    dangerousGoods: (summary.dangerousGoods || []).slice(0, 5),
    b2bIndicators: summary.b2bIndicators,
    dropshipIndicators: summary.dropshipIndicators,
    errors: (summary.errors || []).slice(0, 5),
    scrapingCompletionWarning: summary.scrapingCompletionWarning,
    botDetectionWarning: summary.botDetectionWarning,
  };
}

interface TieredPages {
  tierOne: PageData[];
  tierTwo: PageData[];
  tierThree: PageData[];
}

function groupPagesByTier(pages: PageData[]): TieredPages {
  const tierOne: PageData[] = [];
  const tierTwo: PageData[] = [];
  const tierThree: PageData[] = [];

  for (const page of pages) {
    const hasHighSignalCategory = page.matchedCategories.some(category => HIGH_SIGNAL_CATEGORIES.has(category));
    const hasHighSignalUrl = HIGH_SIGNAL_URL_PATTERNS.some(pattern => pattern.test(page.url));

    if (hasHighSignalCategory || hasHighSignalUrl) {
      tierOne.push(page);
    } else if (page.matchedCategories.length > 0) {
      tierTwo.push(page);
    } else {
      tierThree.push(page);
    }
  }

  // Limit tier one to max 10 pages
  return {
    tierOne: tierOne.slice(0, 12),
    tierTwo: tierTwo.slice(0, 12),
    tierThree,
  };
}

function formatFullPages(pages: PageData[]): string {
  if (pages.length === 0) return '_No high-signal pages found_';

  return pages.map(page => `
---
**URL:** ${page.url}
**Title:** ${page.title}
**Categories:** ${page.matchedCategories.join(', ') || 'none'}
**Key Phrases:** ${page.keyPhrases.slice(0, 10).join(', ') || 'none'}
${page.networkRequests.filter(r => r.thirdParty).length > 0 ? `**Third-parties detected:** ${[...new Set(page.networkRequests.filter(r => r.thirdParty).map(r => r.thirdParty))].join(', ')}` : ''}

**Evidence Snapshot:**
${page.evidenceText}
---`).join('\n');
}

function formatExcerpts(pages: PageData[]): string {
  if (pages.length === 0) return '_No medium-signal pages_';

  return pages.map(page => `
- **${page.title}** (${page.url})
  Categories: ${page.matchedCategories.join(', ')}
  Excerpt: ${page.excerpt.slice(0, 300)}${page.excerpt.length > 300 ? '...' : ''}`).join('\n');
}

function formatMetadataOnly(pages: PageData[]): string {
  if (pages.length === 0) return '_None_';

  return pages.map(page => `- ${page.url}`).join('\n');
}

