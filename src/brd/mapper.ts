import { WebsiteAssessmentSchema, type WebsiteAssessment } from '../schema/assessment.js';
import type { Check, Evidence } from '../schema/common.js';
import { BRD_REQUIREMENTS } from './requirements.js';
import type {
  BrdDraftInput,
  BrdEvidence,
  BrdMatrixRow,
  BrdParentContext,
  BrdPhaseAction,
  BrdScopeValue,
  BrdStatusAction,
  RequirementSignal,
  RequirementSignalMap,
} from './types.js';

const REQUIREMENT_ALIASES: Record<string, string[]> = {
  'BRD-001': ['hub', 'entity', 'entities', 'market', 'lane'],
  'BRD-002': ['3pl', 'shipping platform', 'fulfillment platform', 'warehouse'],
  'BRD-003': ['carrier', 'outbound', 'dhl', 'fedex', 'ups', 'usps'],
  'BRD-004': ['inbound', 'return carrier', 'bonded warehouse'],
  'BRD-005': ['bonded warehouse', 'ship from bond'],
  'BRD-006': ['dropship', 'drop ship', 'multi-node', '3p fulfillment', 'amazon fulfillment'],
  'BRD-007': ['3b2c', 'local entity', 'commercial import'],
  'BRD-008': ['collection point', 'pudo', 'pickup point', 'pick up point'],
  'BRD-009': ['bopis', 'ship to store', 'store pickup', 'shipping to shop'],
  'BRD-010': ['fulfilment process', 'fulfillment process', 'api vs admin', 'admin'],
  'BRD-011': ['marketplace', 'amazon', 'ebay', 'walmart marketplace'],
  'BRD-012': ['b2b', 'wholesale', 'trade account'],
  'BRD-013': ['subscription', 'recharge', 'recurring'],
  'BRD-014': ['loyalty', 'reward', 'smile.io', 'loyaltylion', 'points'],
  'BRD-015': ['gift card', 'gift cards'],
  'BRD-016': ['dangerous goods', 'fragrance', 'perfume', 'aerosol', 'lithium', 'flammable'],
  'BRD-017': ['restriction', 'restricted', 'final sale', 'non-returnable', 'compliance'],
  'BRD-018': ['high value', 'high-value', '$1500', 'jewelry', 'fine jewelry'],
  'BRD-019': ['digital', 'virtual', 'download', 'gaming', 'membership'],
  'BRD-020': ['cites', 'endangered', 'exotic leather'],
  'BRD-021': ['ugly freight', 'oversized', 'heavy item', 'not standard size'],
  'BRD-022': ['custom', 'customized', 'customised', 'personalized', 'personalised', 'engraving'],
  'BRD-023': ['bundle', 'kit', 'parent-child', 'mix-and-match'],
  'BRD-024': ['free product', 'gwp', 'gift with purchase', 'bogo'],
  'BRD-025': ['pre-order', 'preorder', 'made to order', 'lead time'],
  'BRD-026': ['mobile app', 'app store', 'webview'],
  'BRD-027': ['storefront', 'domain', 'locale', 'currency', 'language'],
  'BRD-028': ['headless', 'next.js', 'hydrogen', 'gatsby', 'nuxt'],
  'BRD-029': ['flash sale', 'raffle', 'drop model'],
  'BRD-030': ['returns platform', 'return portal', 'returngo', 'loop', 'narvar', 'rms'],
};

export function buildBrdRows(input: BrdDraftInput): BrdMatrixRow[] {
  const assessment = parseAssessment(input.websiteAssessmentJson);
  const markdown = input.websiteAssessmentMarkdown || '';
  const llmBrdOutputs = parseLlmBrdOutputs([markdown, input.additionalNotes || ''].join('\n'));
  const signals = mergeSignals(
    assessment ? signalsFromAssessment(assessment) : {},
    signalsFromMarkdown(markdown),
    input.additionalNotes ? signalsFromMarkdown(input.additionalNotes) : {}
  );
  const subtaskByRequirement = mapSubtasksToRequirements(input.parent);

  return BRD_REQUIREMENTS.map((requirement) => {
    const signal = signals[requirement.id] || defaultSignal(requirement.id);
    const jiraKey = subtaskByRequirement.get(requirement.id)?.key;
    const llmOutput = llmBrdOutputs.get(requirement.id);

    return {
      requirementId: requirement.id,
      category: requirement.category,
      requirement: requirement.requirement,
      gate: requirement.gate,
      jiraKey,
      hubspotField: requirement.hubspotField,
      scopeValue: signal.scopeValue,
      confidence: signal.confidence,
      evidence: signal.evidence,
      openQuestions: signal.openQuestions,
      proposedJiraText: buildProposedJiraText(requirement.id, signal),
      llmSeOutputText: llmOutput?.seOutputText,
      recommendedStatusAction: llmOutput?.statusAction,
      recommendedPhaseAction: llmOutput?.phaseAction ?? inferPhaseFromScope(signal.scopeValue, llmOutput?.statusAction),
    };
  });
}

