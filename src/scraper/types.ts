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
}

export interface ScrapeResult {
  summary: CrawlSummary;
  pages: PageData[];
}

export interface ScrapeOptions {
  maxPages?: number;
  timeout?: number;
  takeScreenshots?: boolean;
  verbose?: boolean;
}
