/**
 * Prompt builder for Claude extraction
 */

import type { ScrapeResult, PageData } from '../scraper/types.js';

const SYSTEM_PROMPT = `You are analyzing evidence collected from an e-commerce website. Your task is to produce a structured Website Assessment (WA) in JSON format.

## Output Rules

1. **Every check must have a status:** \`verified\`, \`unconfirmed\`, or \`absent\`

2. **Status meanings:**
   - \`verified\`: You found direct evidence. MUST include \`evidence\` array with url + quote.
   - \`unconfirmed\`: You saw signals but can't fully prove it. Include \`notes\` explaining uncertainty.
   - \`absent\`: You looked in the right places and didn't find it. Include \`searchedUrls\` or \`notes\`.

3. **Evidence rules:**
   - Use exact quotes from the provided text when possible
   - Keep quotes concise (1-2 sentences max)
   - If you're making a deduction (e.g., "Shop Pay button means Shopify Payments"), add \`"inference": true\`

4. **Be conservative:**
   - If you're not sure, use \`unconfirmed\`
   - Don't hallucinate features that aren't in the evidence
   - It's better to mark something \`absent\` than to guess

5. **Red flags to always call out:**
   - Smile.io (not supported by GE)
   - Recharge (proprietary checkout, often OoS)
   - Crypto/Bitcoin payments (not supported)
   - Amazon fulfillment (OoS)
   - Variable restocking fees (GE needs static)

6. **Takeaways:**
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

Return a valid JSON object matching the WebsiteAssessment schema. Include:
- meta (brand, primaryUrl, assessedAt, scopeNotes)
- evidenceLog (links to key pages found)
- platform, catalog, checkout, shipping, loyaltyCrm sections
- internationalization, legal, businessRestrictions, integrations sections
- techRisks (constraints, redFlags, integrationSurfaces, effortEstimate)
- openQuestions and nextSteps arrays
- crawlSummary (copy from above)

Respond with ONLY the JSON object. No markdown formatting, no explanation.`;

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

