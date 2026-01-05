/**
 * Full Website Assessment schema
 */

import { z } from 'zod';
import { CheckSchema, PageRefSchema, ShippingTierSchema, AppInfoSchema, EvidenceSchema } from './common.js';

// Meta section
const MetaSchema = z.object({
  brand: z.string(),
  primaryUrl: z.string().url(),
  otherLocales: z.array(z.string()).optional(),
  assessedAt: z.string(),
  scopeNotes: z.string(),
});

// Evidence log
const EvidenceLogSchema = z.object({
  home: PageRefSchema.nullable(),
  pdpExample: PageRefSchema.nullable(),
  cart: PageRefSchema.nullable(),
  checkout: PageRefSchema.nullable(),
  shippingPolicy: PageRefSchema.nullable(),
  returnsPolicy: PageRefSchema.nullable(),
  faq: PageRefSchema.nullable(),
  loyaltyPage: PageRefSchema.nullable(),
  subscriptionsPage: PageRefSchema.nullable(),
  other: z.array(PageRefSchema),
});

// Platform section
const PlatformSectionSchema = z.object({
  platform: CheckSchema.extend({
    platformName: z.string().optional(),
    version: z.string().optional(),
  }),
  headless: CheckSchema.extend({
    framework: z.string().optional(),
  }),
  domainStrategy: CheckSchema,
  geoSelector: CheckSchema,
  languages: CheckSchema,
  mobileExperience: CheckSchema,
  performance: CheckSchema,
  accessibility: CheckSchema,
  takeaway: z.string().optional(),
});

// Catalog section
const CatalogSectionSchema = z.object({
  productTypes: CheckSchema.extend({
    dangerousGoods: z.boolean().optional(),
    difficultToShip: z.array(z.string()).optional(),
  }),
  bundles: CheckSchema,
  customization: CheckSchema.extend({
    types: z.array(z.string()).optional(),
  }),
  virtualDigital: CheckSchema.extend({
    types: z.array(z.string()).optional(),
  }),
  gwpPromotions: CheckSchema,
  preorders: CheckSchema.extend({
    chargeTiming: z.string().optional(),
  }),
  subscriptions: CheckSchema.extend({
    provider: z.string().optional(),
  }),
  reviews: CheckSchema.extend({
    provider: z.string().optional(),
  }),
  plpFilters: CheckSchema,
  onsiteSearch: CheckSchema,
  takeaway: z.string().optional(),
});

// Checkout section
const CheckoutSectionSchema = z.object({
  flowType: CheckSchema.extend({
    type: z.string().optional(),
  }),
  expressWallets: CheckSchema.extend({
    wallets: z.array(z.string()).optional(),
  }),
  paymentMethods: CheckSchema.extend({
    methods: z.array(z.string()).optional(),
  }),
  giftCards: CheckSchema.extend({
    type: z.string().optional(),
  }),
  fraudHints: CheckSchema,
  taxesDisplay: CheckSchema.extend({
    included: z.boolean().optional(),
    shownAt: z.string().optional(),
  }),
  dutiesDisplay: CheckSchema.extend({
    shown: z.boolean().optional(),
    prepaidOption: z.boolean().optional(),
  }),
  complianceMessaging: CheckSchema,
  takeaway: z.string().optional(),
});

// Shipping section
const ShippingSectionSchema = z.object({
  shippingTiers: CheckSchema.extend({
    domestic: z.array(ShippingTierSchema).optional(),
    international: z.array(ShippingTierSchema).optional(),
  }),
  carriers: CheckSchema.extend({
    carriers: z.array(z.string()).optional(),
  }),
  crossBorder: CheckSchema.extend({
    approach: z.string().optional(),
  }),
  returns: CheckSchema.extend({
    window: z.string().optional(),
    portal: z.boolean().optional(),
    vendor: z.string().optional(),
  }),
  finalSale: CheckSchema.extend({
    categories: z.array(z.string()).optional(),
  }),
  tracking: CheckSchema.extend({
    provider: z.string().optional(),
  }),
  takeaway: z.string().optional(),
});

