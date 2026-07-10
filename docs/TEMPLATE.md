# Website Assessment (WA)

**Purpose:** A single template for quick first-pass Website Assessments (WA) that can feed the BRD Workspace review flow. This doc includes 1) a short playbook and 2) a fill-in template you can paste into any merchant thread.

> **Terminology:** "WA" = Website Assessment. When the user says "WA", they mean Website Assessment.

---

## 0) Output Requirements

**Always output the completed WA directly in chat** so the user can review and copy it directly. Do not only save the file or summarize that it was saved. Additionally, save the assessment to `logs/assessments/` with the naming convention `YYYY-MM-DD_domain_WA.md`.

The chat output should be the complete, formatted assessment ready to copy-paste into Jira, Confluence, or Slack.

**The saved file and the chat output must be identical.** Use the same plain-text WA format in both places.

### Canonical WA format (required for every completed WA)

Use this structure exactly. Section 2 below is the authoring worksheet; this is the delivered format.

```
Website Assessment

Merchant Overview

• **Brand** - ✅ Verified - Example Brand

• **Primary URL** - ✅ Verified - https://example.com

Evidence Log (Working Links)

• **Home** - ✅ Verified - https://example.com

Platform & Site Structure

• **Platform & Version** - ✅ Verified - Shopify. Evidence: https://example.com/checkouts/cn/

Shipping & Logistics

• **Shipping tiers and SLAs** - ✅ Verified - Detail here with plain URL evidence.
• **Returns and exchanges** - ✅ Verified - Detail here with plain URL evidence.

Takeaway: One sentence section summary.

Internationalization Testing

Market 1 (United States, USD)

• **Currency behavior** - ✅ Verified - USD at checkout.
• **Evidence** - ✅ Verified - https://example.com/checkouts/cn/

Open Questions

• What is the authoritative return handling fee?

Next Steps

• Confirm return handling fee with merchant.

Appendix - Screens and Notes

• Checkout reached Shopify /checkouts/cn/ with one test item in cart.
```

### Formatting rules (non-negotiable)

1. **Title** - First line is exactly `Website Assessment` (no `#`, no extra heading markup).
2. **Section titles** - Plain text on their own line, matching the section order below. No `#`, `###`, bold, or suffixes like `(DETAILED)`.
3. **Line items** - Every finding uses: `• **Subject** - STATUS - detail/evidence`
4. **Status labels** - Use only `✅ Verified`, `❔ Unconfirmed`, or `❌ Absent`. Put warnings in the detail text (for example "Policy conflict: ...") rather than inventing new status labels.
5. **URLs** - Plain URLs only. Never use markdown link syntax like `[text](url)`.
6. **Separators** - Use plain hyphens (`-`), never em dashes.
7. **Blank line between bullets** - Put one empty line between every `•` line item so Jira/Confluence copy-paste keeps readable spacing.
8. **No code fences** - Do not wrap the completed WA in triple backticks in chat.
8. **No horizontal rules** - Do not use `---` in the completed WA.
9. **No nested Evidence bullets** - Put proof inline on the same line item.
10. **Takeaways** - One line per section: `Takeaway: sentence`
11. **Internationalization** - Use plain market headers like `Market 1 (United States, USD)` then the six standard bullets with status labels.
12. **Open Questions / Next Steps** - Simple `•` bullets; status labels not required.
13. **Opportunities and Recommendations** - Simple `•` bullets; status labels not required.
14. **Shipping and returns** - Keep both under `Shipping & Logistics`. Do not create separate top-level Returns sections.
14. **Jewelry merchants** - Add optional section `Jewelry Merchant Considerations (Presales Scoping)` before `Tech Risks and Integration Notes` when relevant. Every line still uses the standard status format.
15. **Extra detail** - Add depth inside the standard template bullets, not by renaming sections or breaking the section order.

### Required section order

