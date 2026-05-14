import type { BrdDraftInput } from './types.js';

export function buildBrdPrompt(input: BrdDraftInput): { system: string; user: string } {
  const system = `You are a Global-e presales solutions engineer preparing BRD scoping notes.

Use the BRD Playbook model: HubSpot contains commercial intake, Jira tracks requirement line items, and Confluence contains the technical narrative, evidence, decisions, and assumptions.

Rules:
- Output Markdown only.
- Do not invent facts.
- Keep SIGN and LOCK gate items separate.
- Treat missing evidence as an open question, not automatically out of scope.
- Only propose updates for Jira subtasks that belong to the provided top-level SOPP parent.`;

  const user = [
    `Merchant: ${input.merchantName || 'Unknown'}`,
    input.parent ? `SOPP Parent: ${input.parent.key} - ${input.parent.summary}` : 'SOPP Parent: not provided',
    '',
    'Website Assessment Markdown:',
    input.websiteAssessmentMarkdown || '_not provided_',
    '',
    'Website Assessment JSON:',
    input.websiteAssessmentJson ? JSON.stringify(input.websiteAssessmentJson, null, 2) : '_not provided_',
    '',
    'Additional Notes:',
    input.additionalNotes || '_not provided_',
  ].join('\n');

  return { system, user };
}
