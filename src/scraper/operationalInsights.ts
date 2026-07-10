export interface BrdRelevantFinding {
  type:
    | 'bot_verification'
    | 'sfcc_endpoint'
    | 'cross_border_provider'
    | 'payment_restriction'
    | 'fulfillment_restriction'
    | 'custom_order'
    | 'promotion_gwp'
    | 'dangerous_goods_asset'
    | 'marketplace_exclusion';
  label: string;
  evidence: string;
  foundOnUrl: string;
  severity: 'info' | 'medium' | 'high';
  brdIds: string[];
  useFor: 'brd_output' | 'coverage_note';
}

interface InsightPattern {
  type: BrdRelevantFinding['type'];
  label: string;
  pattern: RegExp;
  severity: BrdRelevantFinding['severity'];
  brdIds: string[];
  useFor: BrdRelevantFinding['useFor'];
}

const INSIGHT_PATTERNS: InsightPattern[] = [
  {
    type: 'bot_verification',
    label: 'Human verification / bot challenge',
    pattern: /(press\s*&?\s*hold|confirm\s+you\s+are\s+a\s+human|access\s+to\s+this\s+page\s+has\s+been\s+denied|akamai|perimeterx|datadome|cloudflare)/i,
    severity: 'high',
    brdIds: [],
    useFor: 'coverage_note',
  },
  {
    type: 'cross_border_provider',
    label: 'Borderfree endpoint',
    pattern: /Borderfree-[A-Za-z]+|borderfree/i,
    severity: 'medium',
    brdIds: ['BRD-027'],
    useFor: 'brd_output',
  },
  {
    type: 'sfcc_endpoint',
    label: 'SFCC checkout/cart action endpoint',
    pattern: /(Cart-RedirectToShipping|Search-UpdateGrid|Cart-MiniCartShow|Checkout-Begin|ForterValidate-UpdateForterInfo)/i,
    severity: 'info',
    brdIds: ['BRD-027'],
    useFor: 'brd_output',
  },
  {
    type: 'payment_restriction',
    label: 'Split tender restriction',
    pattern: /(multiple\s+card\s+payments?\s+(?:are\s+)?not\s+accepted|split\s+tender|pay\s+with\s+two\s+cards)/i,
    severity: 'high',
    brdIds: ['BRD-017'],
    useFor: 'brd_output',
  },
  {
    type: 'payment_restriction',
    label: 'Foreign-issued card restriction',
    pattern: /(cards?\s+issued\s+by\s+banks?\s+outside\s+the\s+united\s+states\s+(?:are\s+)?not\s+accepted|u\.?s\.?-issued\s+cards?\s+only)/i,
    severity: 'high',
    brdIds: ['BRD-017'],
    useFor: 'brd_output',
  },
  {
    type: 'fulfillment_restriction',
    label: 'BOPIS / mixed fulfillment',
    pattern: /(buy\s+online,\s*pick\s+up\s+in\s+store|pickup\s+in\s+store|pick\s+up\s+in\s+store|bopis|separate\s+transactions?|separate\s+order\s+numbers?)/i,
    severity: 'medium',
    brdIds: ['BRD-006', 'BRD-009'],
    useFor: 'brd_output',
  },
  {
    type: 'custom_order',
    label: 'Custom / made-to-order restriction',
    pattern: /(custom\s+orders?|made\s+to\s+order|production\s+(?:lead\s+time|within)|not\s+eligible\s+for\s+return\s+or\s+exchange)/i,
    severity: 'medium',
    brdIds: ['BRD-022'],
    useFor: 'brd_output',
  },
  {
    type: 'promotion_gwp',
    label: 'Gift-with-purchase / free item',
    pattern: /(gift\s+with\s+purchase|\bGWP\b|free\s+(?:gift|item)|birthday\s+reward|reward\s+code)/i,
    severity: 'medium',
    brdIds: ['BRD-014', 'BRD-024'],
    useFor: 'brd_output',
  },
  {
    type: 'dangerous_goods_asset',
    label: 'SDS / dangerous goods catalog asset',
    pattern: /(safety\s+data\s+sheet|\bSDS\b|\/sds\/|air\s+freshener|home\s+fragrance|wallflowers?|eau\s+de|fragrance\s+mist)/i,
    severity: 'high',
    brdIds: ['BRD-016'],
    useFor: 'brd_output',
  },
  {
    type: 'marketplace_exclusion',
    label: 'Marketplace / third-party seller exclusion',
    pattern: /(third[-\s]?party\s+sellers?|marketplace\s+prices?|instacart|tiktok\s+shop|freight\s+forward(?:er|ing))/i,
    severity: 'medium',
    brdIds: ['BRD-011', 'BRD-017'],
    useFor: 'brd_output',
  },
];

export function detectBrdRelevantFindings(text: string, html: string, url: string): BrdRelevantFinding[] {
  const searchable = `${text}\n${html}`;
  const insights: BrdRelevantFinding[] = [];

  for (const { type, label, pattern, severity, brdIds, useFor } of INSIGHT_PATTERNS) {
    const match = searchable.match(pattern);
    if (!match) continue;
    insights.push({
      type,
      label,
      evidence: extractContext(searchable, match.index ?? 0, match[0].length),
      foundOnUrl: url,
      severity,
      brdIds,
      useFor,
    });
  }

  return insights;
}


function extractContext(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + length + 140);
  return text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 260);
}
