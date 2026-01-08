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
 * Filter results to only include e-commerce relevant technologies
 */
export function filterEcommerceRelevant(results: WappalyzerResult[]): WappalyzerResult[] {
  const relevantCategories = new Set([
    'Ecommerce', 'Payment processors', 'Cart abandonment', 
    'Loyalty & rewards', 'Live chat', 'Marketing automation',
    'Email', 'Analytics', 'Tag managers', 'A/B Testing',
    'Personalisation', 'Customer data platform', 'Reviews',
    'Retargeting', 'Affiliate programs', 'Buy now pay later',
    'Shipping carriers', 'Returns management', 'Subscriptions',
    'CMS', 'JavaScript frameworks', 'UI frameworks'
  ]);

  return results.filter(r => 
    r.categories.some(cat => relevantCategories.has(cat.name))
  );
}