interface LlmBrdOutput {
  statusAction?: BrdStatusAction;
  phaseAction?: BrdPhaseAction;
  seOutputText?: string;
}

function parseLlmBrdOutputs(markdown: string): Map<string, LlmBrdOutput> {
  const outputs = new Map<string, LlmBrdOutput>();
  if (!markdown.trim()) return outputs;

  const section = extractBrdOutputSection(markdown);
  const source = section || markdown;
  const linePattern = /(?:^|\n)\s*(?:[-*]\s*)?(BRD-\d{3})\s*\|\s*([^|\n]+)\|\s*Status:\s*(Done|Canceled|Cancelled)\s*\|\s*SE Output:\s*([^\n]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(source)) !== null) {
    const id = match[1].toUpperCase();
    const rawStatus = match[3].trim().toLowerCase();
    const seOutputText = match[4].trim();

    if (rawStatus === 'done') {
      outputs.set(id, { statusAction: 'done', phaseAction: 'in_scope', seOutputText });
      continue;
    }

    // Legacy Canceled lines: do not transition Jira status; set Phase Out Of Scope instead.
    outputs.set(id, {
      phaseAction: 'out_of_scope',
      seOutputText: isNoEvidenceSeOutput(seOutputText) ? undefined : seOutputText,
    });
  }

  return outputs;
}

function isNoEvidenceSeOutput(text: string): boolean {
  return /^no wa evidence found\.?$/i.test(text.trim());
}

function inferPhaseFromScope(
  scopeValue: BrdScopeValue,
  statusAction?: BrdStatusAction
): BrdPhaseAction | undefined {
  // Explicit Done from WA BRD Output wins over keyword-based "No signal found".
  if (statusAction === 'done') return 'in_scope';
  if (scopeValue === 'Future') return 'future';
  if (scopeValue === 'Out Of Scope' || scopeValue === 'No signal found') return 'out_of_scope';
  if (scopeValue === 'In Scope') return 'in_scope';
  return undefined;
}

