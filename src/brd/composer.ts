import { buildBrdRows } from './mapper.js';
import type { BrdDraftInput, BrdMatrixRow, BrdParentContext, BrdReviewResult } from './types.js';

export function composeBrdReview(input: BrdDraftInput & { parent: BrdParentContext }): BrdReviewResult {
  const manualMode = isManualBrdMode(input);
  const matrixRows = buildBrdRows(input);
  const subtaskByKey = new Map(input.parent.subtasks.map((subtask) => [subtask.key, subtask]));
  const rows = matrixRows
    .filter((row): row is BrdMatrixRow & { jiraKey: string } => Boolean(row.jiraKey))
    .map((row) => {
      const subtask = subtaskByKey.get(row.jiraKey);
      const existingText = subtask?.seOutputText || '';
      const jiraDescriptionText = subtask?.descriptionText || '';
      const currentStatus = subtask?.status || '';
      const conflictNote = manualMode ? undefined : buildConflictNote(existingText, row);
      const finalText = manualMode ? existingText : buildFinalText(existingText, row, conflictNote);
      const statusAction = manualMode ? undefined : row.recommendedStatusAction;

      return {
        ...row,
        jiraKey: row.jiraKey,
        existingText,
        jiraDescriptionText,
        currentStatus,
        statusAction,
        conflictNote,
        finalText,
      };
    });

  return {
    merchantName: input.merchantName?.trim() || 'Unknown merchant',
    parent: input.parent,
    rows,
  };
}

function isManualBrdMode(input: BrdDraftInput): boolean {
  return !hasText(input.websiteAssessmentMarkdown)
    && !hasText(input.additionalNotes)
    && !input.websiteAssessmentJson;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildFinalText(existingText: string, row: BrdMatrixRow, conflictNote?: string): string {
  if (row.llmSeOutputText) {
    return row.llmSeOutputText;
  }

  const parts = [
    `${row.requirementId} - ${row.requirement}`,
    '',
    `Proposed scope: ${row.scopeValue}`,
    `Confidence: ${row.confidence}`,
  ];

  const existingSummary = summarizeExistingText(existingText);
  if (existingSummary) {
    parts.push('', `Existing SE scoping output value: ${existingSummary}`);
  }

  if (row.evidence.length > 0) {
    parts.push('', 'WA evidence:');
    for (const evidence of row.evidence.slice(0, 4)) {
      parts.push(`- ${evidence.url ? `${evidence.detail} (${evidence.url})` : evidence.detail}`);
    }
  }

  if (conflictNote) {
    parts.push('', `Scope note: ${conflictNote}`);
  }

  if (row.openQuestions.length > 0) {
    parts.push('', 'Open questions:');
    for (const question of row.openQuestions) {
      parts.push(`- ${question}`);
    }
  }

  return parts.join('\n');
}

function buildConflictNote(existingText: string, row: BrdMatrixRow): string | undefined {
  const existing = existingText.toLowerCase();
  const evidenceText = row.evidence.map((item) => `${item.source} ${item.detail}`).join(' ').toLowerCase();
  const existingSaysNo = /\b(no|none|not interested|out of scope|oos|not applicable)\b/.test(existing);
  const waHasSignal = row.scopeValue === 'In Scope' || row.scopeValue === 'Unconfirmed';
  const hasLegacySignal = /\b(old|legacy|script|code|snippet)\b/.test(evidenceText)
    || /\b(old|legacy|script|code|snippet)\b/.test(row.openQuestions.join(' ').toLowerCase())
    || (row.requirementId === 'BRD-014' && /\b(smile\.io|loyalty script)\b/.test(evidenceText));

  if (existingSaysNo && hasLegacySignal) {
    if (row.requirementId === 'BRD-014') {
      return `Existing SE scoping output content indicates no active loyalty program. WA found old loyalty script/code signals, but no confirmed active loyalty UI. Confirm whether this is inactive legacy code or planned future scope.`;
    }
    return `Existing SE scoping output content indicates no active ${row.requirement.toLowerCase()}. WA found legacy/code-level signals, but no confirmed active UI. Confirm whether this is inactive legacy code or planned future scope.`;
  }

  if (existingSaysNo && waHasSignal) {
    return `Existing SE scoping output content indicates no ${row.requirement.toLowerCase()}, but WA found possible signals. Confirm whether this is active scope, legacy behavior, or out of scope.`;
  }

  if (!existingSaysNo && row.scopeValue === 'No signal found') {
    return `No direct WA evidence was found. Preserve existing SE scoping output value unless the merchant confirms a change.`;
  }

  return undefined;
}

function summarizeExistingText(existingText: string): string {
  return existingText
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}
