import type { BrdDraftResult, BrdMatrixRow } from './types.js';

export function formatBrdMatrixMarkdown(rows: BrdMatrixRow[]): string {
  const lines = [
    '# BRD Requirement Matrix',
    '',
    '| Req ID | Jira | Category | Requirement | Gate | Proposed Scope | Confidence | Evidence | Open Questions |',
    '|---|---|---|---|---|---|---|---|---|',
  ];

  for (const row of rows) {
    lines.push([
      row.requirementId,
      row.jiraKey || 'Not found under parent',
      row.category,
      row.requirement,
      row.gate,
      row.scopeValue,
      row.confidence,
      summarizeEvidence(row),
      row.openQuestions.join('<br>') || 'None',
    ].map(escapeTableCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  return lines.join('\n');
}

export function formatJiraUpdatePlan(result: BrdDraftResult): string {
  const lines = [
    '# BRD Jira Update Plan',
    '',
    `Merchant: ${result.merchantName}`,
  ];

  if (result.parent) {
    lines.push(`Parent SOPP: ${result.parent.key} - ${result.parent.summary}`);
  }

  lines.push(
    '',
    'Review these proposed updates before applying them. The current MVP does not publish changes automatically.',
    ''
  );

  for (const row of result.rows) {
    lines.push(`## ${row.requirementId} - ${row.requirement}`);
    lines.push(`Jira: ${row.jiraKey || 'No matching subtask found under parent'}`);
    lines.push(`Gate: ${row.gate}`);
    lines.push('');
    lines.push(row.proposedJiraText);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatConfluenceNarrative(result: BrdDraftResult): string {
  const signReady = result.rows.filter((row) => row.gate === 'SIGN' && row.scopeValue !== 'No signal found');
  const lockReady = result.rows.filter((row) => row.gate === 'LOCK' && row.scopeValue !== 'No signal found');
  const openQuestions = result.rows.flatMap((row) => row.openQuestions.map((question) => `${row.requirementId}: ${question}`));

  const lines = [
    '# BRD Draft Narrative',
    '',
    `## Merchant Snapshot`,
    '',
    `Merchant: ${result.merchantName}`,
  ];

  if (result.parent) {
    lines.push(`SOPP Parent: ${result.parent.key} - ${result.parent.summary}`);
  }

  lines.push(
    '',
    '## Scope Summary',
    '',
    `SIGN items with evidence/signals: ${signReady.length}`,
    `LOCK items with evidence/signals: ${lockReady.length}`,
    '',
    '## SIGN Gate Items',
    '',
    ...formatNarrativeRows(signReady),
    '',
    '## LOCK Gate Items',
    '',
    ...formatNarrativeRows(lockReady),
    '',
    '## Decisions / Assumptions / Open Questions',
    '',
    ...(openQuestions.length ? openQuestions.map((question) => `- ${question}`) : ['- None captured yet.'])
  );

  return lines.join('\n');
}

export function formatOpenQuestions(rows: BrdMatrixRow[]): string {
  const questions = rows.flatMap((row) => (
    row.openQuestions.map((question) => `- ${row.requirementId} (${row.requirement}): ${question}`)
  ));
  return ['# BRD Open Questions', '', ...(questions.length ? questions : ['- None.'])].join('\n');
}

function formatNarrativeRows(rows: BrdMatrixRow[]): string[] {
  if (rows.length === 0) return ['- No items with mapped WA signals yet.'];
  return rows.map((row) => `- ${row.requirementId} ${row.requirement}: ${row.scopeValue} (${row.confidence} confidence).`);
}

function summarizeEvidence(row: BrdMatrixRow): string {
  return row.evidence
    .slice(0, 2)
    .map((item) => item.url ? `${item.source}: ${item.detail} (${item.url})` : `${item.source}: ${item.detail}`)
    .join('<br>');
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