1. Merchant Overview
2. Evidence Log (Working Links)
3. Platform & Site Structure
4. Catalog & Products
5. Checkout & Payments
6. Shipping & Logistics
7. Loyalty, Subscriptions, and CRM
8. Internationalization Testing
9. Legal and Compliance (surface-level)
10. Business Restrictions (split)
11. Apps, Integrations, and Data Layer (visible only)
12. Jewelry Merchant Considerations (Presales Scoping) - optional, jewelry merchants only
13. Tech Risks and Integration Notes (Presales)
14. Opportunities and Recommendations
15. Open Questions
16. Next Steps
17. Appendix - Screens and Notes

**Line-item format:** Put the line item subject first and bold it, then the status marker and label, then the finding/evidence. Preferred format: `• **Subject** - ✅ Verified - Evidence or finding here.` Use this subject-first format for every WA unless the user explicitly requests a different format. Do not use em dashes in WA output; use plain hyphen separators.

**Writing perspective:** Write the WA from the perspective of a Global-e Presales Solutions Engineer documenting the merchant's current state and the future project scope the merchant may want in scope. Focus on what the merchant is doing today for cross-border, checkout, logistics, payments, localization, and related workflows. Do **not** explain where Global-e would fit, do **not** include "GE to provide" language, and do **not** turn the WA into a solution proposal. The purpose is to capture the merchant's current operating model, any future-state needs that should inform project scoping, and any integration callouts that should be identified before signature.

---

## 1) Playbook - how to run a Website Assessment

### Ground rules

1. **Label every line item** as **✅ Verified**, **❔ Unconfirmed**, or **❌ Absent**. Put the bolded subject first, followed by the status and evidence/detail, e.g. `• **Platform** - ✅ Verified - Shopify checkout observed at /checkouts/cn/.`

2. **Navigate, don't guess.** Always use the site's own navigation (header menus, footer links, buttons) to discover pages. **Never hardcode or guess URLs** - follow the actual links on the page. If a link doesn't exist in the navigation, mark it as ❌ Absent.

3. **Show receipts.** Add **explicit evidence links** that resolve to specific pages or screens. Avoid homepages unless truly needed. Use **plain URLs** (not markdown link syntax) so the document can be easily copy-pasted with styling intact into Jira, Confluence, or Slack.

4. **Be honest about certainty.** If a statement involves deduction, mark it with **[Inference]** and still include the best supporting link you have. If something cannot be verified, leave it **❔ Unconfirmed** and explain why.

5. **Don't purchase.** Step through checkout as far as allowed to collect evidence on currency, duties, taxes, shipping options, and payments.

6. **Business Restrictions are split**: B2B, Marketplace, Dropshippers each has its own line.

7. Keep it tight. Prefer concise bullets. Add a one‑line takeaway for any long section.

### Workflow (10–25 minutes)

1. **Pre‑flight**

   * Open Home, a representative PDP, Cart, and Checkout (as far as allowed).

   * Open key policy pages: Shipping, Returns, Payments/FAQ.

   * Note any region selector, language selector, or currency behavior.

2. **Evidence Log last**

   * Paste working links with descriptive titles.

   * If a page is missing, note **❌ Absent** and say where you looked.

3. **Platform snapshot**

   * Confirm platform and any headless stack hints. Capture one proof link. If headless mark with the green check. if not headless mark with red x

4. **Checkout pass**

   * Add an item to cart and collect: express wallets, tax/duties visibility, shipping options, error states.

5. **Internationalization quick test**

   * Simulate 2–3 markets in checkout. Capture currency, duties, shipping tiers, and any geo‑gates.

6. **Synthesis**

   * Fill sections with statuses. Add a short Opportunities list and Next steps.

7. **Hand‑off**

   * Make sure links work and are not 404s. If a line item is **❔ Unconfirmed**, add what would confirm it.

### Do and don't

* Do include only **specific** FAQ links per bullet when directly relevant.

