# Website Assessment

**Purpose:** A single template for quick first‑pass reviews that pairs the site assessment with Discovery Notes & Analysis (DNA). This doc includes 1) a short playbook and 2) a fill‑in template you can paste into any merchant thread.

---

## 1) Playbook — how to run a Website Assessment

### Ground rules

1. **Label every line item** as **✅ Verified**, **❔ Unconfirmed**, or **❌ Absent**.

2. **Show receipts.** Add **explicit evidence links** that resolve to specific pages or screens. Avoid homepages unless truly needed. Use **plain URLs** (not markdown link syntax) so the document can be easily copy-pasted with styling intact into Jira, Confluence, or Slack.

3. **Be honest about certainty.** If a statement involves deduction, mark it with **[Inference]** and still include the best supporting link you have. If something cannot be verified, leave it **❔ Unconfirmed** and explain why.

4. **Don't purchase.** Step through checkout as far as allowed to collect evidence on currency, duties, taxes, shipping options, and payments.

5. **Business Restrictions are split**: B2B, Marketplace, Dropshippers each has its own line.

6. Keep it tight. Prefer concise bullets. Add a one‑line takeaway for any long section.

### Workflow (10–25 minutes)

1. **Pre‑flight**

   * Open Home, a representative PDP, Cart, and Checkout (as far as allowed).

   * Open key policy pages: Shipping, Returns, Payments/FAQ.

   * Note any region selector, language selector, or currency behavior.

2. **Evidence Log first**

   * Paste working links with descriptive titles.

   * If a page is missing, note **❌ Absent** and say where you looked.

3. **Platform snapshot**

   * Confirm platform and any headless stack hints. Capture one proof link.

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

* **Format for copy-paste:** Use plain URLs and emoji status indicators (✅❌❔⚠️) so the document renders correctly when pasted into Jira, Confluence, or Slack.

---

## 2) Fill‑in Template (copy this section into a merchant thread)

> Use this single template for quick first‑pass reviews. Mark every line item as **✅ Verified**, **❔ Unconfirmed**, or **❌ Absent**. Add **explicit evidence links as plain URLs** (not markdown links) so the doc can be copy-pasted with styling into Jira/Confluence. If something is **❔ Unconfirmed**, add brief context (e.g., *"Affiliate icon seen in footer; vendor unclear"*). If not seen, state that explicitly. Tag deductions as **[Inference]**.

### Merchant Overview

* **Brand:**

* **Primary URL:**

* **Other Locales / Sites:**

* **Notes / Scope of this pass:** (device, region, depth, no purchase)

### Evidence Log (Working Links)

* **Home:**

* **PDP (example):**

* **Cart:**

* **Checkout (as far as allowed):**

* **Shipping policy:**

* **Returns policy:**

* **Payments or FAQ page:**

* **Loyalty / Rewards page:**

* **Subscriptions page:**

* **Other key proof links:**

> **Method:** Step through to checkout for evidence (no purchases). Capture region, currency, language behavior, taxes, duties, shipping options, and express wallets.

---

## Platform & Site Structure

* **Platform & Version** — Status: ___

  * **Evidence:**

* **Headless / Frontend architecture** — Status: ___

  * **Evidence:**

* **Domain and subdomain strategy** (store, help, blog, custom) — Status: ___

  * **Evidence:**

* **Geo / Country selector** — Status: ___

  * **Evidence:**

* **Languages / translation approach** — Status: ___

  * **Evidence:**

* **Mobile experience** (nav, PDP, PLP notes) — Status: ___

  * **Evidence:**

* **Performance quick read** (perceived load, CLS jank, image weight) — Status: ___

  * **Evidence:**

* **Accessibility quick read** (alt text presence, keyboard traps, contrast hints) — Status: ___

  * **Evidence:**

---

## Catalog & Products

* **Product types and variants (Note any dangerous goods or things that would be difficult to ship at scale)** — Status: ___

  * **Evidence:**

* **Bundles / kits** — Status: ___

  * **Evidence:**

* **Customizable products / product configurator** (e.g., build-your-own, engravings, monograms) — Status: ___

  * **Evidence:**

* **Virtual / Digital products** (e.g., e-gift cards, downloads, memberships; delivery method) — Status: ___

  * **Evidence:**

