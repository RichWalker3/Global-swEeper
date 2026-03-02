/**
 * Policy text extraction - parse key information from FAQ/policy pages
 * Extracts return windows, fees, restrictions, and other WA-critical info
 */

export interface ExtractedPolicy {
  returnWindow?: string; // e.g., "30 days"
  returnFees?: string[]; // e.g., ["$10 Happy Returns", "$15 UPS mailback"]
  freeReturns?: boolean;
  freeExchanges?: boolean;
  finalSaleItems?: string[]; // e.g., ["underwear", "gift cards", "sale items"]
  restockingFee?: string; // e.g., "15%", "$10"
  returnPortal?: string; // e.g., "returnportal.hatchcollection.com"
  returnProvider?: string; // e.g., "Happy Returns", "Loop", "Narvar"
  shippingRestrictions?: string[]; // e.g., ["No international shipping"]
  giftWithPurchase?: boolean;
  priceAdjustmentWindow?: string; // e.g., "7 days"
  exchangePolicy?: string;
  rawExcerpts: Record<string, string>; // Key excerpts by topic
}

export interface CheckoutInfo {
  expressWallets: string[]; // e.g., ["Shop Pay", "PayPal", "Apple Pay", "Google Pay"]
  paymentMethods: string[]; // e.g., ["Visa", "Mastercard", "Amex", "Discover"]
  bnplOptions: string[]; // e.g., ["Afterpay", "Klarna", "Affirm"]
  giftCardOption: boolean;
  shippingOptions: string[]; // e.g., ["Free Shipping", "Standard $7.99", "Express $15.99"]
  taxDisplay?: string; // e.g., "calculated at checkout", "included"
  checkoutType?: string; // e.g., "Shopify Checkout", "one-page", "multi-step"
}

// Return portal patterns to detect
const RETURN_PORTAL_PATTERNS = [
  { pattern: /returnportal\.[a-z0-9-]+\.[a-z]+/gi, provider: null }, // Generic return portal subdomain
  { pattern: /returns\.[a-z0-9-]+\.[a-z]+/gi, provider: null },
  { pattern: /loopreturns\.com/gi, provider: 'Loop Returns' },
  { pattern: /loop\s+returns/gi, provider: 'Loop Returns' },
  { pattern: /narvar\.com/gi, provider: 'Narvar' },
  { pattern: /happyreturns\.com/gi, provider: 'Happy Returns' },
  { pattern: /happy\s+returns/gi, provider: 'Happy Returns' },
  { pattern: /returngo\.ai/gi, provider: 'ReturnGO' },
  { pattern: /returnly\.com/gi, provider: 'Returnly' },
  { pattern: /aftership\.com\/returns/gi, provider: 'AfterShip Returns' },
];

// Express wallet patterns
const EXPRESS_WALLET_PATTERNS = [
  { pattern: /shop\s*pay/gi, name: 'Shop Pay' },
  { pattern: /shopify\s*pay/gi, name: 'Shop Pay' },
  { pattern: /paypal/gi, name: 'PayPal' },
  { pattern: /apple\s*pay/gi, name: 'Apple Pay' },
  { pattern: /google\s*pay/gi, name: 'Google Pay' },
  { pattern: /amazon\s*pay/gi, name: 'Amazon Pay' },
  { pattern: /venmo/gi, name: 'Venmo' },
];

// BNPL patterns
const BNPL_PATTERNS = [
  { pattern: /afterpay/gi, name: 'Afterpay' },
  { pattern: /klarna/gi, name: 'Klarna' },
  { pattern: /affirm/gi, name: 'Affirm' },
  { pattern: /sezzle/gi, name: 'Sezzle' },
  { pattern: /zip\s*pay/gi, name: 'Zip' },
  { pattern: /four\s*interest[- ]free/gi, name: 'BNPL (generic)' },
  { pattern: /pay\s*in\s*4/gi, name: 'BNPL (generic)' },
  { pattern: /buy\s*now[,\s]+pay\s*later/gi, name: 'BNPL (generic)' },
];

/**
 * Extract policy information from page text
 */
