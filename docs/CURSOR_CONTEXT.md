# Richard Walker — Global-e Cursor Context

**Purpose:** Drop this file into any Cursor workspace (attach in chat, add as a project rule, or copy to `~/.cursor/` docs) so assistants understand your role, deliverables, and templates without re-explaining basics.

**Last updated:** 2026-05-22  
**Primary tooling repo:** [Global-swEeper](https://github.com/RichWalker3/Global-swEeper.git) (`global-sweep`, branch `pilot/team-handoff`)

---

## Who I am

| | |
|---|---|
| **Name** | Richard Walker |
| **Company** | [Global-e](https://www.global-e.com) — cross-border e-commerce platform (checkout, payments, duties/taxes, logistics for international D2C) |
| **Role** | **Presales Solutions Engineering** (Solutions Engineering in the sales cycle) |
| **Focus** | Merchant discovery, technical scoping, risk identification, and documentation that feeds **SOPP** (Sales Opportunity Presales Process) and delivery handoff |

I am **not** a software developer day-to-day. I use **Cursor** and **Sweep** (`global-sweep`) as power tools for assessments and BRD work. Prefer plain language, actionable outputs, and copy-paste-ready formatting for **Jira** and **Confluence**.

---

## What I do at Global-e

### Primary deliverables

1. **Website Assessment (WA)** — Structured review of a merchant’s live storefront: platform, checkout, catalog risks, apps, international behavior, and presales red flags. Output is pasted into Jira/Confluence and fed into Sweep’s BRD Workspace.

2. **BRD scoping (BRD-001 … BRD-030)** — Map WA findings to **Business Requirement Document** line items on a **SOPP parent** Jira issue (each BRD is typically a subtask). Populate **SE Output** fields and drive status (**Done** / **Canceled**) before signature (**SIGN** gate) or later (**LOCK** gate).

3. **Presales advisory** — Flag Out-of-Scope (OoS) items, unsupported apps, dangerous goods, subscriptions, loyalty gaps, and integration risks early so Sales and PM are not surprised post-signature.

4. **Internal knowledge work** — Contribute to NCE/presales process docs, app support matrix alignment, and tooling (e.g. Sweep pilot for the SE team).

### Process context (SOPP)

- **SOPP** = presales opportunity workflow from discovery through signed deal.
- A **SOPP parent** Jira ticket holds merchant context; **BRD subtasks** (BRD-001–030) capture scoped answers per requirement category.
- **WA** is the evidence layer; **BRD** is the structured scoping layer tied to HubSpot/Jira fields.
- **SIGN** gate BRDs must be resolved before contract signature; **LOCK** gate items can be finalized later in the project.

### What I do *not* need from assistants

- Do not turn WAs into Global-e sales pitches (“GE will provide…”) unless I explicitly ask.
- Do not guess URLs — navigate the merchant site or use provided evidence.
- Do not invent merchant capabilities for BRD lines without evidence.
- Do not ask me to set up Jira/Confluence API keys in every chat — use MCP or `.env` when available in `global-sweep`.

---

## Tools I use

| Tool | Use |
|------|-----|
| **Cursor** | WA authoring, BRD drafting, Jira/Confluence queries (MCP), merchant research |
| **Sweep** (`npm run web` → http://localhost:3847) | Scrape merchant sites, BRD Workspace, optional Jira push for SOPP parents |
| **Jira** | SOPP parents, BRD subtasks, SE Output fields — `global-e.atlassian.net` |
| **Confluence** | Playbooks, app matrix, merchant sign-off process |
| **Atlassian MCP** | Preferred for Jira/Confluence lookups when enabled |

### Handy chat commands (global-sweep)

| Say this | Meaning |
|----------|---------|
| **launch sweep** | Start Sweep web UI on port 3847 |
| **update sweep** | Pull latest `pilot/team-handoff`, reinstall, relaunch |
| **/wa https://merchant.com** | Run a full Website Assessment per template below |

---

## How assistants should work with me

### Website Assessments

- Follow the **WA template** and **output rules** in this doc (and `docs/TEMPLATE.md` in global-sweep for full detail).
- **Always return the completed WA in chat** as plain text (not only a file). Use emoji status markers and **plain URLs** (no markdown links).
- Bullet format: `• **Subject** - ✅ Verified - Evidence/detail here.`
- No em dashes in WA body — use hyphen separators.
- Writing lens: **Presales SE documenting the merchant’s current state** and future scope signals — not a Global-e solution doc.
- Save a copy to `logs/assessments/YYYY-MM-DD_domain_WA.md` when working in global-sweep.

### BRD work

- End every WA with **BRD Output for Sweep** (machine-readable, one line per BRD-001–030).
- When updating Jira, respect existing SE Output; propose deltas clearly.
- Map red flags to the right BRD IDs (e.g. Smile.io → BRD-014, Recharge → BRD-013, DG → BRD-016).

### Jira / Confluence

- Use **Atlassian MCP** first when available.
- Fallback: REST API with credentials from `global-sweep/.env` (`JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`).
- Include issue links in summaries: `https://global-e.atlassian.net/browse/KEY-123`

### Tone

- Concise, evidence-based, honest about **❔ Unconfirmed**.
- Call out **SIGN** gate risks prominently.
- Tables and matrices are welcome for BRD reviews; WAs stay bullet-oriented for Jira paste.

---

## Domain knowledge (essentials)

Full reference: `docs/DOMAIN_KNOWLEDGE.md` in global-sweep. Highlights:

### Platforms (detection)

Shopify (`cdn.shopify.com`, `/checkouts/`), Shopify Plus, SFCC, Magento, BigCommerce, headless (Hydrogen, Next.js, Nuxt, Gatsby).

### Always flag (high severity)

| Finding | Notes |
|---------|--------|
| **Smile.io** | ❌ Not supported → BRD-014 |
| **Recharge** subscriptions | Proprietary checkout, often OoS → BRD-013 |
| **Reach / Flow / Zonos** | Competing cross-border |
| **Crypto payments** | Not supported |
| **Amazon fulfillment** | OoS → BRD-006 |
| **Split tender / multi-card** | OoS on GE checkout |
| **Variable restocking fees** | GE needs static fee |

### Positive / partner callouts

**ReturnGO** — partner; note on returns (BRD-030). **LoyaltyLion** — supported. **Yotpo** — partial / in progress.

### Dangerous goods (BRD-016)

Perfume, aerosols, nail products, lithium batteries — DHL Express / WYOL constraints; not GE Hub standard; merchant needs certified DG contact.

### Features needing lead approval

Subscriptions, loyalty programs, B2B/wholesale, 3B2C — do not assume in scope.

### App support matrix

Confluence: [Shopify Apps Support Matrix](https://global-e.atlassian.net/wiki/spaces/SE/pages/3614113887/Shopify+Apps+Support+Matrix)

---

# Website Assessment (WA) — Template & Rules

> Condensed from `docs/TEMPLATE.md`. For playbook detail, see that file in global-sweep.

## WA output rules (critical)

1. **Label every line:** ✅ Verified | ❔ Unconfirmed | ❌ Absent  
2. **Navigate, don’t guess** — follow site nav; never fabricate URLs  
3. **Plain URLs only** — no `[text](url)` — for Jira/Confluence paste  
4. **Subject-first bullets:** `• **Subject** - ✅ Verified - detail`  
5. **No em dashes** in WA text  
6. **Tag deductions** with **[Inference]**  
7. **Don’t purchase** — go as far as checkout allows  
8. **Test 2–3 international markets** when possible  
9. **Do not** add default “Smile.io absent” / “Recharge absent” lines — only mention if detected or relevant  
10. **Output the full WA in chat** always (copy-paste ready for Jira). Also save to `logs/assessments/` when in global-sweep  
11. **Heading hierarchy:** Use `# Website Assessment - <Merchant>` then `##` for each section (and `###` for market subsections). This ensures Jira renders the structure correctly.  
12. **Jira paste formatting:** Put a **blank line between every bullet** (double line break). Jira often collapses single line breaks; the blank line prevents bullets from running together.  

## WA section order

1. Merchant Overview  
2. Evidence Log (Working Links)  
3. Platform & Site Structure  
4. Catalog & Products  
5. Checkout & Payments  
6. Shipping & Logistics  
7. Loyalty, Subscriptions, and CRM  
8. Internationalization Testing  
9. Legal and Compliance  
10. Business Restrictions  
11. Apps, Integrations, and Data Layer  
12. Tech Risks and Integration Notes  
13. Opportunities and Recommendations  
14. Open Questions  
15. Next Steps  
16. Appendix  
17. **BRD Output for Sweep** (required — see BRD section below)

---

## WA fill-in template

Copy and complete. Replace `Status: ___` with ✅ Verified / ❔ Unconfirmed / ❌ Absent and evidence.

```markdown
# Website Assessment

### Merchant Overview

• **Brand** - Status: ___
• **Primary URL** - Status: ___
• **Other Locales / Sites** - Status: ___
• **Notes / Scope of this pass** - Status: ___ (device, region, depth, no purchase)

### Evidence Log (Working Links)

• **Home** - Status: ___
• **PDP example** - Status: ___
• **Cart** - Status: ___
• **Checkout as far as allowed** - Status: ___
• **Shipping policy** - Status: ___
• **Returns policy** - Status: ___
• **Payments or FAQ page** - Status: ___
• **Loyalty / Rewards page** - Status: ___
• **Subscriptions page** - Status: ___
• **Other key proof links** - Status: ___

### Platform & Site Structure

• **Platform & Version** - Status: ___
• **Headless / Frontend architecture** - Status: ___
• **Domain and subdomain strategy** - Status: ___
• **Geo / Country selector** - Status: ___
• **Languages / translation approach** - Status: ___
• **Mobile experience** - Status: ___

**Takeaway:**

### Catalog & Products

• **Product types and variants (DG / hard-to-ship)** - Status: ___
• **Bundles / kits** - Status: ___
• **Customizable products / configurator** - Status: ___
• **Virtual / Digital products** - Status: ___
• **GWP / Free product promotions / Try & Buy** - Status: ___
• **Pre-orders** - Status: ___
• **Subscriptions on PDP or cart** - Status: ___

**Takeaway:**

### Checkout & Payments

• **Checkout flow type** - Status: ___
• **Express wallets** - Status: ___
• **Payment methods** - Status: ___
• **Gift cards** - Status: ___
• **Fraud / risk hints** - Status: ___
• **Taxes display** - Status: ___
• **Duties display** - Status: ___
• **Compliance and restricted items messaging** - Status: ___

### Shipping & Logistics

• **Shipping tiers and SLAs** - Status: ___
• **Carriers** - Status: ___
• **Cross-border approach** - Status: ___
• **Returns and exchanges** - Status: ___
• **Final Sale / non-returnable items** - Status: ___
• **Tracking and WISMO** - Status: ___

**Takeaway:**

### Loyalty, Subscriptions, and CRM

• **Loyalty / rewards program** - Status: ___
• **Subscriptions provider** - Status: ___

### Internationalization Testing

**Market 1** (Country / currency)
• **Currency behavior:**
• **Prices incl or excl tax:**
• **Duties shown or prepaid:**
• **Shipping options:**
• **Geo-gates:**
• **Evidence:**

**Market 2** (Country / currency)
• (same structure)

**Takeaway:**

### Legal and Compliance (surface-level)

• **Restricted products or disclaimers** - Status: ___

**Takeaway:**

### Business Restrictions (split)

• **B2B / wholesale flows** - Status: ___
• **Marketplace presence** - Status: ___
• **Dropshippers / 3P fulfillment** - Status: ___

**Takeaway:**

### Apps, Integrations, and Data Layer (visible only)

• **Notable apps or widgets** - Status: ___

**Takeaway:**

### Tech Risks and Integration Notes (Presales)

• **Constraints or red flags:**
• **Likely integration surfaces** [Inference]:

### Opportunities and Recommendations

• 

### Open Questions

• 

### Next Steps

• 

### Appendix - Screens and Notes

• 

### Legend

• ✅ Verified — direct UI or policy evidence  
• ❔ Unconfirmed — signal seen, not proven  
• ❌ Absent — looked, not found  
• [Inference] — labeled deduction
```

---

# BRD — Template & Requirements

BRDs are the **30 standard presales requirements** mapped to Jira subtasks under a **SOPP parent**. Each row has a **gate** (SIGN = before signature, LOCK = can follow later).

## BRD requirement list (BRD-001 – BRD-030)

| ID | Category | Requirement | Gate |
|----|----------|-------------|------|
| BRD-001 | Logistics & Fulfilment | Hub locations and entities | SIGN |
| BRD-002 | Logistics & Fulfilment | 3PL / Shipping Platform | SIGN |
| BRD-003 | Logistics & Fulfilment | Outbound carriers | SIGN |
| BRD-004 | Logistics & Fulfilment | Inbound carriers | SIGN |
| BRD-005 | Logistics & Fulfilment | Ship from bond | SIGN |
| BRD-006 | Logistics & Fulfilment | Dropship / Multi-node Fulfilment | SIGN |
| BRD-007 | Logistics & Fulfilment | 3B2C | SIGN |
| BRD-008 | Logistics & Fulfilment | Collection Points | LOCK |
| BRD-009 | Logistics & Fulfilment | Store (BOPIS / Ship to Store) | LOCK |
| BRD-010 | Logistics & Fulfilment | Fulfilment Process (API vs Admin) | LOCK |
| BRD-011 | Commerce Models | Marketplace | SIGN |
| BRD-012 | Commerce Models | B2B | SIGN |
| BRD-013 | Storefront & Experience | Subscriptions | SIGN |
| BRD-014 | Storefront & Experience | Loyalty & Reward | LOCK |
| BRD-015 | Storefront & Experience | Gift Cards | LOCK |
| BRD-016 | Catalog | Dangerous Goods | SIGN |
| BRD-017 | Catalog | Restrictions | SIGN |
| BRD-018 | Catalog | High Value shipments | SIGN |
| BRD-019 | Catalog | Digital / Gaming | SIGN |
| BRD-020 | Catalog | CITES | LOCK |
| BRD-021 | Catalog | Ugly Freight | LOCK |
| BRD-022 | Catalog | Customised Products | LOCK |
| BRD-023 | Catalog | Bundles | LOCK |
| BRD-024 | Catalog | Free Products / Orders | LOCK |
| BRD-025 | Catalog | Pre-orders | LOCK |
| BRD-026 | Storefront & Experience | Mobile App | LOCK |
| BRD-027 | Storefront & Experience | Storefront Setup | LOCK |
| BRD-028 | Storefront & Experience | Headless | LOCK |
| BRD-029 | Storefront & Experience | Flash sales / Raffles | LOCK |
| BRD-030 | Storefront & Experience | Returns Platform | LOCK |

HubSpot field mappings exist for many rows (see `src/brd/requirements.ts` in global-sweep).

---

## BRD Output for Sweep (end of every WA)

Sweep parses this section from the WA markdown. **Exactly one line per BRD**, all 30 lines, no exceptions.

```markdown
## BRD Output for Sweep

- BRD-001 | Hub locations and entities | Status: Done | SE Output: [concise note from WA evidence, or "No WA evidence found."]
- BRD-002 | 3PL / Shipping Platform | Status: Canceled | SE Output: No WA evidence found.
...
- BRD-030 | Returns Platform | Status: Done | SE Output: ReturnGO widget in footer; returns portal linked from policy page.
```

### Rules

| Rule | Detail |
|------|--------|
| **Status: Done** | WA has evidence, a scoping note, or a relevant finding for this BRD |
| **Status: Canceled** | No evidence, or feature clearly absent |
| **SE Output** | One concise line for the Jira SE Output field — facts from WA only |
| **No invention** | If no evidence → `"No WA evidence found."` + **Canceled** |
| **Format** | Single line per BRD; keep pipe separators exactly as shown |

---

## BRD Jira subtask text template (manual / Sweep compose)

When writing or reviewing full SE Output body text (not the one-line Sweep format):

```text
BRD-0XX proposed scope: [In Scope | Out Of Scope | Future | Unconfirmed | No signal found]
Confidence: [high | medium | low]

Evidence:
[Source]: [detail] (https://plain-url)
...

Open questions:
- [question or "None"]
```

### BRD review matrix (markdown table)

Used in Sweep exports and Confluence drafts:

```markdown
| Req ID | Jira | Category | Requirement | Gate | Proposed Scope | Confidence | Evidence | Open Questions |
|--------|------|----------|-------------|------|----------------|------------|----------|----------------|
| BRD-013 | SOPP-123-4 | Storefront & Experience | Subscriptions | SIGN | Out Of Scope | high | WA: Recharge on PDP (url) | Confirm % of revenue from subs |
```

### Scope values

- **In Scope** — merchant has feature; GE path likely (subject to lead approval where noted)  
- **Out Of Scope** — not supported or excluded for this deal  
- **Future** — post-launch or phase 2  
- **Unconfirmed** — needs merchant call  
- **No signal found** — WA did not surface evidence  

---

## Sweep ↔ BRD workflow (quick)

1. **Launch Sweep** → paste merchant URL → run assessment / copy prompt to Cursor  
2. **Complete WA** in Cursor (this template) → paste back into Sweep BRD Workspace  
3. **Validate SOPP parent** in Sweep (Jira key for opportunity)  
4. **Compose / Process BRD** — map WA to 30 rows, review proposed SE Output  
5. **Connect Jira** (hamburger menu) when ready to preview/apply updates  
6. **Send to Jira** — updates subtask SE Output + status where configured  

---

## Related files in global-sweep

| File | Contents |
|------|----------|
| `docs/TEMPLATE.md` | Full WA playbook + template |
| `docs/DOMAIN_KNOWLEDGE.md` | Apps matrix, DG, GWP, 3B2C, evidence standards |
| `docs/TEAM_SETUP.md` | Sweep setup for non-developers |
| `.cursor/rules/wa.mdc` | `/wa` slash behavior for Cursor |
| `src/brd/requirements.ts` | Canonical BRD-001–030 definitions |

---

## Using this file in other Cursor projects

1. Copy `docs/CURSOR_CONTEXT.md` into the new repo (or a personal `~/Documents/cursor/` folder).  
2. In chat: **@CURSOR_CONTEXT.md** or “follow my Global-e context doc.”  
3. Optional: add a `.cursor/rules/global-e-context.mdc` with `alwaysApply: true` and one line: “Read `docs/CURSOR_CONTEXT.md` for user role and WA/BRD templates.”

---

*This document describes Richard Walker’s presales SE work at Global-e. Update when process, BRD list, or tooling changes.*
