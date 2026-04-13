# Global Sweep Backlog Skeleton

This is a retroactive ticket skeleton for the work already completed in Global Sweep. It is organized around a single parent Jira story, `SOLI-452`, with each major workstream represented as a direct subtask.

## Parent Ticket

- Parent story: `SOLI-452`
- Current summary: `AI Supported Website Assessment`
- Use each section below as a direct subtask under that story.
- Treat the nested tasks as scope notes inside each subtask description, not as additional Jira issues.

## How To Use This

- Create one Jira subtask per section below.
- Roll the nested tasks into the subtask description or checklist.
- Keep the wording close to this draft if you want a clean engineering-style backlog.
- Add owners, estimates, and labels after import.

## Suggested Labels

- `global-sweep`
- `scraper`
- `web-app`
- `llm`
- `dna`
- `cli`
- `docs`
- `enablement`

## Subtask 1: Scraper Reliability And Coverage

Goal: make the Playwright scraping layer dependable enough for repeated merchant assessments.

### Task: Define phased scrape orchestration

Description: Build the end-to-end scrape lifecycle across discovery, listing and PDP collection, optional checkout probing, and final analysis so each run follows a predictable sequence.

Acceptance criteria:
- Runs report clear phase transitions instead of a single opaque loading state.
- Discovery, content collection, checkout, and analysis can be reasoned about separately.
- Downstream consumers receive a consistent result shape even when some phases are incomplete.

### Task: Add bounded browser teardown and timeout handling

Description: Prevent stuck Playwright processes from hanging the entire assessment flow by enforcing close timeouts and safe cleanup behavior.

Acceptance criteria:
- Browser and context shutdown cannot block indefinitely.
- Timeout cases fail predictably and surface a useful operator-facing message.
- Cleanup behavior reduces the chance of orphaned browser processes after a run.

### Task: Return partial scrape results on timeout

Description: Preserve useful evidence when a scrape times out so operators still get a partial assessment instead of a hard failure.

Acceptance criteria:
- Timed-out runs can return partial page data and summary context.
- The result clearly indicates that the scrape completed partially.
- The UI or caller can distinguish a partial result from a clean success.

### Task: Add optional checkout probing with safe abort behavior

Description: Support deeper checkout validation without forcing every web run to pay the time cost or risk long hangs.

Acceptance criteria:
- Checkout testing can be enabled or disabled through scrape options.
- Checkout probes can be aborted safely when the overall run times out.
- Checkout pages are closed cleanly after probe completion or cancellation.

### Task: Expand scrape progress and warning types

Description: Enrich the scraper result contract so the rest of the product can show elapsed time, remaining time, and completion warnings.

Acceptance criteria:
- Progress payloads support timing metadata.
- Result summaries support completion warnings and partial-run messaging.
- Web and CLI surfaces can consume the new fields without custom one-off logic.

## Subtask 2: Detection And WA Intelligence Pipeline

Goal: turn raw merchant-site evidence into a structured Website Assessment that matches the team’s working template.

### Task: Add keyword-based page pre-filtering

Description: Tag scraped pages by likely business category so the extractor gets more targeted evidence for shipping, returns, payments, loyalty, and checkout topics.

Acceptance criteria:
- Pages can be tagged into useful evidence categories.
- Category tags improve downstream evidence selection for extraction.
- Tagging logic is easy to extend as new patterns are discovered.

### Task: Define and evolve the Website Assessment schema

Description: Formalize the WA output in Zod so the generated assessment can be validated before it is shown to users or copied into downstream systems.

Acceptance criteria:
- Assessment sections and shared field shapes are centrally defined.
- Invalid model output can be rejected with actionable validation errors.
- Schema updates can be made without reworking the full extraction pipeline.

### Task: Build prompt generation for WA extraction

Description: Convert the scrape bundle into a prompt that gives the LLM enough structured context to produce a reliable Website Assessment.

Acceptance criteria:
- Prompt inputs include the most important scrape findings and evidence.
- Prompt output expectations match the structured WA schema.
- Prompt wording supports repeatable extraction rather than free-form summaries.

### Task: Harden extraction against malformed model responses

Description: Make the extraction path resilient to fenced JSON, partial responses, and other common formatting issues from the model.

Acceptance criteria:
- The extractor can recover from common response-formatting mistakes.
- Validation failures are surfaced clearly when recovery is not possible.
- The failure mode preserves enough detail to debug prompt or schema issues.

### Task: Format validated WA output as markdown

Description: Transform the validated assessment JSON into a markdown artifact that mirrors the team’s manual WA format.

Acceptance criteria:
- Output structure follows the expected assessment template.
- Generated markdown is readable enough to paste into Jira or related tools.
- Formatter behavior is stable even when some optional fields are absent.

## Subtask 3: Web App And Operator Experience

Goal: give non-CLI users a dependable local interface for running and reviewing assessments.

### Task: Build the local web app assessment flow

