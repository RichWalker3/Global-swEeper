# WA JSON Schema Design

This document maps the Website Assessment template to a structured JSON schema.

---

## Core Principles

1. **Every check has a status:** `verified` | `unconfirmed` | `absent`
2. **Evidence is required for verified:** URL + quote/snippet
3. **Unconfirmed explains why:** What we saw, what we couldn't verify
4. **Absent says where we looked:** URLs checked without finding it
5. **Inferences are flagged:** Separate from hard evidence
6. **Machine-readable:** Easy to validate, query, and render

---

## Status Types

```typescript
type Status = 'verified' | 'unconfirmed' | 'absent';
```

| Status | When to Use | Required Fields |
|--------|-------------|-----------------|
| `verified` | Direct evidence found | `evidence[]` with url + quote |
| `unconfirmed` | Signal seen but not proven | `notes`, optionally `evidence[]` |
| `absent` | Looked and didn't find | `searched_urls[]` or `notes` |

---

## Evidence Structure

```typescript
interface Evidence {
  url: string;           // The page where this was found
  quote: string;         // Exact text or description
  screenshot?: string;   // Path to screenshot if captured
  inference?: boolean;   // True if this is a deduction, not direct proof
}
```

---

## Top-Level Schema

```typescript
interface WebsiteAssessment {
  // Metadata
  meta: AssessmentMeta;
  
  // Evidence log (all visited pages)
  evidence_log: EvidenceLog;
  
  // Assessment sections (matching template)
  platform: PlatformSection;
  catalog: CatalogSection;
  checkout: CheckoutSection;
  shipping: ShippingSection;
  loyalty_crm: LoyaltyCRMSection;
  internationalization: InternationalizationSection;
  legal: LegalSection;
  business_restrictions: BusinessRestrictionsSection;
  integrations: IntegrationsSection;
  
  // Synthesis
  tech_risks: TechRisks;
  opportunities: Opportunities;
  open_questions: string[];
  next_steps: string[];
  
  // Crawler info
  crawl_summary: CrawlSummary;
}
```

---

## Section Schemas

### Meta

```typescript
interface AssessmentMeta {
  brand: string;
  primary_url: string;
  other_locales?: string[];
  assessed_at: string;        // ISO timestamp
  scope_notes: string;        // e.g., "Desktop, US region, no purchase"
}
```

### Evidence Log

```typescript
interface EvidenceLog {
  home: PageRef | null;
  pdp_example: PageRef | null;
  cart: PageRef | null;
  checkout: PageRef | null;
  shipping_policy: PageRef | null;
  returns_policy: PageRef | null;
  faq: PageRef | null;
  loyalty_page: PageRef | null;
  subscriptions_page: PageRef | null;
  other: PageRef[];
}

interface PageRef {
  url: string;
  title?: string;
  screenshot?: string;
  notes?: string;
}
```

### Platform & Site Structure

```typescript
interface PlatformSection {
  platform: Check & {
    platform_name?: string;  // e.g., "Shopify", "SFCC", "Magento", "Custom"
    version?: string;
  };
  headless: Check & {
    framework?: string;      // e.g., "Next.js", "Hydrogen", "PWA Kit"
  };
  domain_strategy: Check;
  geo_selector: Check;
  languages: Check;
  mobile_experience: Check;
  performance: Check;
  accessibility: Check;
  takeaway?: string;
}

// Base check structure used everywhere
interface Check {
  status: Status;
  evidence?: Evidence[];
  notes?: string;
  searched_urls?: string[];  // For absent status
}
```

### Catalog & Products

