# Global-swEep

> **Global-swEep** — A tool that gathers and organizes website evidence for human review.

> **Status:** Design phase - ready for implementation  
> **Owner:** Richie Walker, Presales Solutions Engineer @ Global-e North America

---

## What This Is

**Global-swEep** is an automated tool that performs **Website Assessments (WAs)** for e-commerce merchants being onboarded to Global-e's cross-border commerce platform.

The name reflects its purpose: swEep *gathers* the information and *organizes* it for human review — it doesn't make decisions or run unchecked. The human (you) stays in the loop.

(The capitalized E? That's a nod to Global-e. 😉)

### The Problem

Today, Richie manually browses each merchant's website using AI-assisted browser tools to:
- Identify the e-commerce platform (Shopify, SFCC, Magento, etc.)
- Document shipping, returns, checkout, and payment configurations
- Find third-party integrations (ReturnGO, Recharge, Yotpo, etc.)
- Spot potential integration risks and opportunities
- Produce a structured WA document for the SOPP (Sales Opportunity Presales Process)

This works but is time-intensive (20-45 minutes per merchant) and doesn't scale.

### The Solution

Build an app that:
1. **Crawls** the merchant's website (homepage, PDPs, cart, checkout, policy pages)
2. **Extracts** structured data from the evidence
3. **Produces** a formatted WA matching the established template
4. **Integrates** with Jira/Confluence to upload results

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Scraper   │────▶│  LLM Extractor  │────▶│  Output Layer   │
│   (Playwright)  │     │    (Claude)     │     │ (Jira/Markdown) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   - Navigate site         - Parse evidence        - Format WA doc
   - Capture text          - Apply schema          - Upload to Jira
   - Detect 3rd parties    - Generate takeaways    - Update DNA
   - Screenshot policies   - Flag risks            - Attach screenshots
```

### Key Components

| Component | Purpose | Status |
|-----------|---------|--------|
| **Scraper** | Playwright-based crawler that navigates sites, captures text, detects third-party scripts | To build |
| **Pre-filter** | Tags pages by category (shipping, returns, checkout, etc.) before LLM call | To build |
| **LLM Extractor** | Claude prompt that transforms evidence into structured JSON | Designed |
| **Schema Validator** | Zod validation to ensure output matches expected structure | Designed |
| **Output Formatter** | Converts JSON to Markdown WA document | To build |
| **Jira/Confluence API** | Uploads WA to ticket, updates DNA document | Patterns exist |

---

## Design Documents

| Document | Description |
|----------|-------------|
| [SCHEMA_DESIGN.md](./docs/SCHEMA_DESIGN.md) | JSON schema for structured WA output |
| [PROMPT_DESIGN.md](./docs/PROMPT_DESIGN.md) | LLM extraction prompt architecture |
| [TEMPLATE.md](./docs/TEMPLATE.md) | Human-readable WA template (what we're replicating) |
| [DOMAIN_KNOWLEDGE.md](./docs/DOMAIN_KNOWLEDGE.md) | Global-e specifics, red flags, app support matrix |

---

## Why Not Just Keep Using AI Agents?

The current agentic approach (me browsing with Claude in Cursor) **works well** but:
- Requires human-in-the-loop for every assessment
- Browser session can time out or hit rate limits
- Harder to batch multiple merchants
- Knowledge lives in my head, not in code

The app approach:
- Runs autonomously once triggered
- Produces consistent, structured output
- Can be scheduled or batched
- Knowledge is codified in prompts and schema

**We're not replacing the agent** - the app handles the grunt work, agent handles edge cases and follow-ups.

---

## MVP Scope

### In Scope
- Single-domain Shopify sites (most common platform)
- US checkout simulation (no VPN/proxy for MVP)
- Core WA sections: Platform, Catalog, Checkout, Shipping, Integrations
- Markdown output (Jira upload can be manual for MVP)
- Third-party detection: ReturnGO, Recharge, Yotpo, Smile.io, Klaviyo, common apps

### Out of Scope (Post-MVP)
- Multi-market checkout testing (VPN/proxy simulation)
- Non-Shopify platforms (SFCC, Magento, custom)
- Automatic Jira/Confluence API integration
- DNA auto-population
- Historical WA comparison

---

## Tech Stack (Proposed)

| Layer | Technology | Why |
|-------|------------|-----|
| Runtime | Node.js / TypeScript | Type safety, async-friendly |
| Scraper | Playwright | Modern, handles SPAs, good for Shopify |
| LLM | Claude API (Anthropic) | Already our primary AI, great at extraction |
| Schema | Zod | Runtime validation, TypeScript inference |
| Output | Marked / Handlebars | Template rendering |
| API Client | Axios or fetch | Jira/Confluence REST calls |

---

## Jira/Confluence Integration Notes

### Credentials
Stored in: `~/.workflow_mcp/jira_config.json`

```json
{
  "email": "richie.walker@global-e.com",
  "api_token": "...",
  "base_url": "https://global-e.atlassian.net"
}
```

### Key Endpoints

**Jira:**
- Search tickets: `GET /rest/api/3/search?jql=...`
- Get ticket: `GET /rest/api/3/issue/{key}`
- Update description: `PUT /rest/api/3/issue/{key}` (uses ADF format)
- Add comment: `POST /rest/api/3/issue/{key}/comment`
- Attach file: `POST /rest/api/3/issue/{key}/attachments`

**Confluence:**
- Search pages: `GET /wiki/rest/api/content/search?cql=...`
- Get page: `GET /wiki/rest/api/content/{id}?expand=body.storage,version`
- Update page: `PUT /wiki/rest/api/content/{id}` (increment version!)
- Upload attachment: `POST /wiki/rest/api/content/{id}/child/attachment`

---

## Global-e Domain Knowledge (Critical Context)

### What We're Looking For

| Category | Key Signals | Why It Matters |
|----------|-------------|----------------|
| **Platform** | Shopify, SFCC, Magento, headless | Integration approach differs by platform |
| **Subscriptions** | Recharge, Bold, Skio, Loop | Often out of scope, needs lead approval |
| **Loyalty** | Smile.io, LoyaltyLion, Yotpo Loyalty | Smile.io NOT supported, others vary |
| **Returns** | ReturnGO, Loop, Narvar, Happy Returns | ReturnGO = our partner product |
| **Gift Cards** | Native Shopify vs Rise.ai vs third-party | Impacts checkout flow |
| **Dangerous Goods** | Perfumes, aerosols, batteries, nail polish | DHL Express only, special handling |
| **B2B/Wholesale** | Trade portals, bulk pricing | Usually out of scope |

### Red Flags to Auto-Flag

- **Smile.io** → Not currently supported by GE
- **Recharge** → Uses proprietary checkout, often OoS
- **Variable restocking fees** → GE needs static fee
- **Fine jewelry (18k+ gold)** → Can't ship to France
- **High AOV ($1500+)** → Express shipping only
- **Crypto payments** → Not supported
- **Amazon fulfillment** → Out of scope

### Shopify App Support

See full matrix: [Shopify Apps Support Matrix](https://global-e.atlassian.net/wiki/spaces/SE/pages/3614113887/Shopify+Apps+Support+Matrix)

**Green (Supported):** Klaviyo, LoyaltyLion, Weglot, Shopify Bundles, Boost, Nosto  
**Yellow (Partial):** Yotpo, Rise.ai, Algolia, Route, Riskified  
**Red (Not Supported):** Recharge, Purple Dot, Reach, SELLY

---

## Evidence-Based Approach

Every claim in the WA must be one of:

| Label | Meaning | Required |
|-------|---------|----------|
| ✅ Verified | Direct evidence found | URL + quote |
| ❔ Unconfirmed | Signal seen but not proven | Notes explaining uncertainty |
| ❌ Absent | Looked and didn't find | Where we looked |
| [Inference] | Deduction from evidence | Show reasoning |

**No guessing.** If we can't verify it, we say so.

---

## Getting Started (When Ready to Build)

### Pre-requisites to Set Up First
- [ ] **GitHub account + SSH keys** — Set up on your machine
- [ ] **Git initialized** — `git init` in the sweep folder
- [ ] **GitHub repo created** — Push initial commit
- [ ] **Node.js installed** — v18+ recommended
- [ ] **Anthropic API key** — For Claude extraction

### Once Set Up

```bash
# Clone this repo
git clone <repo-url>
cd global-sweep

# Install dependencies
npm install

# Set up credentials
cp .env.example .env
# Add your Anthropic API key and Jira credentials

# Run on a test site
npm run sweep -- --url https://example-merchant.com
```

---

## Open Questions

1. **Headless sites** - How do we detect and handle them? (Hydrogen, Next.js storefronts)
2. **Bot protection** - Some sites will block Playwright. Retry strategy?
3. **Checkout depth** - How far can we reliably get without purchasing?
4. **Multi-tab** - Should we open multiple tabs for parallel scraping?
5. **Rate limiting** - How many sites per hour is reasonable?

---

## Project History

- **Dec 2024**: Started with coded Playwright automation. Failed due to rigid selectors, popups.
- **Dec 2024**: Pivoted to agentic approach (AI browsing directly). Works well but doesn't scale.
- **Jan 2025**: Designed schema and prompt architecture. Ready to build app.

---

## Contact

**Richie Walker**  
Presales Solutions Engineer, Global-e North America  
Works out of: Cursor IDE with Claude agents

