/**
 * Types for the web scraper module
 */

export interface PageData {
  url: string;
  title: string;
  cleanedText: string;
  excerpt: string;
  rawHtml?: string; // For product link extraction
  screenshot?: string;
  matchedCategories: string[];
  keyPhrases: string[];
  networkRequests: NetworkRequest[];
  timestamp: string;
  statusCode?: number; // HTTP status code
  headers?: Record<string, string>; // Response headers
}

export interface NetworkRequest {
  url: string;
  type: string;
  thirdParty?: string; // Detected third-party name if matched
}

export interface CrawlError {
  url: string;
  error: string;
  type: 'timeout' | 'blocked' | 'auth_required' | 'not_found' | 'other';
  /** If blocked, indicates the bot detection system (cloudflare, perimeterx, datadome, etc) */
  blockType?: string;
}

export interface DGFinding {
  keyword: string;
  category: string;
  risk: 'high' | 'medium';
  context: string;
  foundOnUrl: string;
}

// Wappalyzer detected technology
export interface DetectedTechnology {
  name: string;
  confidence: string;
  version: string | null;
  icon: string;
  website: string;
  categories: Array<Record<string, string>>;
}

// Extracted policy information
export interface ExtractedPolicyInfo {
  returnWindow?: string;
  returnFees?: string[];
  freeReturns?: boolean;
  freeExchanges?: boolean;
  finalSaleItems?: string[];
  restockingFee?: string;
  returnPortal?: string;
  returnProvider?: string;
  shippingRestrictions?: string[];
  giftWithPurchase?: boolean;
  priceAdjustmentWindow?: string;
}

// Checkout flow information
export interface CheckoutFlowInfo {
  expressWallets: string[];
  paymentMethods: string[];
  bnplOptions: string[];
  giftCardOption: boolean;
  shippingOptions: string[];
  taxDisplay?: string;
  checkoutType?: string;
}

// Catalog features detection
export interface CatalogFeaturesInfo {
  // Bundles
  bundlesDetected: boolean;
  bundleEvidence: string[];
  
  // Customizable products
  customizableProducts: boolean;
  customizationTypes: string[];
  
  // Virtual/Digital products (NOT gift cards)
  virtualProducts: boolean;
  virtualProductTypes: string[];
  
  // Gift Cards (separate category)
  giftCardsDetected: boolean;
  giftCardTypes: string[];
  
  // Subscriptions
  subscriptionsDetected: boolean;
  subscriptionProvider?: string;
  
  // Pre-orders
  preOrdersDetected: boolean;
  
  // GWP
  gwpDetected: boolean;
}

// Loyalty program info
export interface LoyaltyProgramInfo {
  detected: boolean;
  programName?: string;
  provider?: string;
  evidence: string[];
}

// Localization/Internationalization info
export interface LocalizationDetected {
  countrySelector: boolean;
  multiLanguage: boolean;
  languagesDetected: string[];
  multiCurrency: boolean;
  currenciesDetected: string[];
}

// Marketplace presence
export interface MarketplacePresence {
  detected: boolean;
  marketplaces: string[];
}

export interface CrawlSummary {
  seedUrl: string;
  domain: string;
  startedAt: string;
  completedAt: string;
  pagesVisited: number;
  pagesBlocked: number;
  checkoutReached: boolean;
  checkoutStoppedAt?: string;
  platformDetected?: string;
  headlessDetected?: boolean;
  globalEDetected?: boolean;
  returngoDetected?: boolean;
  shopPayDetected?: boolean;
  errors: CrawlError[];
  thirdPartiesDetected: string[]; // From pattern matching
  technologies: DetectedTechnology[]; // From Wappalyzer
  redFlags: string[];
  dangerousGoods: DGFinding[];
  b2bIndicators: string[];
  productPagesScraped: number;
  // Extracted policy and checkout info
  policyInfo?: ExtractedPolicyInfo;
  checkoutInfo?: CheckoutFlowInfo;
  // Catalog features
  catalogFeatures?: CatalogFeaturesInfo;
  // Loyalty program
  loyaltyProgram?: LoyaltyProgramInfo;
  // Localization
  localization?: LocalizationDetected;
  // Marketplace presence
  marketplacePresence?: MarketplacePresence;
}

export interface ScrapeResult {
  summary: CrawlSummary;
  pages: PageData[];
}

export interface ScrapeProgress {
  phase: 'init' | 'navigating' | 'scraping' | 'checkout' | 'analyzing';
  message: string;
  current?: number;
  total?: number;
  url?: string;
}

export interface ScrapeOptions {
  maxPages?: number;
  timeout?: number;
  scrapeTimeout?: number; // Overall timeout for entire scrape (default: 120000ms = 2 min)
  takeScreenshots?: boolean;
  verbose?: boolean;
  onProgress?: (progress: ScrapeProgress) => void;
}
