import { formatBrdMatrixMarkdown, formatConfluenceNarrative, formatJiraUpdatePlan, formatOpenQuestions } from './formatter.js';
import { buildBrdRows } from './mapper.js';
import type { BrdDraftInput, BrdDraftResult } from './types.js';

export function generateBrdDraft(input: BrdDraftInput): BrdDraftResult {
  const rows = buildBrdRows(input);
  const result: BrdDraftResult = {
    merchantName: input.merchantName?.trim() || inferMerchantName(input) || 'Unknown merchant',
    parent: input.parent,
    rows,
    outputs: {
      matrixMarkdown: '',
      jiraUpdatePlan: '',
      confluenceNarrative: '',
      openQuestions: '',
    },
  };

  result.outputs = {
    matrixMarkdown: formatBrdMatrixMarkdown(rows),
    jiraUpdatePlan: formatJiraUpdatePlan(result),
    confluenceNarrative: formatConfluenceNarrative(result),
    openQuestions: formatOpenQuestions(rows),
  };

  return result;
}

function inferMerchantName(input: BrdDraftInput): string | undefined {
  const raw = input.websiteAssessmentJson;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const meta = (raw as { meta?: { brand?: unknown } }).meta;
  return typeof meta?.brand === 'string' ? meta.brand : undefined;
}
