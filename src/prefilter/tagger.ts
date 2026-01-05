/**
 * Page tagger - assigns categories based on content keywords
 */

export interface CategoryPattern {
  category: string;
  keywords: string[];
}

export const CATEGORY_PATTERNS: CategoryPattern[] = [
  {
    category: 'shipping',
    keywords: [
      'shipping', 'delivery', 'carriers', 'transit time', 'ships within',
      'free shipping', 'shipping policy', 'shipping rates', 'estimated delivery',
      'usps', 'ups', 'fedex', 'dhl', 'standard shipping', 'express shipping',
      'overnight', 'next day', 'business days',
    ],
  },
  {
    category: 'returns',
    keywords: [
      'return', 'refund', 'exchange', 'final sale', 'non-returnable',
      'return policy', 'money back', 'store credit', 'restocking fee',
      'return window', 'days to return', 'free returns', 'return shipping',
    ],
  },
  {
    category: 'duties_taxes',
    keywords: [
      'duties', 'customs', 'import', 'vat', 'ddp', 'ddu', 'tax included',
      'tax excluded', 'duties and taxes', 'import fees', 'customs fees',
      'landed cost',
    ],
  },
  {
    category: 'subscriptions',
    keywords: [
      'subscribe', 'subscription', 'recurring', 'auto-ship', 'frequency',
      'subscribe & save', 'monthly', 'weekly', 'every 2 weeks', 'cancel anytime',
      'subscription box', 'recurring order',
    ],
  },
  {
    category: 'loyalty',
    keywords: [
      'rewards', 'points', 'loyalty', 'earn', 'redeem', 'loyalty program',
      'reward points', 'vip', 'member', 'membership', 'tier', 'status',
    ],
  },
  {
    category: 'payments',
    keywords: [
      'payment', 'credit card', 'klarna', 'afterpay', 'apple pay', 'shop pay',
      'google pay', 'paypal', 'affirm', 'buy now pay later', 'bnpl', 'installments',
      'pay in 4', 'split payments',
    ],
  },
  {
    category: 'international',
    keywords: [
      'international', 'worldwide', 'global', 'countries we ship', 'ship internationally',
      'international orders', 'outside us', 'outside usa', 'foreign', 'overseas',
      'euro', 'gbp', 'cad', 'aud', 'currency',
    ],
  },
  {
    category: 'b2b',
    keywords: [
      'wholesale', 'trade', 'business account', 'bulk', 'b2b', 'reseller',
      'trade program', 'wholesale pricing', 'bulk order', 'corporate',
    ],
  },
  {
    category: 'gift_cards',
    keywords: [
      'gift card', 'e-gift', 'gift certificate', 'gift voucher', 'digital gift',
      'gift code', 'store credit',
    ],
  },
  {
    category: 'faq',
    keywords: [
      'faq', 'frequently asked', 'questions', 'help', 'support', 'how do i',
      'common questions',
    ],
  },
  {
    category: 'terms',
    keywords: [
      'terms of service', 'terms and conditions', 'terms of use', 'legal',
      'agreement', 'user agreement',
    ],
  },
  {
    category: 'privacy',
    keywords: [
      'privacy policy', 'personal data', 'gdpr', 'cookies', 'cookie policy',
      'data protection', 'privacy notice',
    ],
  },
  {
    category: 'pdp',
    keywords: [], // Detected by URL pattern
  },
  {
    category: 'checkout',
    keywords: [], // Detected by URL pattern
  },
];

interface TagResult {
  categories: string[];
  keyPhrases: string[];
}

/**
 * Tag a page with categories based on its content and URL
 */
export function tagPage(text: string, url: string, title: string): TagResult {
  const categories: string[] = [];
  const keyPhrases: string[] = [];
  const lowerText = text.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerUrl = url.toLowerCase();

  // URL-based detection
  if (lowerUrl.includes('/products/') || lowerUrl.includes('/p/')) {
    categories.push('pdp');
  }
  if (lowerUrl.includes('/checkout') || lowerUrl.includes('/cart')) {
    categories.push('checkout');
  }
  if (lowerUrl.includes('/policies/') || lowerUrl.includes('/pages/')) {
    // Will be further classified below
  }

  // Keyword-based detection
  for (const { category, keywords } of CATEGORY_PATTERNS) {
    if (keywords.length === 0) continue; // Skip URL-only categories
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerText.includes(lowerKeyword) || lowerTitle.includes(lowerKeyword)) {
        if (!categories.includes(category)) {
          categories.push(category);
        }
        // Track which keywords matched
        if (!keyPhrases.includes(keyword)) {
          keyPhrases.push(keyword);
        }
      }
    }
  }

  return { categories, keyPhrases };
}