```typescript
interface CatalogSection {
  product_types: Check & {
    dangerous_goods?: boolean;
    difficult_to_ship?: string[];  // List of product types
  };
  bundles: Check;
  customization: Check & {
    types?: string[];  // e.g., ["monogram", "engraving"]
  };
  virtual_digital: Check & {
    types?: string[];  // e.g., ["e-gift cards", "downloads"]
  };
  gwp_promotions: Check;
  preorders: Check & {
    charge_timing?: string;  // e.g., "at order", "at ship"
  };
  subscriptions: Check & {
    provider?: string;  // e.g., "Recharge", "Bold", "native"
  };
  reviews: Check & {
    provider?: string;  // e.g., "Yotpo", "Stamped", "Judge.me"
  };
  plp_filters: Check;
  onsite_search: Check;
  takeaway?: string;
}
```

### Checkout & Payments

```typescript
interface CheckoutSection {
  flow_type: Check & {
    type?: string;  // "embedded" | "hosted" | "one-page" | "multi-step"
  };
  express_wallets: Check & {
    wallets?: string[];  // e.g., ["Shop Pay", "Apple Pay", "PayPal"]
  };
  payment_methods: Check & {
    methods?: string[];  // e.g., ["Visa", "Mastercard", "Klarna", "Afterpay"]
  };
  gift_cards: Check & {
    type?: string;  // "native" | vendor name
  };
  fraud_hints: Check;
  taxes_display: Check & {
    included?: boolean;
    shown_at?: string;  // "cart" | "checkout" | "both"
  };
  duties_display: Check & {
    shown?: boolean;
    prepaid_option?: boolean;
  };
  compliance_messaging: Check;
  takeaway?: string;
}
```

### Shipping & Logistics

```typescript
interface ShippingSection {
  shipping_tiers: Check & {
    domestic?: ShippingTier[];
    international?: ShippingTier[];
  };
  carriers: Check & {
    carriers?: string[];  // e.g., ["UPS", "FedEx", "USPS"]
  };
  cross_border: Check & {
    approach?: string;  // "same site with calc" | "separate intl site" | "geo-redirect"
  };
  returns: Check & {
    window?: string;      // e.g., "30 days"
    portal?: boolean;
    vendor?: string;      // e.g., "ReturnGO", "Loop", "Narvar"
  };
  final_sale: Check & {
    categories?: string[];  // e.g., ["clearance", "underwear", "personalized"]
  };
  tracking: Check & {
    provider?: string;  // e.g., "AfterShip", "Narvar", "native"
  };
  takeaway?: string;
}

interface ShippingTier {
  name: string;          // e.g., "Standard", "Express"
  sla?: string;          // e.g., "5-7 business days"
  cost?: string;         // e.g., "Free over $50", "$9.99"
}
```

### Loyalty, Subscriptions, and CRM

```typescript
interface LoyaltyCRMSection {
  loyalty_program: Check & {
    vendor?: string;       // e.g., "Smile.io", "LoyaltyLion", "Yotpo"
    earn_rules?: string;   // e.g., "1 point per $1"
    burn_rules?: string;   // e.g., "100 points = $1"
  };
  subscriptions_provider: Check & {
    provider?: string;
  };
  email_sms: Check & {
    vendors?: string[];    // e.g., ["Klaviyo", "Attentive"]
  };
  personalization: Check & {
    tools?: string[];      // e.g., ["Nosto", "Dynamic Yield"]
  };
  takeaway?: string;
}
```

### Internationalization

```typescript
interface InternationalizationSection {
  markets_tested: MarketTest[];
  takeaway?: string;
}

interface MarketTest {
  country: string;
  currency: string;
  currency_behavior?: string;       // e.g., "auto-converts", "selector available"
  prices_include_tax?: boolean;
  duties_shown?: boolean;
  duties_prepaid_option?: boolean;
  shipping_options?: ShippingTier[];
  geo_gates?: string;               // Any restrictions found
  evidence?: Evidence[];
}
```

### Legal and Compliance

```typescript
interface LegalSection {
  policies_present: Check & {
    policies?: string[];  // e.g., ["shipping", "returns", "privacy", "terms"]
  };
  cookie_consent: Check & {
    cmp?: string;  // e.g., "OneTrust", "Cookiebot", "native"
  };
  restricted_products: Check;
  takeaway?: string;
}
```

