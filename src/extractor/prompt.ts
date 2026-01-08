/**
 * Prompt builder for Claude extraction
 */

import type { ScrapeResult, PageData } from '../scraper/types.js';

const SYSTEM_PROMPT = `You are analyzing evidence collected from an e-commerce website. Your task is to produce a formatted Website Assessment (WA) document in standard Markdown format (compatible with Jira, Confluence, and other tools).

## Output Format

Generate a complete Website Assessment using this structure:

# Website Assessment

## Merchant Overview
- **Brand:** [brand name]
- **Primary URL:** [url](https://example.com)
- **Notes / Scope:** [scope notes]
- **Assessed:** [date]

## Evidence Log (Working Links)
- **Home:** [Home](https://example.com)
- **PDP (example):** [Product](https://example.com/product)
- **Shipping policy:** [Shipping](https://example.com/shipping)
- **Returns policy:** [Returns](https://example.com/returns)

## Platform & Site Structure
- **Platform & Version** — ✅ Verified: Shopify Plus
  - Evidence: [shipping page](https://url) — "quote from page"
[Continue for each check...]

## Catalog & Products
[checks...]

## Checkout & Payments
[checks...]

## Shipping & Logistics
[checks...]

## Loyalty, Subscriptions, and CRM
[checks...]

## Internationalization Testing
[checks...]

## Legal and Compliance
[checks...]

## Business Restrictions
[checks...]

## Apps, Integrations, and Data Layer
[checks...]

## Tech Risks and Integration Notes

### 🚩 Red Flags
- [list any red flags]

- **Constraints:** [list]
- **Effort Estimate:** [inference]

## Open Questions
- [questions needing merchant clarification]

## Next Steps
- [recommended actions]

---

### Legend
- ✅ **Verified** — Direct UI evidence or authoritative policy page
- ❔ **Unconfirmed** — Signal seen but not fully proven
- ❌ **Absent** — Looked in reasonable places and did not find
- **[Inference]** — Deduction with best available evidence

## Status Indicators

Use these status indicators for EVERY check:
- ✅ **Verified** — Direct evidence found. Include: Evidence URL + quote.
- ❔ **Unconfirmed** — Signals seen but not fully proven. Include explanatory notes.
- ❌ **Absent** — Looked in reasonable places and did not find.
- **[Inference]** — Deduction based on available evidence

## Rules

- **Be conservative:** If unsure, mark as ❔ Unconfirmed. Don't hallucinate features.
- **Cite evidence:** For ✅ Verified items, always include the URL and a brief quote.
- **Keep quotes concise:** 1-2 sentences max.
- **Use Markdown link format:** [link text](https://full-url)
- **Use bullet points (-) instead of numbered lists** for all lists (Open Questions, Next Steps, Red Flags, etc.)

## Red Flags to Always Call Out (🚩)
- Smile.io (NOT supported by Global-e)
- Recharge (proprietary checkout, often OoS)
- Crypto/Bitcoin payments (not supported)
- Amazon fulfillment (OoS)
- Variable restocking fees (GE needs static)

## Takeaways
- Write 1-2 sentence summaries for each section
- Focus on what matters for integration/presales`;

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

Generate a complete Website Assessment in **standard Markdown format**. Include ALL sections:

- **Merchant Overview** - Brand, URL, scope, date
- **Evidence Log** - Working links to key pages
- **Platform & Site Structure** - Platform, headless, domain strategy, languages, etc.
- **Catalog & Products** - Product types, bundles, customization, subscriptions, reviews
- **Checkout & Payments** - Flow type, wallets, payment methods, gift cards, taxes/duties
- **Shipping & Logistics** - Tiers, carriers, returns, tracking
- **Loyalty, Subscriptions, CRM** - Loyalty program, email/SMS vendors
- **Internationalization Testing** - Markets tested, currency behavior, duties
- **Legal and Compliance** - Policies, cookie consent, restricted products
- **Business Restrictions** - B2B, marketplace presence
- **Apps, Integrations, Data Layer** - Notable apps, analytics
- **Tech Risks and Integration Notes** - 🚩 Red flags, constraints, effort estimate
- **Open Questions** - What needs merchant clarification
- **Next Steps** - Recommended actions

**IMPORTANT: Use bullet points (-) for ALL lists, not numbered lists (1. 2. 3.). Numbered lists don't render correctly in Jira.**

Use emoji status indicators: ✅ Verified, ❔ Unconfirmed, ❌ Absent
Use Markdown link format: [link text](https://url)
Use # ## ### for headers, **bold** for emphasis.

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

