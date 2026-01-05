# LLM Extraction Prompt Design

This document defines how we'll prompt Claude to extract structured data from the evidence packet.

---

## Prompt Architecture

We use a **two-stage approach:**

### Stage 1: Pre-filter (No LLM)
The scraper tags each page with likely categories based on keyword matching:

```typescript
interface TaggedPage {
  url: string;
  title: string;
  cleanedText: string;        // Full visible text
  excerpt: string;            // First 500 chars
  matchedCategories: string[]; // e.g., ["shipping", "returns", "subscriptions"]
  keyPhrases: string[];       // Extracted keywords found
}
```

### Stage 2: LLM Extraction
We send Claude:
1. **Context:** What this is, what format to output
2. **Crawl summary:** What was found, what was blocked
3. **Grouped evidence:** Pages organized by category
4. **Schema:** The exact JSON structure expected

---

## Pre-filter Category Mapping

Before LLM call, each page is tagged:

| Category | Page is tagged if it contains... |
|----------|----------------------------------|
| `shipping` | "shipping", "delivery", "carriers", "transit time", "ships within" |
| `returns` | "return", "refund", "exchange", "final sale", "non-returnable" |
| `duties_taxes` | "duties", "customs", "import", "VAT", "DDP", "DDU" |
| `subscriptions` | "subscribe", "recurring", "auto-ship", "frequency" |
| `loyalty` | "rewards", "points", "loyalty", "earn", "redeem" |
| `payments` | "payment", "credit card", "Klarna", "Afterpay", "Apple Pay" |
| `international` | "international", "worldwide", "global", "countries we ship" |
| `b2b` | "wholesale", "trade", "business account", "bulk" |
| `gift_cards` | "gift card", "e-gift", "gift certificate" |
| `faq` | "FAQ", "frequently asked", "questions" |
| `terms` | "terms of service", "terms and conditions", "terms of use" |
| `privacy` | "privacy policy", "personal data", "GDPR", "cookies" |
| `pdp` | Product-specific detection (URL contains /products/ or /p/) |
| `checkout` | Checkout-specific detection (URL contains /checkout or /cart) |

---

## Main Extraction Prompt

```markdown
# Website Assessment Extraction

You are analyzing evidence collected from an e-commerce website. Your task is to produce a structured Website Assessment (WA) in JSON format.

## Input
You will receive:
1. A crawl summary with metadata about the site
2. Grouped page evidence organized by category
3. The JSON schema you must follow exactly

## Output Rules

1. **Every check must have a status:** `verified`, `unconfirmed`, or `absent`

2. **Status meanings:**
   - `verified`: You found direct evidence. MUST include `evidence` array with url + quote.
   - `unconfirmed`: You saw signals but can't fully prove it. Include `notes` explaining uncertainty.
   - `absent`: You looked in the right places and didn't find it. Include `searched_urls` or `notes`.

3. **Evidence rules:**
   - Use exact quotes from the provided text when possible
   - Keep quotes concise (1-2 sentences max)
   - If you're making a deduction (e.g., "Shop Pay button means Shopify Payments"), add `"inference": true`

4. **Be conservative:**
   - If you're not sure, use `unconfirmed`
   - Don't hallucinate features that aren't in the evidence
   - It's better to mark something `absent` than to guess

5. **Takeaways:**
   - Write 1-2 sentence summaries for each section
   - Focus on what matters for integration/presales

## Crawl Summary
{crawl_summary_json}

## Evidence by Category

### Shipping & Returns
{shipping_returns_pages}

### Checkout & Payments
{checkout_payments_pages}

### Products & Catalog
{products_pages}

### Loyalty & Subscriptions
{loyalty_subscriptions_pages}

### Policy Pages
{policy_pages}

### Other Relevant Pages
{other_pages}

## Required Output Schema
{json_schema}

## Output
Respond with ONLY the JSON object. No markdown formatting, no explanation, just valid JSON.
```

---

## Page Evidence Format

Each page in the prompt looks like:

```
URL: https://example.com/policies/shipping-policy
Title: Shipping Policy | Example Brand
Matched Categories: shipping, international
---
Free shipping on all U.S. orders over $75!

Standard Shipping (5-7 business days): $7.99
Express Shipping (2-3 business days): $14.99
Overnight Shipping (1 business day): $24.99

International Shipping
We ship to over 50 countries worldwide. International shipping rates are calculated at checkout based on destination and package weight.

Duties & Taxes
For international orders, customers are responsible for any duties, taxes, or customs fees that may be applied by their country. These fees are not included in our shipping charges and will be collected upon delivery.

...
---
```

---

## Token Optimization Strategy

### Problem
Full page text × 20-30 pages = massive token count

### Solution: Tiered evidence inclusion

**Tier 1: Full text (high-signal pages)**
- Shipping policy page
- Returns policy page
- FAQ page
- Checkout page content
- 2-3 PDPs

**Tier 2: Excerpts only (medium-signal)**
- Homepage (first 500 chars + matched keywords in context)
- Other policy pages
- Collection pages

**Tier 3: Metadata only (low-signal)**
- Pages that matched no categories
- Duplicate/similar pages