### Business Restrictions

```typescript
interface BusinessRestrictionsSection {
  b2b_wholesale: Check;
  marketplace_presence: Check & {
    marketplaces?: string[];  // e.g., ["Amazon", "eBay"]
  };
  dropshippers: Check;
  takeaway?: string;
}
```

### Apps, Integrations, and Data Layer

```typescript
interface IntegrationsSection {
  notable_apps: Check & {
    apps?: AppInfo[];
  };
  analytics: Check & {
    tags?: string[];  // e.g., ["GA4", "GTM", "Segment"]
  };
  sitemaps_robots: Check;
  takeaway?: string;
}

interface AppInfo {
  name: string;
  category?: string;  // e.g., "returns", "reviews", "subscriptions"
  notes?: string;
}
```

### Tech Risks

```typescript
interface TechRisks {
  constraints: string[];
  red_flags: string[];
  integration_surfaces: string[];  // [Inference]
  effort_estimate?: string;        // [Inference] T-shirt size
}
```

### Opportunities

```typescript
interface Opportunities {
  quick_wins: string[];      // 0-4 weeks
  near_term: string[];       // 1-3 months
  strategic: string[];       // Quarter and beyond
}
```

### Crawl Summary (from the scraper, not LLM)

```typescript
interface CrawlSummary {
  seed_url: string;
  domain: string;
  started_at: string;
  completed_at: string;
  pages_visited: number;
  pages_blocked: number;
  checkout_reached: boolean;
  checkout_stopped_at?: string;
  platform_detected?: string;
  headless_detected?: boolean;
  global_e_detected?: boolean;
  returngo_detected?: boolean;
  errors: CrawlError[];
  third_parties_detected: string[];
}

interface CrawlError {
  url: string;
  error: string;
  type: 'timeout' | 'blocked' | 'auth_required' | 'not_found' | 'other';
}
```

---

## Complete Example

