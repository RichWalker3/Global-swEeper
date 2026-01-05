/**
 * Types for the web scraper module
 */

export interface PageData {
  url: string;
  title: string;
  cleanedText: string;
  excerpt: string;
  screenshot?: string;
  matchedCategories: string[];
  keyPhrases: string[];
  networkRequests: NetworkRequest[];
  timestamp: string;
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
  errors: CrawlError[];
  thirdPartiesDetected: string[];
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