* **GWP / Free product promotions / Try & Buy** (trigger rules, where shown—PDP, cart, banner; auto-add vs code) — Status: ___

  * **Evidence:**

* **Pre‑orders** (note when shopper is charged; % of catalog if material) — Status: ___

  * **Evidence:**

* **Subscriptions on PDP or cart** (note any recurring payment options) — Status: ___

  * **Evidence:**

* **UGC / Reviews provider** (nice to have) — Status: ___

  * **Evidence:**

* **PLP filters and sort** — Status: ___

  * **Evidence:**

* **On‑site search behavior** — Status: ___

  * **Evidence:**

**Takeaway:**

---

## Checkout & Payments

* **Checkout flow type** (embedded, hosted, one‑page, multi‑step) — Status: ___

  * **Evidence:**

* **Express wallets** (Shop Pay, PayPal, Apple Pay, Google Pay) — Status: ___

  * **Evidence:**

* **Payment methods** (cards, BNPL, local methods) — Status: ___

  * **Evidence:**

* **Gift cards** (native or vendor) — Status: ___

  * **Evidence:**

* **Fraud / risk hints** (visible only) — Status: ___

  * **Evidence:**

* **Taxes display** (incl or excl, at cart or checkout) — Status: ___

  * **Evidence:**

* **Duties display** (estimated or prepaid option) — Status: ___

  * **Evidence:**

* **Compliance and restricted items messaging** — Status: ___

  * **Evidence:**

---

## Shipping & Logistics

* **Shipping tiers and SLAs** (domestic, international) — Status: ___

  * **Evidence:**

* **Carriers** (visible labels or policy mention) — Status: ___

  * **Evidence:**

* **Cross‑border approach** (same site with calc vs separate intl site) — Status: ___

  * **Evidence:**

* **Returns and exchanges** (policy summary, portal, vendor if visible) — Status: ___

  * **Evidence:**

* **Final Sale / non‑returnable items** (where labeled, policy coverage, PDP badges) — Status: ___

  * **Evidence:**

* **Tracking and WISMO** (provider or pattern) — Status: ___

  * **Evidence:**

**Takeaway:**

---

## Loyalty, Subscriptions, and CRM

* **Loyalty / rewards program** (vendor, earn/burn, high level rules) — Status: ___

  * **Evidence:**

* **Subscriptions provider** — Status: ___

  * **Evidence:**

* **Email / SMS** (visible tags or UI) — Status: ___

  * **Evidence:**

* **Personalization / testing** (CDP, A/B tools visible) — Status: ___

  * **Evidence:**

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

* **Policies present** (Shipping, Returns, Privacy, Terms) — Status: ___

  * **Evidence:**

* **Cookie consent or CMP behavior** — Status: ___

  * **Evidence:**

* **Restricted products or disclaimers** — Status: ___

  * **Evidence:**

**Takeaway:**

---

## Business Restrictions (split)

* **B2B / wholesale flows** — Status: ___

  * **Evidence:**

* **Marketplace presence** (Amazon, eBay, etc.) — Status: ___

  * **Evidence:**

* **Dropshippers / 3P fulfillment** — Status: ___

  * **Evidence:**

**Takeaway:**

---

## Apps, Integrations, and Data Layer (visible only)

* **Notable apps or widgets** — Status: ___

  * **Evidence:**

* **Analytics tags** (GA4, GTM, others if visible in UI) — Status: ___

  * **Evidence:**

* **Sitemaps or robots hints** — Status: ___

  * **Evidence:**

**Takeaway:**

---

## Tech Risks and Integration Notes (Presales)

* **Constraints or red flags:**

* **Likely integration surfaces** (webhooks, APIs, metafields) **[Inference]**

* **Level of effort estimate** (T‑shirt size) **[Inference]**

---

## Opportunities and Recommendations

* **Quick wins (0–4 weeks):**

* **Near‑term (1–3 months):**

* **Strategic (quarter and beyond):**

---

## Open Questions

*

## Next Steps

*

---

## Appendix — Screens and Notes

* Add annotated screenshots or short notes that support tricky findings.

---

### Legend

* **✅ Verified** — Direct UI evidence or authoritative policy page.

* **❔ Unconfirmed** — Signal seen but vendor or behavior not fully proven.

* **❌ Absent** — Looked in reasonable places and did not find it.

* **[Inference]** — Clearly labeled deduction with best available evidence.