```json
{
  "meta": {
    "brand": "Example Brand",
    "primary_url": "https://example.com",
    "other_locales": ["https://example.co.uk", "https://example.ca"],
    "assessed_at": "2024-12-18T10:30:00Z",
    "scope_notes": "Desktop, US region, no purchase made"
  },
  "evidence_log": {
    "home": { "url": "https://example.com", "title": "Example Brand | Home" },
    "pdp_example": { "url": "https://example.com/products/test-product", "title": "Test Product" },
    "cart": { "url": "https://example.com/cart" },
    "checkout": { "url": "https://example.com/checkout", "notes": "Reached shipping step" },
    "shipping_policy": { "url": "https://example.com/policies/shipping-policy" },
    "returns_policy": { "url": "https://example.com/policies/refund-policy" },
    "faq": null,
    "loyalty_page": { "url": "https://example.com/pages/rewards" },
    "subscriptions_page": null,
    "other": []
  },
  "platform": {
    "platform": {
      "status": "verified",
      "platform_name": "Shopify",
      "evidence": [
        { "url": "https://example.com", "quote": "Shopify.theme detected in page source" }
      ]
    },
    "headless": {
      "status": "absent",
      "notes": "Standard Shopify theme, no headless signals detected"
    },
    "domain_strategy": {
      "status": "verified",
      "evidence": [
        { "url": "https://example.com", "quote": "Main store on root domain, help subdomain for support" }
      ]
    },
    "geo_selector": {
      "status": "verified",
      "evidence": [
        { "url": "https://example.com", "quote": "Country selector in footer with 12 countries" }
      ]
    },
    "languages": {
      "status": "unconfirmed",
      "notes": "English only observed, may have translation app"
    },
    "mobile_experience": {
      "status": "verified",
      "evidence": [
        { "url": "https://example.com", "quote": "Responsive design, hamburger nav on mobile" }
      ]
    },
    "performance": {
      "status": "verified",
      "notes": "Fast perceived load, no CLS issues observed"
    },
    "accessibility": {
      "status": "unconfirmed",
      "notes": "Alt text present on most images, keyboard nav not tested"
    }
  },
  "catalog": {
    "product_types": {
      "status": "verified",
      "dangerous_goods": false,
      "evidence": [
        { "url": "https://example.com/collections/all", "quote": "Apparel and accessories, no hazmat items observed" }
      ]
    },
    "bundles": {
      "status": "verified",
      "evidence": [
        { "url": "https://example.com/products/starter-kit", "quote": "'This set includes' section with 3 items" }
      ]
    },
    "customization": {
      "status": "absent",
      "searched_urls": ["https://example.com/collections/all", "https://example.com/products/test-product"],
      "notes": "No monogram or customization options found on PDPs"
    },
    "virtual_digital": {
      "status": "verified",
      "types": ["e-gift cards"],
      "evidence": [
        { "url": "https://example.com/products/gift-card", "quote": "Digital gift card, delivered by email" }
      ]
    },
    "gwp_promotions": {
      "status": "unconfirmed",
      "notes": "Banner mentions 'Free gift with purchase over $100' but trigger not verified"
    },
    "preorders": {
      "status": "absent",
      "notes": "No pre-order badges or language observed"
    },
    "subscriptions": {
      "status": "verified",
      "provider": "Recharge",
      "evidence": [
        { "url": "https://example.com/products/vitamins", "quote": "Subscribe & Save 15% option with frequency selector" },
        { "url": "https://example.com", "quote": "Recharge script detected in network requests", "inference": true }
      ]
    },
    "reviews": {
      "status": "verified",
      "provider": "Yotpo",
      "evidence": [
        { "url": "https://example.com/products/test-product", "quote": "Yotpo review widget with 4.5 star rating" }
      ]
    },
    "plp_filters": {
      "status": "verified",
      "evidence": [
        { "url": "https://example.com/collections/all", "quote": "Filter by size, color, price range" }
      ]
    },
    "onsite_search": {
      "status": "verified",
      "evidence": [
        { "url": "https://example.com", "quote": "Predictive search with product suggestions" }
      ]
    },
    "takeaway": "Standard catalog with subscriptions via Recharge and gift cards. No customization or pre-orders."
  },
  "shipping": {
    "shipping_tiers": {
      "status": "verified",
      "domestic": [
        { "name": "Standard", "sla": "5-7 business days", "cost": "Free over $75, otherwise $7.99" },
        { "name": "Express", "sla": "2-3 business days", "cost": "$14.99" }
      ],
      "international": [
        { "name": "International Standard", "sla": "10-14 business days", "cost": "$19.99" }
      ],
      "evidence": [
        { "url": "https://example.com/policies/shipping-policy", "quote": "See tiers above" }
      ]
    },
    "carriers": {
      "status": "verified",
      "carriers": ["UPS", "USPS"],
      "evidence": [
        { "url": "https://example.com/policies/shipping-policy", "quote": "We ship via UPS and USPS" }
      ]
    },
    "cross_border": {
      "status": "verified",
      "approach": "same site with calc",
      "evidence": [
        { "url": "https://example.com/checkout", "quote": "International shipping calculated at checkout" }
      ]
    },
    "returns": {
      "status": "verified",
      "window": "30 days",
      "portal": true,
      "vendor": "ReturnGO",
      "evidence": [
        { "url": "https://example.com/policies/refund-policy", "quote": "Return within 30 days for full refund" },
        { "url": "https://example.com", "quote": "ReturnGO script detected", "inference": true }
      ]
    },
    "final_sale": {
      "status": "verified",
      "categories": ["clearance", "personalized items"],
      "evidence": [
        { "url": "https://example.com/policies/refund-policy", "quote": "Final sale items cannot be returned" }
      ]
    },
    "tracking": {
      "status": "unconfirmed",
      "notes": "Order tracking mentioned but provider not identified"
    },
    "takeaway": "Clear shipping policy with free threshold. ReturnGO already integrated for returns."
  },
  "checkout": {
    "flow_type": {
      "status": "verified",
      "type": "hosted",
      "evidence": [
        { "url": "https://example.com/checkout", "quote": "Shopify-hosted checkout on checkout.shopify.com subdomain" }
      ]
    },
    "express_wallets": {
      "status": "verified",
      "wallets": ["Shop Pay", "Apple Pay", "Google Pay", "PayPal"],
      "evidence": [
        { "url": "https://example.com/cart", "quote": "Express checkout buttons visible above cart" }
      ]
    },
    "payment_methods": {
      "status": "verified",
      "methods": ["Visa", "Mastercard", "Amex", "Discover", "Klarna"],
      "evidence": [
        { "url": "https://example.com/checkout", "quote": "Card logos in footer, Klarna option at payment step" }
      ]
    },
    "gift_cards": {
      "status": "verified",
      "type": "native",
      "evidence": [
        { "url": "https://example.com/checkout", "quote": "Gift card field in checkout sidebar" }
      ]
    },
    "fraud_hints": {
      "status": "unconfirmed",
      "notes": "No visible fraud provider, likely Shopify native"
    },
    "taxes_display": {
      "status": "verified",
      "included": false,
      "shown_at": "checkout",
      "evidence": [
        { "url": "https://example.com/checkout", "quote": "Tax calculated and shown at checkout" }
      ]
    },
    "duties_display": {
      "status": "verified",
      "shown": true,
      "prepaid_option": false,
      "evidence": [
        { "url": "https://example.com/checkout", "quote": "'Duties and taxes may apply at delivery' message" }
      ]
    },
    "compliance_messaging": {
      "status": "absent",
      "notes": "No restricted items messaging observed"
    },
    "takeaway": "Standard Shopify checkout with full express wallet support. DDU for international."
  },
  "loyalty_crm": {
    "loyalty_program": {
      "status": "verified",
      "vendor": "Smile.io",
      "earn_rules": "1 point per $1 spent",
      "burn_rules": "100 points = $1 off",
      "evidence": [
        { "url": "https://example.com/pages/rewards", "quote": "Smile.io rewards widget in corner" }
      ]
    },
    "subscriptions_provider": {
      "status": "verified",
      "provider": "Recharge",
      "evidence": [
        { "url": "https://example.com", "quote": "Recharge scripts in network traffic" }
      ]
    },
    "email_sms": {
      "status": "verified",
      "vendors": ["Klaviyo"],
      "evidence": [
        { "url": "https://example.com", "quote": "Klaviyo signup form in footer", "inference": true }
      ]
    },
    "personalization": {
      "status": "absent",
      "notes": "No personalization or A/B tools detected"
    },
    "takeaway": "Active loyalty program with Smile.io. Subscriptions via Recharge."
  },
  "internationalization": {
    "markets_tested": [
      {
        "country": "United States",
        "currency": "USD",
        "currency_behavior": "Default currency",
        "prices_include_tax": false,
        "duties_shown": false,
        "shipping_options": [
          { "name": "Standard", "sla": "5-7 days", "cost": "$7.99" }
        ],
        "evidence": [
          { "url": "https://example.com/checkout", "quote": "US checkout tested" }
        ]
      }
    ],
    "takeaway": "Only US tested in this pass. International testing deferred."
  },
  "legal": {
    "policies_present": {
      "status": "verified",
      "policies": ["shipping", "returns", "privacy", "terms"],
      "evidence": [
        { "url": "https://example.com", "quote": "All four standard policies linked in footer" }
      ]
    },
    "cookie_consent": {
      "status": "verified",
      "cmp": "native",
      "evidence": [
        { "url": "https://example.com", "quote": "Simple cookie banner with accept button" }
      ]
    },
    "restricted_products": {
      "status": "absent",
      "notes": "No age-gated or restricted product categories observed"
    },
    "takeaway": "Standard policies present. No compliance concerns."
  },
  "business_restrictions": {
    "b2b_wholesale": {
      "status": "absent",
      "searched_urls": ["https://example.com"],
      "notes": "No wholesale or B2B links found"
    },
    "marketplace_presence": {
      "status": "unconfirmed",
      "notes": "Amazon link in footer but unclear if official store"
    },
    "dropshippers": {
      "status": "absent",
      "notes": "No dropship policy or restrictions mentioned"
    },
    "takeaway": "No B2B flows. Possible Amazon presence needs verification."
  },
  "integrations": {
    "notable_apps": {
      "status": "verified",
      "apps": [
        { "name": "ReturnGO", "category": "returns" },
        { "name": "Recharge", "category": "subscriptions" },
        { "name": "Yotpo", "category": "reviews" },
        { "name": "Smile.io", "category": "loyalty" },
        { "name": "Klaviyo", "category": "email" }
      ]
    },
    "analytics": {
      "status": "verified",
      "tags": ["GA4", "GTM"],
      "evidence": [
        { "url": "https://example.com", "quote": "GTM container and GA4 tag detected" }
      ]
    },
    "sitemaps_robots": {
      "status": "verified",
      "evidence": [
        { "url": "https://example.com/sitemap.xml", "quote": "Standard Shopify sitemap present" }
      ]
    },
    "takeaway": "Healthy app stack. ReturnGO already in place!"
  },
  "tech_risks": {
    "constraints": [],
    "red_flags": [],
    "integration_surfaces": ["Shopify webhooks", "Shopify Flow", "Metafields for custom data"],
    "effort_estimate": "S"
  },
  "opportunities": {
    "quick_wins": [
      "Enable DDP for international orders to reduce cart abandonment"
    ],
    "near_term": [
      "Add post-purchase upsell via ReturnGO tracking page"
    ],
    "strategic": [
      "Expand to headless for better performance"
    ]
  },
  "open_questions": [
    "Is the Amazon presence an official store or unauthorized resellers?",
    "What is the average order value for subscription products?"
  ],
  "next_steps": [
    "Schedule discovery call to discuss DDP enablement",
    "Share ReturnGO tracking page customization options"
  ],
  "crawl_summary": {
    "seed_url": "https://example.com",
    "domain": "example.com",
    "started_at": "2024-12-18T10:25:00Z",
    "completed_at": "2024-12-18T10:30:00Z",
    "pages_visited": 24,
    "pages_blocked": 0,
    "checkout_reached": true,
    "checkout_stopped_at": "shipping step",
    "platform_detected": "Shopify",
    "headless_detected": false,
    "global_e_detected": false,
    "returngo_detected": true,
    "errors": [],
    "third_parties_detected": ["Recharge", "Yotpo", "Smile.io", "Klaviyo", "ReturnGO"]
  }
}
```

---

## What the Scraper Provides vs. What the LLM Provides

| Data | Source |
|------|--------|
| `crawl_summary` | Scraper (no LLM) |
| `evidence_log` | Scraper (no LLM) |
| Page URLs, screenshots | Scraper (no LLM) |
| Platform/headless detection | Scraper (no LLM) |
| Third-party detection | Scraper (no LLM) |
| Status determinations | **LLM** |
| Evidence quotes | **LLM** (from cleaned text) |
| Notes and takeaways | **LLM** |
| Opportunities and recommendations | **LLM** |

---

## Questions for Review

1. **Is this structure complete?** Are there fields from your template that I missed?

2. **Internationalization scope:** For MVP, should we just do US testing and leave markets_tested with one entry? Multi-market is post-MVP anyway.

3. **Inference handling:** Is the `inference: true` flag on evidence items sufficient, or do you want a separate section for inferences?

4. **Takeaways:** Should these be per-section (as shown) or one big summary at the end?

5. **Effort estimate options:** What T-shirt sizes do you use? (XS, S, M, L, XL? Or different scale?)

