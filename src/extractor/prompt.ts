/**
 * Prompt builder for Claude extraction
 */

import type { ScrapeResult, PageData } from '../scraper/types.js';

const SYSTEM_PROMPT = `You are analyzing evidence collected from an e-commerce website. Your task is to produce a formatted Website Assessment (WA) document in standard Markdown format (compatible with Jira, Confluence, and other tools).

## Ground Rules

1. **Label every line item** as **✅ Verified**, **❔ Unconfirmed**, or **❌ Absent**.
2. **Show receipts.** Add explicit evidence URLs that resolve to specific pages.
3. **Be honest about certainty.** If something involves deduction, mark it with **[Inference]**.
4. **Use bullet points (-)** not numbered lists (Jira doesn't render numbered lists well).

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
- **Use bullet points (-):** Not numbered lists.`;

export function buildPrompt(scrapeResult: ScrapeResult): { system: string; user: string } {
  const { summary, pages } = scrapeResult;

  // Group pages by tier for token optimization
  const { tierOne, tierTwo, tierThree } = groupPagesByTier(pages);

  // Build the user prompt with evidence
  const userPrompt = `# Website Assessment Request

## Crawl Summary
\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

## Evidence by Category

### High-Signal Pages (Full Content)
${formatFullPages(tierOne)}

### Medium-Signal Pages (Excerpts)
${formatExcerpts(tierTwo)}

### Other Pages Visited
${formatMetadataOnly(tierThree)}

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

**CRITICAL FORMAT RULES:**
- Use **bullet points (-)** for ALL lists, never numbered lists (Jira renders them poorly)
- Use **plain URLs** not markdown links (for easy copy-paste to Jira)
- Every line item needs a **Status:** ✅ Verified, ❔ Unconfirmed, or ❌ Absent
- Every ✅ item needs an **Evidence:** line with URL and brief quote
- Add **Takeaway:** summaries after major sections
- Mark deductions with **[Inference]**

Respond with ONLY the Markdown. No preamble, no explanation after.`;

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
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
    const hasHighSignalCategory = page.matchedCategories.some(c =>
      ['shipping', 'returns', 'faq', 'checkout', 'pdp'].includes(c)
    );

    if (hasHighSignalCategory) {
      tierOne.push(page);
    } else if (page.matchedCategories.length > 0) {
      tierTwo.push(page);
    } else {
      tierThree.push(page);
    }
  }

  // Limit tier one to max 10 pages
  return {
    tierOne: tierOne.slice(0, 10),
    tierTwo: tierTwo.slice(0, 10),
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

**Content:**
${page.cleanedText.slice(0, 4000)}
${page.cleanedText.length > 4000 ? '\n[...truncated...]' : ''}
---`).join('\n');
}

function formatExcerpts(pages: PageData[]): string {
  if (pages.length === 0) return '_No medium-signal pages_';

  return pages.map(page => `
- **${page.title}** (${page.url})
  Categories: ${page.matchedCategories.join(', ')}
  Excerpt: ${page.excerpt.slice(0, 300)}...`).join('\n');
}

function formatMetadataOnly(pages: PageData[]): string {
  if (pages.length === 0) return '_None_';

  return pages.map(page => `- ${page.url}`).join('\n');
}