* Do not repeat the homepage or generic top‑level links across bullets.

* Do capture at least one screenshot link per high‑risk claim if your workflow allows.

* Do prefer vendor or UI proof over guesses. Use **[Inference]** only when UI signals are strong (e.g., "Shop Pay" button implies Shopify Payments enabled, but mark [Inference]).

* **Format for copy-paste:** Use plain URLs and emoji status indicators (✅❌❔⚠️). Each bullet should start with the bold subject, then the status, then the evidence/detail.

* Do not use em dashes in WA output. Use plain hyphen separators, e.g. `• **Subject** - ✅ Verified - Evidence/detail.`

* Do flag high-priority red-flag apps such as Smile.io or Recharge when they are detected.

* Do not add default “Smile.io absent” or “Recharge absent” bullets. Only mention Smile.io or Recharge if present or directly relevant to a finding.

---

## 2) Fill‑in Template (copy this section into a merchant thread)

> Use this single template for quick first‑pass reviews. Mark every line item as **✅ Verified**, **❔ Unconfirmed**, or **❌ Absent**. In the completed WA, every bullet should follow `• **Subject** - ✅ Verified - Evidence/detail.` Add **explicit evidence links as plain URLs** (not markdown links) so the doc can be copy-pasted with styling into Jira/Confluence. If something is **❔ Unconfirmed**, add brief context (e.g., *"Affiliate icon seen in footer; vendor unclear"*). If not seen, state that explicitly. Tag deductions as **[Inference]**.

### Merchant Overview

* **Brand** - Status: ___

* **Primary URL** - Status: ___

* **Other Locales / Sites** - Status: ___

* **Notes / Scope of this pass** - Status: ___ (device, region, depth, no purchase)

### Evidence Log (Working Links)

* **Home** - Status: ___

* **PDP example** - Status: ___

* **Cart** - Status: ___

* **Checkout as far as allowed** - Status: ___

* **Shipping policy** - Status: ___

* **Returns policy** - Status: ___

* **Payments or FAQ page** - Status: ___

* **Loyalty / Rewards page** - Status: ___

* **Subscriptions page** - Status: ___

* **Other key proof links** - Status: ___

> **Method:** Step through to checkout for evidence (no purchases). Capture region, currency, language behavior, taxes, duties, shipping options, and express wallets.

---

## Platform & Site Structure

* **Platform & Version** - Status: ___

  * **Evidence:**

* **Headless / Frontend architecture** - Status: ___

  * **Evidence:**

* **Domain and subdomain strategy** (store, help, blog, custom) - Status: ___

  * **Evidence:**

* **Geo / Country selector** - Status: ___

  * **Evidence:**

* **Languages / translation approach** - Status: ___

  * **Evidence:**

* **Mobile experience** (nav, PDP, PLP notes) - Status: ___

  * **Evidence:**

---

## Catalog & Products

* **Product types and variants (Note any dangerous goods or things that would be difficult to ship at scale)** - Status: ___

  * **Evidence:**

* **Bundles / kits** - Status: ___

  * **Evidence:**

* **Customizable products / product configurator** (e.g., build-your-own, engravings, monograms) - Status: ___

  * **Evidence:**

* **Virtual / Digital products** (e.g., e-gift cards, downloads, memberships; delivery method) - Status: ___

  * **Evidence:**

* **GWP / Free product promotions / Try & Buy** (trigger rules, where shown - PDP, cart, banner; auto-add vs code) - Status: ___

  * **Evidence:**

* **Pre‑orders** (note when shopper is charged; % of catalog if material) - Status: ___

  * **Evidence:**

* **Subscriptions on PDP or cart** (note any recurring payment options) - Status: ___

  * **Evidence:**


**Takeaway:**

---

## Checkout & Payments

* **Checkout flow type** (embedded, hosted, one‑page, multi‑step) - Status: ___

  * **Evidence:**