export function extractPolicyInfo(text: string, _url?: string): ExtractedPolicy {
  const lowerText = text.toLowerCase();
  const result: ExtractedPolicy = { rawExcerpts: {} };

  // Return window extraction - improved patterns
  // Pattern 1: "30 day return", "30-day return policy", "30 days to return"
  let returnWindowMatch = lowerText.match(/(\d+)[\s-]*(day|calendar day|business day)s?\s*(return|to return|for return|refund)/i);
  // Pattern 2: "return within 30 days", "returns within 30 days"
  if (!returnWindowMatch) {
    returnWindowMatch = lowerText.match(/return[s]?\s*(?:must be made\s*)?within\s*(\d+)\s*(day|calendar day|business day)s?/i);
    if (returnWindowMatch) {
      result.returnWindow = `${returnWindowMatch[1]} days`;
    }
  }
  // Pattern 3: "within 30 days of delivery/purchase/receipt"  
  if (!returnWindowMatch) {
    returnWindowMatch = lowerText.match(/within\s*(\d+)\s*(day|calendar day|business day)s?\s*(of|from)\s*(delivery|purchase|receipt|order)/i);
    if (returnWindowMatch) {
      result.returnWindow = `${returnWindowMatch[1]} days`;
    }
  }
  // Pattern 4: "30 day exchange"
  if (!returnWindowMatch) {
    returnWindowMatch = lowerText.match(/(\d+)[\s-]*(day|calendar day|business day)s?\s*exchange/i);
    if (returnWindowMatch) {
      result.returnWindow = `${returnWindowMatch[1]} days`;
    }
  }
  // If first pattern matched, extract days
  if (returnWindowMatch && !result.returnWindow) {
    const days = returnWindowMatch[1];
    if (days && !isNaN(Number(days))) {
      result.returnWindow = `${days} days`;
    }
  }

  // Return fees extraction
  const fees: string[] = [];
  const feePatterns = [
    /\$(\d+(?:\.\d{2})?)\s*(return|restocking|shipping)\s*(fee|charge)/gi,
    /(return|restocking|shipping)\s*(fee|charge)[:\s]*\$(\d+(?:\.\d{2})?)/gi,
    /(\d+(?:\.\d{2})?)\s*(?:percent|%)\s*(restocking|return)\s*fee/gi,
  ];
  for (const pattern of feePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fee = match[0].slice(0, 100); // Limit length
      if (!fees.includes(fee)) {
        fees.push(fee);
      }
    }
  }
  // Also look for specific fee amounts
  if (lowerText.includes('$10') && lowerText.includes('happy returns')) {
    fees.push('$10 Happy Returns');
  }
  if (lowerText.includes('$15') && (lowerText.includes('ups') || lowerText.includes('mail'))) {
    fees.push('$15 mailback');
  }
  if (fees.length > 0) {
    result.returnFees = fees;
  }

  // Free returns/exchanges
  result.freeReturns = /free\s+return/i.test(text) && !/not?\s+free\s+return/i.test(text);
  result.freeExchanges = /free\s+exchange/i.test(text);

  // Final sale items
  const finalSaleItems: string[] = [];
  if (lowerText.includes('final sale') || lowerText.includes('final-sale')) {
    // Try to extract what's final sale
    if (/underwear\s*(is|are)?\s*final\s*sale/i.test(text) || /final\s*sale.*underwear/i.test(text)) {
      finalSaleItems.push('underwear');
    }
    if (/intimates?\s*(is|are)?\s*final\s*sale/i.test(text)) {
      finalSaleItems.push('intimates');
    }
    if (/gift\s*cards?\s*(is|are)?\s*final\s*sale/i.test(text) || /final\s*sale.*gift\s*card/i.test(text)) {
      finalSaleItems.push('gift cards');
    }
    if (/sale\s*items?\s*(is|are)?\s*final\s*sale/i.test(text) || lowerText.includes('sale items are not eligible')) {
      finalSaleItems.push('sale items');
    }
    if (/swimwear\s*(is|are)?\s*final\s*sale/i.test(text)) {
      finalSaleItems.push('swimwear');
    }
    if (/earrings?\s*(is|are)?\s*final\s*sale/i.test(text)) {
      finalSaleItems.push('earrings');
    }
    // Generic final sale mention
    if (finalSaleItems.length === 0) {
      finalSaleItems.push('items marked final sale');
    }
  }
  if (finalSaleItems.length > 0) {
    result.finalSaleItems = finalSaleItems;
  }

  // Return portal detection
  for (const { pattern, provider } of RETURN_PORTAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.returnPortal = match[0];
      if (provider) {
        result.returnProvider = provider;
      }
      break;
    }
  }

  // Gift with purchase
  result.giftWithPurchase = /gift\s*with\s*purchase/i.test(text) || /gwp/i.test(text) || /free\s*gift/i.test(text);

  // Price adjustment window
  const priceAdjMatch = text.match(/price\s*adjustment[s]?\s*(within|for)?\s*(\d+)\s*day/i);
  if (priceAdjMatch) {
    result.priceAdjustmentWindow = `${priceAdjMatch[2]} days`;
  }

  // Shipping restrictions
  const restrictions: string[] = [];
  if (/unable\s*to\s*(offer\s*)?(ship|shipping)\s*international/i.test(text) 
      || /not\s*(currently\s*)?(ship|shipping)\s*international/i.test(text)
      || /do\s*not\s*ship\s*international/i.test(text)
      || /domestic\s*(only|shipping\s*only)/i.test(text)
      || /u\.?s\.?\s*only/i.test(text)) {
    restrictions.push('No international shipping currently');
  }
  if (/p\.?o\.?\s*box/i.test(text) && /not\s*(ship|deliver)/i.test(text)) {
    restrictions.push('No PO Box shipping');
  }
  if (restrictions.length > 0) {
    result.shippingRestrictions = restrictions;
  }

  // Extract key excerpts for context
  const excerptPatterns: Record<string, RegExp> = {
    returns: /(.{0,100}return.{0,100})/gi,
    shipping: /(.{0,100}shipping.{0,100})/gi,
    exchange: /(.{0,100}exchange.{0,100})/gi,
  };
  for (const [key, pattern] of Object.entries(excerptPatterns)) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // Take first meaningful match
      result.rawExcerpts[key] = matches[0].replace(/\s+/g, ' ').trim().slice(0, 300);
    }
  }

  return result;
}

