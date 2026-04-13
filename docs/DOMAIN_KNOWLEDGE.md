# Global-e Domain Knowledge

This document captures everything the WA app needs to know about Global-e's business rules, supported features, and red flags.

---

## What Is a Website Assessment?

A Website Assessment (WA) is a structured review of a merchant's e-commerce site, performed during the SOPP (Sales Opportunity Presales Process) to:

1. **Understand** the merchant's current tech stack and checkout flow
2. **Identify** potential integration challenges and OoS (Out of Scope) items
3. **Document** findings for the delivery team
4. **Feed** the DNA (Discovery Notes & Analysis) in Confluence

---

## Key Detection Targets

### Platforms

| Platform | Detection Signals |
|----------|-------------------|
| **Shopify** | `/checkouts/cn/` URL, `cdn.shopify.com`, `Shopify.theme` in source, Shop Pay button |
| **Shopify Plus** | Custom checkout, Script Editor access (hard to detect externally) |
| **SFCC (Salesforce)** | `demandware` in source, specific URL patterns |
| **Magento** | `mage/` paths, `Mage.Cookies` JS object |
| **BigCommerce** | `bigcommerce.com` scripts |
| **Custom/Headless** | React/Vue/Next.js patterns, API calls to separate backend |

### Headless Frameworks

| Framework | Detection Signals |
|-----------|-------------------|
| **Hydrogen** | Shopify's React framework, specific imports |
| **Next.js** | `_next/` paths, `__NEXT_DATA__` |
| **Gatsby** | `gatsby` in source |
| **Nuxt** | `_nuxt/` paths |

---

## Third-Party App Detection

### High Priority (Always Flag)

| App | Category | Detection Method | Notes |
|-----|----------|------------------|-------|
| **ReturnGO** | Returns | Network requests to `returngo.ai`, widget in footer | Our partner! Flag as positive |
| **Recharge** | Subscriptions | Network requests, subscription widget on PDP | Often OoS - proprietary checkout |
| **Smile.io** | Loyalty | Widget in corner, network requests | ❌ NOT SUPPORTED by GE |
| **LoyaltyLion** | Loyalty | Widget, network requests | ✅ Supported |
| **Yotpo** | Reviews/Loyalty | Widget, `yotpo` in network | ⚠️ In progress (slow) |

### Medium Priority

| App | Category | Detection Method |
|-----|----------|------------------|
| **Klaviyo** | Email/SMS | Signup forms, `klaviyo` scripts |
| **Attentive** | SMS | Popup forms |
| **Loop** | Returns | Returns portal |
| **Narvar** | Tracking/Returns | Tracking pages |
| **AfterShip** | Tracking | Tracking widget |
| **Rise.ai** | Gift Cards | Gift card widgets |
| **Nosto** | Personalization | Recommendation widgets |

### Checkout/Payment

| App | Category | Notes |
|-----|----------|-------|
| **Shop Pay** | Express wallet | Shopify native, indicates Shopify Payments |
| **Klarna** | BNPL | Supported |
| **Afterpay** | BNPL | Supported |
| **Sezzle** | BNPL | Check support |
| **Affirm** | BNPL | Check support |

---

## Shopify Apps Support Matrix

