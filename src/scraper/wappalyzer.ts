/**
 * Wappalyzer integration for automatic technology detection
 * Uses simple-wappalyzer@1.1.70 (older version that works with CommonJS)
 */

// Dynamic import wrapper for simple-wappalyzer
let wappalyzerFn: ((opts: WappalyzerInput) => Promise<WappalyzerResult[]>) | null = null;

export interface WappalyzerInput {
  url: string;
  html: string;
  headers?: Record<string, string>;
}

export interface WappalyzerResult {
  name: string;
  description?: string;
  slug: string;
  categories: Array<{
    id: number;
    slug: string;
    name: string;
  }>;
  confidence: number;
  version: string;
  icon: string;
  website: string;
}

/**
 * Initialize Wappalyzer (call once at startup)
 */
export async function initWappalyzer(): Promise<boolean> {
  try {
    // Use dynamic require for CommonJS module
    const wap = await import('simple-wappalyzer');
    wappalyzerFn = wap.default || wap;
    return true;
  } catch (error) {
    console.warn('Failed to load Wappalyzer:', error);
    return false;
  }
}

/**
 * Analyze a page for technologies
 */
export async function analyzeWithWappalyzer(
  url: string, 
  html: string, 
  headers?: Record<string, string>
): Promise<WappalyzerResult[]> {
  if (!wappalyzerFn) {
    // Try to initialize if not already done
    const success = await initWappalyzer();
    if (!success || !wappalyzerFn) {
      return [];
    }
  }

  try {
    const results = await wappalyzerFn({ url, html, headers });
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.warn('Wappalyzer analysis failed:', error);
    return [];
  }
}

/**
 * Get category names from Wappalyzer results
 */
export function getCategoryNames(results: WappalyzerResult[]): string[] {
  const categories = new Set<string>();
  for (const result of results) {
    for (const cat of result.categories) {
      categories.add(cat.name);
    }
  }
  return Array.from(categories);
}

/**
 * Technologies to exclude - too generic/common to be useful
 */
const EXCLUDED_TECHNOLOGIES = new Set([
  // Infrastructure - everyone uses these
  'cloudflare', 'fastly', 'akamai', 'amazon cloudfront', 'google cloud cdn',
  'hsts', 'http/2', 'http/3', 
  
  // Generic JS libraries - not useful for WA
  'jquery', 'lodash', 'underscore.js', 'moment.js', 'axios',
  'webpack', 'vite', 'parcel', 'rollup',
  
  // Generic UI libraries
  'bootstrap', 'tailwind css', 'font awesome', 'google fonts',
  'slick', 'swiper', 'owl carousel',
  
  // Security basics
  'ssl', 'tls', 'lets encrypt',
  
  // Tracking pixels everyone has
  'facebook pixel', 'google tag manager', 'google analytics',
  'meta pixel', 'pinterest tag', 'tiktok pixel',
]);

/**
 * Filter results to only include e-commerce relevant technologies
 * Excludes generic/common technologies that aren't useful for WAs
 */
export function filterEcommerceRelevant(results: WappalyzerResult[]): WappalyzerResult[] {
  return results.filter(r => {
    // Exclude by name (case-insensitive)
    if (EXCLUDED_TECHNOLOGIES.has(r.name.toLowerCase())) {
      return false;
    }
    
    // Keep technologies in relevant categories
    const relevantCategories = new Set([
      'Ecommerce', 'Payment processors', 'Cart abandonment', 
      'Loyalty & rewards', 'Live chat', 'Marketing automation',
      'Email', 'Tag managers', 'A/B Testing',
      'Personalisation', 'Customer data platform', 'Reviews',
      'Retargeting', 'Affiliate programs', 'Buy now pay later',
      'Shipping carriers', 'Returns management', 'Subscriptions',
    ]);
    
    return r.categories.some(cat => relevantCategories.has(cat.name));
  });
}

