import { buildBrdRows } from './mapper.js';
import { isHubspotSalesOnlyBrd } from './requirements.js';
import type {
  BrdDraftInput,
  BrdMatrixRow,
  BrdParentContext,
  BrdPhaseAction,
  BrdReviewResult,
  BrdStatusAction,
} from './types.js';

export const NO_EVIDENCE_SE_OUTPUT = 'Sweep found no evidence for this BRD';
export const CONFIRM_WITH_SALES_PREFIX = 'Confirm with Sales';

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
      const currentPhase = subtask?.phaseText || '';

      if (manualMode) {
        return {
          ...row,
          jiraKey: row.jiraKey,
          existingText,
          jiraDescriptionText,
          currentStatus,
          currentPhase,
          statusAction: undefined,
          phaseAction: undefined,
          conflictNote: undefined,
          finalText: existingText,
        };
      }

      const hasFinding = waHasEvidence(row);
      const hubspotPrimary = isHubspotSalesOnlyBrd(row.requirementId);
      const conflictNote = buildConflictNote(existingText, row);
      const finalText = buildFinalText(existingText, row, conflictNote);

      // HubSpot/Sales-primary: if WA found nothing, write the short note but leave status/phase alone.
      // If WA found something, apply normal Done / Phase recommendations.
      const statusAction = hasFinding ? row.recommendedStatusAction : undefined;
      const phaseAction = hasFinding
        ? row.recommendedPhaseAction ?? recommendedPhaseAction(row, statusAction) ?? phaseActionFromJiraPhase(currentPhase)
        : hubspotPrimary
          ? undefined
          : row.recommendedPhaseAction ?? recommendedPhaseAction(row, statusAction) ?? phaseActionFromJiraPhase(currentPhase);

      return {
        ...row,
        jiraKey: row.jiraKey,
        existingText,
        jiraDescriptionText,
        currentStatus,
        currentPhase,
        statusAction,
        phaseAction,
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
  const hubspotConflict = Boolean(conflictNote) || hasHubspotContradiction(existingText, row);
  const body = resolveSeOutputBody(row);

  if (hubspotConflict) {
    return `${CONFIRM_WITH_SALES_PREFIX}\n\n${body}`;
  }

  return body;
}

function resolveSeOutputBody(row: BrdMatrixRow): string {
  if (row.llmSeOutputText?.trim() && !isNoEvidencePhrase(row.llmSeOutputText)) {
    return row.llmSeOutputText.trim();
  }

  if (!waHasEvidence(row) || row.recommendedPhaseAction === 'out_of_scope' || isNoSignalRow(row)) {
    return NO_EVIDENCE_SE_OUTPUT;
  }

  const evidenceLines = row.evidence
    .filter((item) => !isPlaceholderEvidence(item.detail))
    .slice(0, 3)
    .map((item) => (item.url ? `${item.detail} (${item.url})` : item.detail));

  if (evidenceLines.length > 0) {
    return evidenceLines.join(' ');
  }

  return NO_EVIDENCE_SE_OUTPUT;
}

function isNoSignalRow(row: BrdMatrixRow): boolean {
  return row.scopeValue === 'No signal found' || row.scopeValue === 'Out Of Scope';
}

function isPlaceholderEvidence(detail: string): boolean {
  return /no direct wa evidence/i.test(detail);
}

function hasHubspotContradiction(existingText: string, row: BrdMatrixRow): boolean {
  if (!existingText.trim()) return false;
  if (!waHasEvidence(row)) return false;
  return existingSaysNo(existingText);
}

function existingSaysNo(existingText: string): boolean {
  return /\b(no|none|not interested|out of scope|oos|not applicable|n\/a)\b/i.test(existingText);
}

function waHasEvidence(row: BrdMatrixRow): boolean {
  if (row.llmSeOutputText?.trim() && !isNoEvidencePhrase(row.llmSeOutputText)) return true;
  if (row.recommendedStatusAction === 'done') return true;
  // HubSpot/Sales-primary BRDs: ignore keyword bleed; only explicit WA SE notes count.
  if (isHubspotSalesOnlyBrd(row.requirementId)) return false;
  if (row.scopeValue === 'In Scope' || row.scopeValue === 'Unconfirmed') return true;
  return row.evidence.some((item) => !isPlaceholderEvidence(item.detail));
}

function isNoEvidencePhrase(text: string): boolean {
  return /^(no wa evidence found|sweep found no evidence for this brd)\.?$/i.test(text.trim());
}

function buildConflictNote(existingText: string, row: BrdMatrixRow): string | undefined {
  if (!hasHubspotContradiction(existingText, row)) return undefined;
  return 'WA evidence conflicts with existing HubSpot / SE scoping notes. Confirm with Sales.';
}

function recommendedPhaseAction(
  row: BrdMatrixRow,
  statusAction?: BrdStatusAction
): BrdPhaseAction | undefined {
  if (row.scopeValue === 'Future') return 'future';
  if (row.scopeValue === 'Out Of Scope' || row.scopeValue === 'No signal found') return 'out_of_scope';
  if (statusAction === 'done' || row.scopeValue === 'In Scope') return 'in_scope';
  return undefined;
}

function phaseActionFromJiraPhase(phaseText: string | undefined): BrdPhaseAction | undefined {
  switch ((phaseText || '').trim()) {
    case 'in Scope':
      return 'in_scope';
    case 'Out Of Scope':
      return 'out_of_scope';
    case 'Future':
      return 'future';
    default:
      return undefined;
  }
}