Reference: [Confluence Page](https://global-e.atlassian.net/wiki/spaces/SE/pages/3614113887/Shopify+Apps+Support+Matrix)

### ✅ Supported (Green)

| App | Type |
|-----|------|
| Klaviyo | Marketing |
| LoyaltyLion | Loyalty |
| Weglot | Translations |
| Shopify Translate & Adapt | Translations |
| Shopify Bundles | Bundles (C1 only) |
| Boost | Product Search |
| Nosto | Recommendations |
| Tagalys | Product Search |
| Signifyd | Fraud |
| S Loyalty | Loyalty/Rewards |
| DiscountYard | Cart coupons |
| Feedonomics | Shopping Feeds |
| DataFeedWatch | Shopping Feeds |
| Wishlist King | Wishlist |
| GemPages | Landing Pages |
| Bambuser | Live Shopping |
| MBC Bundle Products | Bundles |

### ⚠️ Partial Support (Yellow/Purple)

| App | Type | Notes |
|-----|------|-------|
| Yotpo | Loyalty/Reviews | IN PROGRESS (slow) |
| Rise.ai | Gift Cards/Store Credit | Partial support |
| Algolia | Search | Workaround needed |
| Searchspring | Search | Workaround needed |
| Script Editor | Checkout | Can cause issues - check usage |
| Route | Shipping Protection | Partial |
| AfterSell | Upsell | Domestic only |
| Riskified | Fraud | Workaround needed |
| Shopify Collabs | Influencer | Gift orders not visible to GE |
| Syncio | Inventory sync | Orders created directly = not supported |

### ❌ Not Supported (Red)

| App | Type | Why |
|-----|------|-----|
| **Recharge** | Subscriptions | Uses proprietary checkout |
| **Smile.io** | Loyalty | Not currently supported |
| Purple Dot | Pre-order | Conflicts with MoR model |
| Reach | Cross-border | Competing solution |
| SELLY / Ultimate Special Offers | Promotions | Not Markets aware |
| Shop by Shopify | Marketplace | N/A |
| Shopify Google App | Shopping Feeds | Ironically not supported |
| orderediting.com | Upsell | N/A |

---

## Red Flags to Auto-Flag

These findings should generate warnings in the WA:

| Finding | Impact | Severity |
|---------|--------|----------|
| **Smile.io loyalty** | Not currently supported by GE | 🔴 High |
| **Recharge subscriptions** | Proprietary checkout, often OoS | 🔴 High |
| **Variable restocking fees** | GE needs static fee | 🟡 Medium |
| **Bitcoin/crypto payments** | Not supported | 🔴 High |
| **Split tender / multiple cards on one order** | GE checkout expects a single payment flow per order (not pay-with-two-cards) | 🔴 High |
| **Amazon fulfillment** | OoS (ships from Amazon) | 🔴 High |
| **Fine Jewelry (18k+ gold)** | Can't ship to France | 🟡 Medium |
| **High AOV ($1500+)** | Express shipping only, may need exceptions | 🟡 Medium |
| **US-only services (HSA/FSA)** | OoS for international | 🟡 Medium |
| **Combined orders** | Check if supported internationally | 🟡 Medium |

---

## Dangerous Goods (DG)

### What Qualifies

- Perfumes and fragrances
- Nail polish and nail products
- Aerosol sprays
- Products with lithium batteries
- Flammable items
- Certain cosmetics

### DG Constraints

| Constraint | Details |
|------------|---------|
| **Carriers** | DG can ONLY ship via DHL Express or WYOL/RRD Standard |
| **GE Hub** | DG CANNOT ship via DHL Standard (GE Hub) |
| **Multiparcel** | DG multiparcel NOT supported |
| **Classification** | Two types: EQ (less paperwork) vs LQ (full documentation) |
| **Requirements** | Merchant needs certified DG person |
| **Timeline** | Classification takes up to 7 business days |
| **Catalog** | Products must be flagged as `IsDG=1` in catalog |

### Detection Signals

Look for product categories:
- "Perfume", "Fragrance", "Eau de"
- "Nail Polish", "Nail Lacquer"
- "Aerosol", "Spray"
- "Battery", "Lithium"

---

## 3B2C (B2B Injection)

### What It Is

Goods imported commercially first, then sold to customer in destination (vs traditional B2B2C where GE sells as personal import).

### When to Consider

- Merchant has local entities in destination markets
- High average price point (above duty threshold)
- High duty rates on products
- Merchant willing to set up local registration

### Scoping Questions

- Markets with local entities?
- Average price point vs duty threshold?
- Average order value?
- Country of origin for products?
- Return rate?

**Impact:** Requires lead approval, changes settlement/returns flow

---

## GWP (Gift With Purchase) / Free Products

### Why It Matters

Customs requires items to have a declared value. Items can't be truly "free" - they need to be priced and then discounted to $0.

### What to Look For

- $0.00 line items in cart/checkout
- "Free gift with $X+ purchase" banners
- Auto-added items at checkout
- "Try & Buy" programs

### Reporting

Note how GWP appears in checkout so merchant can be advised on customs pricing.

---

## Features Requiring Lead Approval

These should NOT be assumed in scope:

| Feature | Notes |
|---------|-------|
| **Subscriptions** | Must be approved by lead |
| **Loyalty Programs** | Must be approved by lead |
| **B2B / Wholesale** | Usually OoS due to GMV |
| **3B2C** | Requires lead approval |

---

## Catalog Red Flags

Flag these items - they require special handling:

| Item | Impact |
|------|--------|
| **Dangerous Goods** | DHL Express only, special paperwork |
| **CITES** (endangered materials) | Operations approval needed |
| **High Value Items** | Operations approval needed |
| **Jewelry/Precious Stones** | Special handling |
| **Food Items** | May be restricted by country (tea is fine for personal use) |
| **Cosmetics** | FDA requirements for US |
| **Knives/Cutlery** | Restricted in some countries |
| **Iron/Steel Products** | Tariff implications |
| **Glasses/Contact Lenses** | US import requirements |
| **MID Required** | Orders >$800 USD with China COO |

### Shipping insurance (merchant claim)

When the merchant says **all packages are fully insured**, capture it with a **cited URL** (shipping FAQ, policy, checkout copy), not only as verbal scope.

For **Global-e**, still clarify in presales: coverage for **international** vs **US-only** lanes, whether it is **carrier-declared value / GE logistics** vs a **Shopify third-party** (e.g. Route—often partial or domestic-only), and that **marketing “insured”** must line up with **customs declared value** and carrier terms. High-AOV jewelry may need **Operations** confirmation either way.

---

## Bundles / Sets / Kits

### Why It Matters

Need to understand how bundles are structured for order/inventory management.

### What to Check

1. Add a bundle to cart - how does it appear?
2. **Parent-child SKUs?** Does cart show one line item (parent) or multiple (children)?
3. **Bundling methods:** BOGO, build-your-own, pre-configured sets, mix-and-match
4. **Pricing:** Single bundle price or sum of components?

---

## Script Editor Warning (Shopify)

Script Editor can break GE integration if merchant uses it to:
- Hide payment methods
- Force checkout country to US
- Hide shipping locations

**Always note if Script Editor is detected.**

---

## Evidence Standards

### Status Labels

| Label | When to Use | Required Evidence |
|-------|-------------|-------------------|
| ✅ Verified | Direct evidence found | URL + quote from page |
| ❔ Unconfirmed | Signal seen but not proven | Notes explaining uncertainty |
| ❌ Absent | Looked and didn't find | Where we looked |
| [Inference] | Deduction from signals | Show reasoning |

### Evidence Quality

- **Quotes should be exact** from the page text
- **URLs should be specific** (not just homepage)
- **Inferences must be flagged** - e.g., "Shop Pay button implies Shopify Payments [Inference]"
- **Screenshots** for shipping/returns policies only (not ToS, Privacy)

---

## Questions Patterns for Sales

After the WA, certain findings trigger questions:

### Platform Limitations
> "Subscriptions on Shopify → Often OoS. Is this in scope?"

### Shipping/Fulfillment
> "Fine Jewelry (18k+ gold) → Can't ship to France. Does merchant know?"

### Workflow Clarifications
> "They have [feature]. We can support this but I would need to know more about their workflow."

### GE Support Gaps
> "[Feature] is not supported by GE. The system expects [X]."

### Split payments
> "Splitting one order across multiple credit cards is OoS on Global-e. For cross-border, scope assumes one payment instrument (or standard BNPL where enabled), not multi-card checkout."

### Long lead time / made-to-order (capture vs authorization)
> "With ~8 week (or longer) production, **card authorizations cannot stay open** for the whole build—networks and issuers expire holds in days, not weeks. They need a clear **capture process** with Global-e: whether the shopper is **charged at order** (full capture up front), **deposit + balance** (two captures / two orders), or another **GE-approved** pattern. Confirm timing vs **CAD/stone approval**, **chargebacks**, and how **Bread Pay** (if used) funds the merchant relative to ship date."

### Verification Needed
> "Their [policy] mentions [X] but I didn't see it on the site. If they have/plan this, who services it?"