* **Express wallets** (Shop Pay, PayPal, Apple Pay, Google Pay) - Status: ___

  * **Evidence:**

* **Payment methods** (cards, BNPL, local methods) - Status: ___

  * **Evidence:**

* **Gift cards** (native or vendor, digital and/or physical) - Status: ___

  * **Evidence:**

* **Fraud / risk hints** (visible only - only mention if it is come acreoss. no need to search extensively) - Status: ___

  * **Evidence:**

* **Taxes display** (incl or excl, at cart or checkout) - Status: ___

  * **Evidence:**

* **Duties display** (estimated or prepaid option) - Status: ___

  * **Evidence:**

* **Compliance and restricted items messaging** - Status: ___

  * **Evidence:**

---

## Shipping & Logistics

* **Shipping tiers and SLAs** (domestic, international) - Status: ___

  * **Evidence:**

* **Carriers** (visible labels or policy mention) - Status: ___

  * **Evidence:**

* **Cross‑border approach** (same site with calc vs separate intl site) - Status: ___

  * **Evidence:**

* **Returns and exchanges** (policy summary, portal, vendor if visible) - Status: ___

  * **Evidence:**

* **Final Sale / non‑returnable items** (where labeled, policy coverage, PDP badges) - Status: ___

  * **Evidence:**

* **Tracking and WISMO** (provider or pattern) - Status: ___

  * **Evidence:**

**Takeaway:**

---

## Loyalty, Subscriptions, and CRM

* **Loyalty / rewards program** (vendor, earn/burn, high level rules) - Status: ___

  * **Evidence:**

* **Subscriptions provider** - Status: ___

  * **Evidence:**

> Only name specific providers such as Smile.io or Recharge if detected or directly relevant. Do not include provider-specific absent bullets by default.


---

## Internationalization Testing

> Simulate checkout for 2–3 markets. Record currency, duties, taxes, and shipping. Add proof links.

**Market 1** (Country and currency)

* **Currency behavior:**

* **Prices incl or excl tax:**

* **Duties shown or prepaid option:**

* **Shipping options and cost tiers:**

* **Geo‑gates or address restrictions:**

* **Evidence:**

**Market 2** (Country and currency)

* **Currency behavior:**

* **Prices incl or excl tax:**

* **Duties shown or prepaid option:**

* **Shipping options and cost tiers:**

* **Geo‑gates or address restrictions:**

* **Evidence:**

**Market 3 (optional)**

* **Notes:**

* **Evidence:**

**Takeaway:**

---

## Legal and Compliance (surface‑level)


* **Restricted products or disclaimers** - Status: ___

  * **Evidence:**

**Takeaway:**

---

## Business Restrictions (split)

* **B2B / wholesale flows** - Status: ___

  * **Evidence:**

* **Marketplace presence** (Amazon, eBay, etc.) - Status: ___

  * **Evidence:**

* **Dropshippers / 3P fulfillment** - Status: ___

  * **Evidence:**

**Takeaway:**

---

## Apps, Integrations, and Data Layer (visible only)

* **Notable apps or widgets** - Status: ___

  * **Evidence:**

> Call out visible apps and red-flag providers when present. Do not list Smile.io or Recharge as absent unless the user specifically asks for a support-matrix check.


**Takeaway:**

---

## Tech Risks and Integration Notes (Presales)

* **Constraints or red flags:**

* **Likely integration surfaces** (webhooks, APIs, metafields) **[Inference]**

---

## Open Questions

*

## Next Steps

*

---

## Appendix - Screens and Notes

* Add annotated screenshots or short notes that support tricky findings.

---

### Legend

* **✅ Verified** - Direct UI evidence or authoritative policy page.

* **❔ Unconfirmed** - Signal seen but vendor or behavior not fully proven.

* **❌ Absent** - Looked in reasonable places and did not find it.

* **[Inference]** - Clearly labeled deduction with best available evidence.