```typescript
function buildPromptContent(pages: TaggedPage[]): string {
  const tierOne = pages.filter(p => 
    p.matchedCategories.includes('shipping') ||
    p.matchedCategories.includes('returns') ||
    p.matchedCategories.includes('faq') ||
    p.matchedCategories.includes('checkout') ||
    p.matchedCategories.includes('pdp')
  );
  
  const tierTwo = pages.filter(p => 
    !tierOne.includes(p) && 
    p.matchedCategories.length > 0
  );
  
  const tierThree = pages.filter(p => 
    p.matchedCategories.length === 0
  );
  
  let content = '';
  
  // Tier 1: Full text
  for (const page of tierOne.slice(0, 10)) { // Max 10 full pages
    content += formatFullPage(page);
  }
  
  // Tier 2: Excerpts with keyword context
  for (const page of tierTwo.slice(0, 10)) {
    content += formatExcerpt(page);
  }
  
  // Tier 3: Just mention they exist
  if (tierThree.length > 0) {
    content += `\n### Other pages visited (${tierThree.length})\n`;
    content += tierThree.map(p => `- ${p.url}`).join('\n');
  }
  
  return content;
}
```

---

## Handling Specific Checks

### ReturnGO Detection
If the scraper detected ReturnGO in network requests:

```
Note: ReturnGO scripts were detected in network traffic. This merchant appears to be an existing ReturnGO customer.
```

### Global-e Detection
If the scraper detected Global-e:

```
Note: Global-e scripts were detected. This is a GEM (Global-e Module) integration candidate.
```

### Checkout Blocked
If checkout couldn't be reached:

```
Note: Checkout could not be fully explored. Reason: {block_reason}
Reached: {last_url}
```

---

## Example Input/Output

### Input (abbreviated)

```
## Crawl Summary
{
  "seed_url": "https://example.com",
  "platform_detected": "Shopify",
  "pages_visited": 24,
  "checkout_reached": true,
  "returngo_detected": true,
  "third_parties_detected": ["Recharge", "Yotpo", "Klaviyo"]
}

## Evidence by Category

### Shipping & Returns
URL: https://example.com/policies/shipping-policy
Title: Shipping Policy
Matched Categories: shipping, international
---
Free shipping on U.S. orders over $75.
Standard: 5-7 days, $7.99
Express: 2-3 days, $14.99
International available to 50+ countries.
---

URL: https://example.com/policies/refund-policy  
Title: Return Policy
Matched Categories: returns
---
30-day return policy for unworn items.
Final sale items cannot be returned.
Free return shipping on first exchange.
---

### Checkout & Payments
URL: https://example.com/cart
Matched Categories: checkout, payments
---
Express checkout options: Shop Pay, Apple Pay, PayPal
Subtotal: $89.00
Shipping: Calculated at checkout
---
```

### Output

```json
{
  "meta": {
    "brand": "Example Brand",
    "primary_url": "https://example.com",
    "assessed_at": "2024-12-18T10:30:00Z",
    "scope_notes": "Desktop, US region, no purchase made"
  },
  "shipping": {
    "shipping_tiers": {
      "status": "verified",
      "domestic": [
        {"name": "Standard", "sla": "5-7 days", "cost": "$7.99"},
        {"name": "Express", "sla": "2-3 days", "cost": "$14.99"}
      ],
      "evidence": [
        {"url": "https://example.com/policies/shipping-policy", "quote": "Standard: 5-7 days, $7.99. Express: 2-3 days, $14.99"}
      ]
    },
    "returns": {
      "status": "verified",
      "window": "30 days",
      "vendor": "ReturnGO",
      "evidence": [
        {"url": "https://example.com/policies/refund-policy", "quote": "30-day return policy for unworn items"},
        {"url": "https://example.com", "quote": "ReturnGO scripts detected in network traffic", "inference": true}
      ]
    },
    "final_sale": {
      "status": "verified",
      "evidence": [
        {"url": "https://example.com/policies/refund-policy", "quote": "Final sale items cannot be returned"}
      ]
    },
    "takeaway": "Clear 30-day return policy with ReturnGO already integrated. Free threshold at $75."
  },
  "checkout": {
    "express_wallets": {
      "status": "verified",
      "wallets": ["Shop Pay", "Apple Pay", "PayPal"],
      "evidence": [
        {"url": "https://example.com/cart", "quote": "Express checkout options: Shop Pay, Apple Pay, PayPal"}
      ]
    }
  }
  // ... rest of assessment
}
```

---

## Error Handling

### If LLM returns invalid JSON
1. Log the raw response
2. Attempt to fix common issues (trailing commas, unquoted keys)
3. If still invalid, retry with a simpler prompt
4. If still failing, return partial results with error flag

### If LLM hallucinates
The Zod schema validation will catch:
- Missing required fields
- Invalid status values
- Evidence without URLs

We can also add post-processing checks:
- Verify quoted URLs exist in our crawl
- Flag quotes that don't appear in any page text

---

## Questions for Review

1. **Prompt length:** Should we cap the total prompt at a certain size? (e.g., 50k tokens max)

2. **Retry strategy:** If the LLM misses a section, should we re-prompt for just that section?

3. **Opportunities/recommendations:** Should the LLM generate these, or should they be templated based on findings? (e.g., if `duties_display.prepaid_option` is false, auto-suggest "Enable DDP")

4. **Confidence scoring:** Should we ask the LLM to rate its confidence on each check? Or is verified/unconfirmed/absent enough?

5. **Multi-turn:** Should we consider a multi-turn approach where we first extract basic facts, then ask follow-up questions? (More tokens but potentially more accurate)

