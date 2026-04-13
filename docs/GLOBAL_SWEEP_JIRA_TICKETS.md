# Global Sweep Jira-Ready Tickets

This file is now structured for a single-parent Jira model: keep `SOLI-452` as the umbrella story, and create direct subtasks under it for each major workstream.

## Parent Ticket

- Parent story: `SOLI-452`
- Current summary: `AI Supported Website Assessment`
- Suggested approach: all work below branches directly from `SOLI-452` as `Subtask` issues

## Suggested Jira Fields

- Project: `SOLI`
- Parent issue: `SOLI-452`
- Label: `global-sweep`
- Components: `scraper`, `web`, `llm`, `dna`, `cli`, `docs`
- Ticket type for all items below: `Subtask`

## Subtask 1: Scraper Reliability And Coverage

Summary: Scraper reliability and coverage improvements

Description:
Improve scraper stability, timeout handling, and crawl coverage for repeated merchant assessments.

Scope:
- Define phased scrape orchestration across discovery, collection, checkout, and analysis.
- Add bounded browser teardown and timeout handling.
- Return partial results when scrapes time out.
- Support optional checkout probing with safe abort behavior.
- Expand progress metadata and warning fields for downstream consumers.

Acceptance criteria:
- Scrape runs expose clear phase transitions.
- Browser teardown cannot hang indefinitely.
- Timed-out runs can still return partial results with warnings.
- Checkout probing can be enabled or skipped safely.
- Web and CLI clients can consume the resulting progress and warning fields.

## Subtask 2: Detection And WA Intelligence Pipeline

Summary: Detection and Website Assessment intelligence pipeline

Description:
Convert raw merchant-site evidence into a structured Website Assessment aligned to the working template.

Scope:
- Add keyword-based page tagging before extraction.
- Define and evolve the Website Assessment schema in Zod.
- Build prompt generation for Website Assessment extraction.
- Harden extraction against malformed model responses.
- Format validated Website Assessments as markdown.

Acceptance criteria:
- Evidence pages can be tagged into reusable business categories.
- The Website Assessment schema validates generated output reliably.
- Prompting supports structured extraction instead of free-form summaries.
- Common model formatting issues can be recovered or reported clearly.
- Markdown output is ready to paste into Jira.

## Subtask 3: Web App And Operator Experience

Summary: Web app assessment workflow and operator UX

Description:
Provide a dependable local UI for running, monitoring, and reviewing assessments.

Scope:
- Build the local web flow for merchant assessments.
- Add SSE progress updates with elapsed and remaining time.
- Default web runs to skip checkout with optional override support.
- Surface partial-result warnings in the web UI.
- Improve assessment layout and responsive rendering.
- Add utility endpoints for health, status, and JSON-to-markdown.

Acceptance criteria:
- Operators can submit a merchant URL and run a sweep through the UI.
- Live progress updates show meaningful phase and timing information.
- Checkout is optional and defaults to off for web runs.
- Partial runs display clear warnings rather than failing silently.
- The results panel is readable across common screen sizes.

## Subtask 4: DNA Generation And Enterprise Context

Summary: DNA generation and Confluence context support

Description:
Extend the product from Website Assessments into discovery notes and enterprise-context generation.

Scope:
- Build the DNA prompt composition flow.
- Implement server-side DNA generation.
- Expose a dedicated DNA API endpoint.
- Add Confluence helpers for recent DNA and merchant lookup.
- Capture follow-up work to integrate DNA into the main product flow.

Acceptance criteria:
- DNA prompts can combine WA, Jira, and Confluence inputs.
- The server can generate DNA markdown successfully.
- Clients can call a dedicated DNA endpoint with optional context.
- Confluence helpers support recent-link and merchant-based lookup.
- Remaining product-integration gaps are documented.

## Subtask 5: CLI, QA, And Regression Utilities

Summary: CLI tools and regression workflows

Description:
Support internal validation, comparison, and repeated testing through focused command-line tools.

Scope:
- Add batch tooling for running assessments against known merchants.
- Build tooling to compare scrape output with Jira tickets.
- Add focused CLIs for fast validation workflows.
- Standardize CLI output and error handling.
- Track follow-up parity work between CLI and web flows.

Acceptance criteria:
- Engineers can run repeatable batches against known merchants.
- Comparison tooling highlights missing, extra, or conflicting findings.
- Focused CLIs support faster debugging workflows.
- CLI outputs and error messages are standardized.
- Known parity gaps between CLI and web are documented.

## Subtask 6: Tooling, Install, And Developer Enablement

Summary: Tooling, install flow, and developer enablement

Description:
Reduce setup friction and establish a maintainable local development baseline.

Scope:
- Add Playwright browser install automation to project scripts.
- Keep local browser binaries and generated assets out of git.
- Introduce ESLint configuration for the TypeScript codebase.
- Document team setup and local launch workflows.
- Maintain optional env and troubleshooting guidance.

Acceptance criteria:
- Browser installation is part of the normal local setup flow.
- Local-only generated assets are ignored correctly.
- ESLint runs against the main TypeScript sources.
- Setup documentation covers prerequisites, launch, and troubleshooting.
- Optional configuration is documented clearly.

## Subtask 7: Domain Knowledge, Presentation, And Presales Assets

Summary: Domain knowledge and stakeholder-facing collateral

Description:
Maintain the business context, stakeholder narrative, and collateral surrounding Global Sweep.

Scope:
- Expand domain knowledge coverage for assessment edge cases.
- Build presentation-ready messaging for Global Sweep.
- Create reusable Confluence update scripts for stakeholder sharing.
- Add supporting diagrams and adjacent operational collateral.
- Keep generated output aligned with stakeholder-facing templates.

Acceptance criteria:
- Domain docs cover key ecommerce and assessment edge cases.
- Presentation material reflects the current product workflow and value.
- Confluence update scripts reduce repeated manual work.
- Supporting diagrams help explain adjacent operational flows.
- Product output stays aligned with the working assessment template.