function extractBrdOutputSection(markdown: string): string | undefined {
  const sectionMatch = markdown.match(/(?:^|\n)##\s+BRD Output for Sweep\s*\n([\s\S]*?)(?=\n##\s+|\s*$)/i);
  return sectionMatch?.[1];
}

function parseAssessment(raw: unknown): WebsiteAssessment | undefined {
  if (!raw) return undefined;
  const parsed = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  const result = WebsiteAssessmentSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function mapSubtasksToRequirements(parent?: BrdParentContext): Map<string, { key: string }> {
  const map = new Map<string, { key: string }>();
  for (const subtask of parent?.subtasks || []) {
    const match = subtask.summary.match(/\bBRD[-\s]?0?(\d{1,3})\b/i);
    if (match) {
      map.set(`BRD-${match[1].padStart(3, '0')}`, { key: subtask.key });
    }
  }
  return map;
}

function signalsFromAssessment(assessment: WebsiteAssessment): RequirementSignalMap {
  const signals: RequirementSignalMap = {};

  addCheckSignal(signals, 'BRD-002', assessment.shipping.crossBorder, 'Shipping cross-border approach');
  addCheckSignal(signals, 'BRD-003', assessment.shipping.carriers, 'Visible outbound carriers');
  addCheckSignal(signals, 'BRD-006', assessment.businessRestrictions.dropshippers, 'Dropshippers / 3P fulfillment');
  addCheckSignal(signals, 'BRD-011', assessment.businessRestrictions.marketplacePresence, 'Marketplace presence');
  addCheckSignal(signals, 'BRD-012', assessment.businessRestrictions.b2bWholesale, 'B2B / wholesale flows');
  addCheckSignal(signals, 'BRD-013', assessment.catalog.subscriptions, 'Subscriptions on PDP or cart');
  addCheckSignal(signals, 'BRD-014', assessment.loyaltyCrm.loyaltyProgram, 'Loyalty / rewards program');
  addCheckSignal(signals, 'BRD-015', assessment.checkout.giftCards, 'Gift cards at checkout');
  addCheckSignal(signals, 'BRD-016', assessment.catalog.productTypes, 'Dangerous goods / difficult products');
  addCheckSignal(signals, 'BRD-017', assessment.legal.restrictedProducts, 'Restricted products or disclaimers');
  addCheckSignal(signals, 'BRD-019', assessment.catalog.virtualDigital, 'Virtual / digital products');
  addCheckSignal(signals, 'BRD-022', assessment.catalog.customization, 'Customized / personalized products');
  addCheckSignal(signals, 'BRD-023', assessment.catalog.bundles, 'Bundles / kits');
  addCheckSignal(signals, 'BRD-024', assessment.catalog.gwpPromotions, 'GWP / free products');
  addCheckSignal(signals, 'BRD-025', assessment.catalog.preorders, 'Pre-orders');
  addCheckSignal(signals, 'BRD-027', assessment.platform.domainStrategy, 'Domain and storefront setup');
  addCheckSignal(signals, 'BRD-028', assessment.platform.headless, 'Headless / frontend architecture');
  addCheckSignal(signals, 'BRD-030', assessment.shipping.returns, 'Returns and exchanges');

  if (assessment.platform.mobileExperience.status !== 'absent') {
    addCheckSignal(signals, 'BRD-026', assessment.platform.mobileExperience, 'Mobile experience');
  }

  return signals;
}

function addCheckSignal(
  signals: RequirementSignalMap,
  requirementId: string,
  check: Check,
  source: string
): void {
  const evidence = evidenceFromCheck(source, check);
  const scopeValue = scopeFromStatus(check.status);
  signals[requirementId] = {
    scopeValue,
    confidence: check.status === 'verified' ? 'high' : 'medium',
    evidence,
    openQuestions: check.status === 'unconfirmed'
      ? [`Confirm ${source.toLowerCase()} with merchant.`]
      : [],
  };
}

function evidenceFromCheck(source: string, check: Check): BrdEvidence[] {
  const evidence = check.evidence?.map((item: Evidence) => ({
    source,
    detail: item.quote || check.notes || 'Evidence captured in WA.',
    url: item.url,
  })) || [];

  if (evidence.length > 0) return evidence;
  if (check.notes) return [{ source, detail: check.notes }];
  return [{ source, detail: `${statusLabel(check.status)} in Website Assessment.` }];
}

function scopeFromStatus(status: Check['status']): BrdScopeValue {
  if (status === 'verified') return 'In Scope';
  if (status === 'absent') return 'No signal found';
  return 'Unconfirmed';
}

function statusLabel(status: Check['status']): string {
  if (status === 'verified') return 'Verified';
  if (status === 'absent') return 'Absent';
  return 'Unconfirmed';
}

function signalsFromMarkdown(markdown: string): RequirementSignalMap {
  const text = markdown.toLowerCase();
  const signals: RequirementSignalMap = {};
  if (!text.trim()) return signals;

  for (const requirement of BRD_REQUIREMENTS) {
    const aliases = REQUIREMENT_ALIASES[requirement.id] || [];
    const matches = aliases.filter((alias) => text.includes(alias));
    if (matches.length === 0) continue;

    signals[requirement.id] = {
      scopeValue: hasNegativeContext(text, matches) ? 'No signal found' : 'Unconfirmed',
      confidence: matches.length > 1 ? 'medium' : 'low',
      evidence: [{
        source: 'WA text',
        detail: `Matched BRD signals: ${matches.join(', ')}`,
      }],
      openQuestions: [`Confirm ${requirement.requirement.toLowerCase()} scope with merchant.`],
    };
  }

  return signals;
}

function hasNegativeContext(text: string, matches: string[]): boolean {
  return matches.some((match) => {
    const index = text.indexOf(match);
    const before = text.slice(Math.max(0, index - 80), index);
    return /\b(no|not found|absent|none|without)\b/.test(before);
  });
}

function mergeSignals(...maps: RequirementSignalMap[]): RequirementSignalMap {
  const merged: RequirementSignalMap = {};
  for (const map of maps) {
    for (const [id, signal] of Object.entries(map)) {
      if (!signal) continue;
      const existing = merged[id];
      if (!existing || confidenceScore(signal.confidence) > confidenceScore(existing.confidence)) {
        merged[id] = signal;
      } else if (existing) {
        existing.evidence.push(...signal.evidence);
        existing.openQuestions.push(...signal.openQuestions);
      }
    }
  }
  return merged;
}

function confidenceScore(confidence: RequirementSignal['confidence']): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

function defaultSignal(requirementId: string): RequirementSignal {
  return {
    scopeValue: 'No signal found',
    confidence: 'low',
    evidence: [{
      source: 'WA',
      detail: 'No direct WA evidence mapped to this BRD item.',
    }],
    openQuestions: [`Confirm whether ${requirementId} applies to this merchant.`],
  };
}

function buildProposedJiraText(requirementId: string, signal: RequirementSignal): string {
  const evidence = signal.evidence
    .map((item) => item.url ? `${item.source}: ${item.detail} (${item.url})` : `${item.source}: ${item.detail}`)
    .join('\n');
  const questions = signal.openQuestions.length
    ? signal.openQuestions.map((question) => `- ${question}`).join('\n')
    : '- None';

  return [
    `${requirementId} proposed scope: ${signal.scopeValue}`,
    `Confidence: ${signal.confidence}`,
    '',
    'Evidence:',
    evidence,
    '',
    'Open questions:',
    questions,
  ].join('\n');
}