Description: Provide a simple operator workflow for entering a merchant URL, starting a run, and receiving assessment output without needing to use internal scripts directly.

Acceptance criteria:
- Operators can submit a merchant URL from the local web UI.
- The server can launch a scrape and return progress and results to the browser.
- The UI supports the core sweep workflow without requiring CLI knowledge.

### Task: Add SSE progress updates with timing data

Description: Stream live run status so the operator can tell whether a scrape is progressing normally or approaching its time budget.

Acceptance criteria:
- Live events include phase information and human-usable timing fields.
- The browser updates progress state without polling.
- Operators can tell when a run is active, delayed, or nearly out of time.

### Task: Default web runs to skip checkout with override support

Description: Optimize the default web experience for speed while still allowing deeper validation when needed.

Acceptance criteria:
- Web runs default to skipping checkout unless explicitly enabled.
- Operators can opt into checkout testing from the UI.
- The run configuration is reflected consistently by the server and client.

### Task: Surface partial-result and warning states in the UI

Description: Show when a run completed with caveats so the operator understands whether the output is complete enough to trust.

Acceptance criteria:
- The UI can display partial-run warnings and completion notes.
- Operators can distinguish warnings from hard failures.
- Warning messages stay visible alongside the assessment result.

### Task: Improve results-panel layout and responsiveness

Description: Refine the front-end layout so assessments, progress, and controls remain readable during and after a run.

Acceptance criteria:
- The results area behaves predictably across common screen sizes.
- Assessment content does not collide with progress or control sections.
- Layout changes improve scanability of the final output.

### Task: Add operator utility endpoints

Description: Expose supporting server endpoints for health checks, status inspection, and JSON-to-markdown conversion.

Acceptance criteria:
- Basic health and status endpoints are available for local diagnostics.
- Structured assessment JSON can be converted into markdown through the API.
- Utility endpoints reduce the need for one-off scripts during troubleshooting.

## Subtask 4: DNA Generation And Enterprise Context

Goal: extend Global Sweep beyond raw WA output into discovery notes and enterprise-context generation.

### Task: Create the DNA prompt composition flow

Description: Build the prompt inputs needed to generate Discovery Notes and Analysis from Website Assessment findings plus external context.

Acceptance criteria:
- The prompt can combine WA content with Jira or Confluence context.
- Prompt structure yields sectioned DNA-style output instead of generic prose.
- Prompt inputs are easy to evolve as the DNA format matures.

### Task: Implement server-side DNA generation

Description: Add the model call and response handling required to generate DNA markdown on the server.

Acceptance criteria:
- The server can generate DNA output from supported inputs.
- Generation failures are surfaced cleanly to the caller.
- The returned output is directly usable as markdown.

### Task: Expose a DNA API workflow

Description: Provide an API endpoint that accepts WA content and optional supporting context so DNA output can be generated on demand.

Acceptance criteria:
- Clients can submit WA content to a dedicated DNA endpoint.
- Optional Jira and Confluence context can be included in the request.
- The API response returns structured success or failure information.

### Task: Add Confluence DNA lookup helpers

Description: Support discovery workflows with helper methods for searching merchant-related DNA pages and listing recent DNA content.

Acceptance criteria:
- Recent DNA page links can be retrieved programmatically.
- Merchant-oriented DNA search is supported.
- Failures from Confluence calls produce usable operator feedback.

### Task: Track follow-up integration of DNA into the main workflow

Description: Capture the remaining product work needed to make DNA generation a first-class step instead of a side capability.

Acceptance criteria:
- The backlog records follow-up product integration work for DNA.
- Open gaps between the server endpoint and the main UI flow are documented.
- The team can prioritize DNA integration separately from the initial API delivery.

## Subtask 5: CLI, QA, And Regression Utilities

Goal: support internal validation, comparison, and repeated testing outside the main web flow.

### Task: Add batch assessment tooling for known merchants

Description: Create internal utilities for running multiple target merchants and writing artifacts to disk for review.

Acceptance criteria:
- Operators can run batches against a maintained set of merchants.
- Results are written to predictable output locations.
- Batch tooling is useful for regression checks after scraper changes.

### Task: Build Jira-versus-scrape comparison tooling

Description: Compare automated assessment findings against ticket content so the team can measure accuracy and coverage.

Acceptance criteria:
- Comparison tooling can consume scrape output and Jira-like ticket content.
- Differences can be reviewed by category rather than only raw text.
- The output helps identify where the scraper found more, less, or conflicting evidence.

### Task: Add focused validation CLIs

Description: Provide lightweight scripts for Wappalyzer-only runs, targeted test harnesses, and other fast feedback workflows.

Acceptance criteria:
- Focused CLIs exist for quick validation tasks.
- These CLIs run faster than the full end-to-end flow when only part of the system is under test.
- The outputs are clear enough for engineers to use during development.

### Task: Standardize CLI error handling and output shape

