import type { BrdGate, BrdRequirement } from './requirements.js';

export type BrdScopeValue = 'In Scope' | 'Out Of Scope' | 'Future' | 'Unconfirmed' | 'No signal found';
export type BrdConfidence = 'high' | 'medium' | 'low';

export interface BrdEvidence {
  source: string;
  detail: string;
  url?: string;
}

export interface BrdMatrixRow {
  requirementId: string;
  category: string;
  requirement: string;
  gate: BrdGate;
  jiraKey?: string;
  hubspotField?: string;
  scopeValue: BrdScopeValue;
  confidence: BrdConfidence;
  evidence: BrdEvidence[];
  openQuestions: string[];
  proposedJiraText: string;
  existingText?: string;
  conflictNote?: string;
  finalText?: string;
  descriptionPreview?: string;
  llmSeOutputText?: string;
  recommendedStatusAction?: BrdStatusAction;
  recommendedPhaseAction?: BrdPhaseAction;
}

export interface BrdSubtask {
  key: string;
  summary: string;
  status?: string;
  priority?: string;
  description?: unknown;
  descriptionText?: string;
  seOutputField?: unknown;
  seOutputText?: string;
  phaseField?: unknown;
  phaseText?: string;
}

export interface BrdParentContext {
  key: string;
  summary: string;
  status?: string;
  subtasks: BrdSubtask[];
}

export interface BrdDraftInput {
  merchantName?: string;
  parent?: BrdParentContext;
  websiteAssessmentMarkdown?: string;
  websiteAssessmentJson?: unknown;
  dealLink?: string;
  additionalNotes?: string;
}

export interface BrdDraftResult {
  merchantName: string;
  parent?: BrdParentContext;
  rows: BrdMatrixRow[];
  outputs: {
    matrixMarkdown: string;
    jiraUpdatePlan: string;
    confluenceNarrative: string;
    openQuestions: string;
  };
}

export interface RequirementSignal {
  scopeValue: BrdScopeValue;
  confidence: BrdConfidence;
  evidence: BrdEvidence[];
  openQuestions: string[];
}

export type RequirementSignalMap = Partial<Record<BrdRequirement['id'], RequirementSignal>>;

export interface BrdReviewRow extends BrdMatrixRow {
  jiraKey: string;
  existingText: string;
  jiraDescriptionText: string;
  currentStatus: string;
  currentPhase?: string;
  statusAction?: BrdStatusAction;
  phaseAction?: BrdPhaseAction;
  conflictNote?: string;
  finalText: string;
}

export interface BrdReviewResult {
  merchantName: string;
  parent: BrdParentContext;
  rows: BrdReviewRow[];
}

export interface BrdUpdateInputRow {
  jiraKey: string;
  finalText: string;
}

export type BrdStatusAction = 'unchanged' | 'done';

export type BrdPhaseAction = 'unchanged' | 'in_scope' | 'out_of_scope' | 'future';

export interface BrdTableUpdateInputRow extends BrdUpdateInputRow {
  statusAction?: BrdStatusAction;
  phaseAction?: BrdPhaseAction;
}

export interface BrdUpdatePreview {
  jiraKey: string;
  summary: string;
  beforeText: string;
  afterText: string;
  finalText: string;
  statusAction?: BrdStatusAction;
  phaseAction?: BrdPhaseAction;
  beforePhase?: string;
  afterPhase?: string;
}
