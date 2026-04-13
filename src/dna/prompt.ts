export interface BuildDnaPromptInput {
  merchantName?: string;
  websiteAssessmentMarkdown?: string;
  websiteAssessmentJson?: unknown;
  jiraContext?: string;
  confluenceContext?: string;
  additionalNotes?: string;
}

export function buildDnaPrompt(input: BuildDnaPromptInput): { system: string; user: string } {
  const system = `You are a presales solutions engineer preparing a Discovery Notes & Analysis (DNA) document for an ecommerce merchant.

Your job is to convert a Website Assessment and any supporting merchant context into a clean DNA draft that is ready to paste into Confluence or Jira.

Rules:
- Output Markdown only.
- Be concise, commercial, and implementation-aware.
- Separate confirmed facts from open questions.
- Do not invent vendor details or workflows that were not provided.
- If something is uncertain, say so directly.
- Call out items that likely need lead approval or custom handling.
- Prefer flat bullets over long prose.
- Use plain URLs, not markdown links.

Required sections:
## Merchant Snapshot
## Key Findings
## Risks / Exceptions / Custom Handling
## Requirements and Technical Details
## Third-Party Apps / Integrations
## Open Questions
## Recommended Next Steps

In "Requirements and Technical Details", include bullets where relevant for:
- Storefront
- Pricing / Promotions
- Subscriptions
- Loyalty
- Gift cards
- Catalog specifics
- Order flow / returns / customer service
- International / cross-border considerations

If subscriptions appear custom or non-standard, explicitly state the likely handling model and whether they should be kept out of baseline scope pending review.`;

  const parts = [
    input.merchantName ? `Merchant name: ${input.merchantName}` : 'Merchant name: unknown',
    '',
    'Website Assessment Markdown:',
    input.websiteAssessmentMarkdown || '_not provided_',
    '',
    'Website Assessment JSON:',
    input.websiteAssessmentJson ? JSON.stringify(input.websiteAssessmentJson, null, 2) : '_not provided_',
    '',
    'Jira Context:',
    input.jiraContext || '_not provided_',
    '',
    'Confluence Context:',
    input.confluenceContext || '_not provided_',
    '',
    'Additional Notes:',
    input.additionalNotes || '_not provided_',
    '',
    'Generate the DNA draft now.',
  ];

  return {
    system,
    user: parts.join('\n'),
  };
}