Description: Make internal CLI tools feel like part of one system instead of a collection of ad hoc scripts.

Acceptance criteria:
- CLI scripts return consistent success and failure messaging.
- Output files and console summaries follow predictable conventions.
- Engineers can move between tools without relearning the interface each time.

### Task: Track follow-up work for CLI and web parity

Description: Capture the remaining gaps between the internal CLI surface and the web app so the team can decide how much parity is worth maintaining.

Acceptance criteria:
- Major parity gaps are documented in the backlog.
- The team can distinguish must-have parity work from optional internal tooling.
- Follow-up tickets can be prioritized independently of current production needs.

## Subtask 6: Tooling, Install, And Developer Enablement

Goal: reduce friction for setup, local execution, and ongoing maintenance of the project.

### Task: Add Playwright browser install automation

Description: Simplify setup by making browser installation part of the normal local dependency workflow.

Acceptance criteria:
- Required Playwright browsers can be installed through the project scripts.
- The standard install flow sets developers up without extra tribal knowledge.
- The setup process is documented clearly enough for new contributors.

### Chore: Manage local browser binaries and generated artifacts

Description: Keep large generated files and local-only assets out of source control while preserving a predictable local environment.

Acceptance criteria:
- Local browser binaries are stored in a consistent project location.
- Generated artifacts that should not be committed are ignored.
- The repo stays clean after normal setup and execution.

### Task: Introduce ESLint configuration and clean up low-signal lint issues

Description: Add a maintainable lint baseline so quality checks can run consistently as the codebase grows.

Acceptance criteria:
- The project includes an ESLint configuration that covers the main TypeScript sources.
- Obvious low-value lint failures are cleaned up.
- Engineers can run lint locally using a documented command.

### Task: Document team setup and launch workflows

Description: Capture the local setup path, run commands, and Cursor-friendly workflow so the project can be used by more than one person.

Acceptance criteria:
- Team setup documentation covers local prerequisites and launch steps.
- The local web flow is documented in a way non-authors can follow.
- Common setup friction points have troubleshooting guidance.

### Chore: Capture env and troubleshooting improvements

Description: Keep the setup guidance current as optional env variables, browser behavior, and local tooling assumptions evolve.

Acceptance criteria:
- Optional configuration is documented clearly.
- Troubleshooting notes reflect the current project behavior.
- Future setup updates have an obvious place in the docs set.

## Subtask 7: Domain Knowledge, Presentation, And Presales Assets

Goal: preserve the business context, stakeholder narrative, and collateral that make the technical output useful in the real WA workflow.

### Task: Expand domain knowledge coverage for WA edge cases

Description: Document the business patterns and ecommerce edge cases the product needs to recognize during assessments.

Acceptance criteria:
- Domain guidance covers key payment, shipping, returns, and checkout patterns.
- The knowledge base is specific enough to inform prompt and assessment updates.
- Engineers and operators can use the same reference material when refining output quality.

### Task: Build presentation-ready project messaging

Description: Package the product story, value proposition, and operating flow into slides or presentation notes suitable for internal stakeholders.

Acceptance criteria:
- The deck explains the problem, solution, workflow, and validation story.
- Project messaging is aligned with the current product behavior.
- Stakeholders can understand the value of the tool without reading source code.

### Task: Produce Confluence update scripts for stakeholder sharing

Description: Support repeatable stakeholder updates with scripts that prepare or push merchant-specific Confluence content.

Acceptance criteria:
- Update scripts exist for known stakeholder update flows.
- The scripts reduce manual editing for repeated Confluence updates.
- The team can reuse the approach for additional merchants or workstreams.

### Task: Add supporting diagrams and operational collateral

Description: Create supplemental diagrams and supporting documents for adjacent operational flows that come up during presales or onboarding work.

Acceptance criteria:
- At least one operational or ERP-related flow is documented visually.
- Supplemental collateral helps explain adjacent workflow questions.
- The artifacts are easy to share outside the engineering team.

### Task: Keep product output aligned with stakeholder-facing templates

Description: Ensure the product’s WA output remains consistent with the format and expectations used by the broader team.

Acceptance criteria:
- Output structure continues to mirror the working WA template.
- Documentation and generated artifacts do not drift apart significantly.
- Template updates can be reflected in product output without a full redesign.

## Recommended Rollup Version

If you want a lighter retroactive board, collapse the above into these direct subtasks:

- Data collection
- WA intelligence
- Web app
- DNA and Confluence
- QA and internal tools
- Enablement and docs

## Suggested Import Order

If you are entering these manually, start with the most visible shipped outcomes first:

1. Scraper Reliability And Coverage
2. Web App And Operator Experience
3. Detection And WA Intelligence Pipeline
4. DNA Generation And Enterprise Context
5. CLI, QA, And Regression Utilities
6. Tooling, Install, And Developer Enablement
7. Domain Knowledge, Presentation, And Presales Assets