// Loyalty/CRM section
const LoyaltyCRMSectionSchema = z.object({
  loyaltyProgram: CheckSchema.extend({
    vendor: z.string().optional(),
    earnRules: z.string().optional(),
    burnRules: z.string().optional(),
  }),
  subscriptionsProvider: CheckSchema.extend({
    provider: z.string().optional(),
  }),
  emailSms: CheckSchema.extend({
    vendors: z.array(z.string()).optional(),
  }),
  personalization: CheckSchema.extend({
    tools: z.array(z.string()).optional(),
  }),
  takeaway: z.string().optional(),
});

// Internationalization section
const MarketTestSchema = z.object({
  country: z.string(),
  currency: z.string(),
  currencyBehavior: z.string().optional(),
  pricesIncludeTax: z.boolean().optional(),
  dutiesShown: z.boolean().optional(),
  dutiesPrepaidOption: z.boolean().optional(),
  shippingOptions: z.array(ShippingTierSchema).optional(),
  geoGates: z.string().optional(),
  evidence: z.array(EvidenceSchema).optional(),
});

const InternationalizationSectionSchema = z.object({
  marketsTested: z.array(MarketTestSchema),
  takeaway: z.string().optional(),
});

// Legal section
const LegalSectionSchema = z.object({
  policiesPresent: CheckSchema.extend({
    policies: z.array(z.string()).optional(),
  }),
  cookieConsent: CheckSchema.extend({
    cmp: z.string().optional(),
  }),
  restrictedProducts: CheckSchema,
  takeaway: z.string().optional(),
});

// Business restrictions section
const BusinessRestrictionsSectionSchema = z.object({
  b2bWholesale: CheckSchema,
  marketplacePresence: CheckSchema.extend({
    marketplaces: z.array(z.string()).optional(),
  }),
  dropshippers: CheckSchema,
  takeaway: z.string().optional(),
});

// Integrations section
const IntegrationsSectionSchema = z.object({
  notableApps: CheckSchema.extend({
    apps: z.array(AppInfoSchema).optional(),
  }),
  analytics: CheckSchema.extend({
    tags: z.array(z.string()).optional(),
  }),
  sitemapsRobots: CheckSchema,
  takeaway: z.string().optional(),
});

// Tech risks
const TechRisksSchema = z.object({
  constraints: z.array(z.string()),
  redFlags: z.array(z.string()),
  integrationSurfaces: z.array(z.string()),
  effortEstimate: z.string().optional(),
});

// Crawl summary (from scraper, not LLM)
const CrawlSummarySchema = z.object({
  seedUrl: z.string(),
  domain: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  pagesVisited: z.number(),
  pagesBlocked: z.number(),
  checkoutReached: z.boolean(),
  checkoutStoppedAt: z.string().optional(),
  platformDetected: z.string().optional(),
  headlessDetected: z.boolean().optional(),
  globalEDetected: z.boolean().optional(),
  returngoDetected: z.boolean().optional(),
  errors: z.array(z.object({
    url: z.string(),
    error: z.string(),
    type: z.enum(['timeout', 'blocked', 'auth_required', 'not_found', 'other']),
  })),
  thirdPartiesDetected: z.array(z.string()),
});

// Full assessment
export const WebsiteAssessmentSchema = z.object({
  meta: MetaSchema,
  evidenceLog: EvidenceLogSchema,
  platform: PlatformSectionSchema,
  catalog: CatalogSectionSchema,
  checkout: CheckoutSectionSchema,
  shipping: ShippingSectionSchema,
  loyaltyCrm: LoyaltyCRMSectionSchema,
  internationalization: InternationalizationSectionSchema,
  legal: LegalSectionSchema,
  businessRestrictions: BusinessRestrictionsSectionSchema,
  integrations: IntegrationsSectionSchema,
  techRisks: TechRisksSchema,
  openQuestions: z.array(z.string()),
  nextSteps: z.array(z.string()),
  crawlSummary: CrawlSummarySchema,
});

export type WebsiteAssessment = z.infer<typeof WebsiteAssessmentSchema>;