/**
 * Extract checkout information from checkout page
 */
export function extractCheckoutInfo(html: string, text: string): CheckoutInfo {
  const result: CheckoutInfo = {
    expressWallets: [],
    paymentMethods: [],
    bnplOptions: [],
    giftCardOption: false,
    shippingOptions: [],
  };

  // Express wallets
  for (const { pattern, name } of EXPRESS_WALLET_PATTERNS) {
    if (pattern.test(html) || pattern.test(text)) {
      if (!result.expressWallets.includes(name)) {
        result.expressWallets.push(name);
      }
    }
    // Reset regex lastIndex
    pattern.lastIndex = 0;
  }

  // BNPL options
  for (const { pattern, name } of BNPL_PATTERNS) {
    if (pattern.test(html) || pattern.test(text)) {
      if (!result.bnplOptions.includes(name)) {
        result.bnplOptions.push(name);
      }
    }
    pattern.lastIndex = 0;
  }

  // Gift card option
  result.giftCardOption = /gift\s*card/i.test(text) || /apply\s*gift\s*card/i.test(text);

  // Payment methods (from card icons or text)
  const paymentPatterns = [
    { pattern: /visa/gi, name: 'Visa' },
    { pattern: /mastercard/gi, name: 'Mastercard' },
    { pattern: /amex|american\s*express/gi, name: 'Amex' },
    { pattern: /discover/gi, name: 'Discover' },
    { pattern: /jcb/gi, name: 'JCB' },
    { pattern: /diners/gi, name: 'Diners Club' },
    { pattern: /unionpay/gi, name: 'UnionPay' },
  ];
  for (const { pattern, name } of paymentPatterns) {
    if (pattern.test(html) || pattern.test(text)) {
      if (!result.paymentMethods.includes(name)) {
        result.paymentMethods.push(name);
      }
    }
    pattern.lastIndex = 0;
  }

  // Shipping options (look for shipping rate text)
  const shippingMatches = text.match(/(?:free|standard|express|expedited|overnight|priority|ground)\s*(?:shipping)?[:\s]*(?:\$[\d.]+)?/gi);
  if (shippingMatches) {
    result.shippingOptions = [...new Set(shippingMatches.map(s => s.trim()))].slice(0, 5);
  }

  // Tax display
  if (/tax.*calculated\s*at\s*checkout/i.test(text)) {
    result.taxDisplay = 'calculated at checkout';
  } else if (/tax\s*included/i.test(text) || /incl\.?\s*tax/i.test(text)) {
    result.taxDisplay = 'included';
  }

  // Checkout type detection
  if (/shopify/i.test(html)) {
    result.checkoutType = 'Shopify Checkout';
  }

  return result;
}

/**
 * Merge multiple policy extractions into one
 */
export function mergePolicies(policies: ExtractedPolicy[]): ExtractedPolicy {
  const merged: ExtractedPolicy = { rawExcerpts: {} };
  
  for (const policy of policies) {
    if (policy.returnWindow && !merged.returnWindow) {
      merged.returnWindow = policy.returnWindow;
    }
    if (policy.returnFees && policy.returnFees.length > 0) {
      merged.returnFees = [...(merged.returnFees || []), ...policy.returnFees];
    }
    if (policy.freeReturns) merged.freeReturns = true;
    if (policy.freeExchanges) merged.freeExchanges = true;
    if (policy.finalSaleItems && policy.finalSaleItems.length > 0) {
      merged.finalSaleItems = [...new Set([...(merged.finalSaleItems || []), ...policy.finalSaleItems])];
    }
    if (policy.restockingFee && !merged.restockingFee) {
      merged.restockingFee = policy.restockingFee;
    }
    if (policy.returnPortal && !merged.returnPortal) {
      merged.returnPortal = policy.returnPortal;
    }
    if (policy.returnProvider && !merged.returnProvider) {
      merged.returnProvider = policy.returnProvider;
    }
    if (policy.shippingRestrictions && policy.shippingRestrictions.length > 0) {
      merged.shippingRestrictions = [...new Set([...(merged.shippingRestrictions || []), ...policy.shippingRestrictions])];
    }
    if (policy.giftWithPurchase) merged.giftWithPurchase = true;
    if (policy.priceAdjustmentWindow && !merged.priceAdjustmentWindow) {
      merged.priceAdjustmentWindow = policy.priceAdjustmentWindow;
    }
    // Merge excerpts
    for (const [key, value] of Object.entries(policy.rawExcerpts)) {
      if (!merged.rawExcerpts[key]) {
        merged.rawExcerpts[key] = value;
      }
    }
  }

  // Dedupe return fees
  if (merged.returnFees) {
    merged.returnFees = [...new Set(merged.returnFees)];
  }

  return merged;
}

