# Global Sweep Future Jira Tickets

This file turns the presentation transcript into Jira-ready future tickets. These are for next-phase work, not the work that has already been completed.

## Suggested Structure

- If you want to keep everything under `SOLI-452`, create these as additional subtasks.
- If you want to separate shipped work from future work, create these as new sibling stories under the same `SOLI` area.

## Suggested Fields

- Project: `SOLI`
- Label: `global-sweep`
- Components: `web`, `llm`, `jira`, `scraper`, `integrations`, `ops`

## Ticket 1

Summary: Add direct LLM integration in the web UI

Description:
Remove the copy/paste workflow by allowing the tool to call the model directly after the scrape and return assessment output in the same UI flow.

Acceptance criteria:
- The web app can call an LLM directly after scraping.
- Manual prompt copy/paste is no longer required for the standard path.
- The UI shows useful progress and error states during generation.

## Ticket 2

Summary: Add local LLM support for formatting and lightweight automation

Description:
Evaluate and integrate a small local model that can run on employee laptops for formatting or lighter-weight reasoning, reducing reliance on large hosted models for simple output generation.

Acceptance criteria:
- At least one local-model path is evaluated or integrated.
- The tool can use a smaller local model for formatting-oriented tasks.
- The team understands where local models are sufficient and where hosted models are still needed.

## Ticket 3

Summary: Replace email-only feedback with Jira-based issue capture

Description:
Route in-product feedback into Jira instead of relying only on email so issues and enhancement requests are easier to triage and track.

Acceptance criteria:
- The feedback flow can create or link to Jira issues.
- Feedback no longer depends solely on a personal email inbox.
- Users can report issues without leaving the tool.

## Ticket 4

Summary: Auto-fill BRD Jira tickets with assessment output

Description:
Push Global Sweep output into the relevant Jira workflow so assessment data is written directly into the target ticket instead of being pasted manually.

Acceptance criteria:
- Assessment output can be written back into the target Jira ticket.
- The team defines where automated output should live, such as a field or comment.
- Manual review still happens before final submission where needed.

## Ticket 5

Summary: Define a structured Jira field for automated assessment output

Description:
Create a cleaner destination for machine-generated assessment data so the output is not just pasted as one large unstructured block.

Acceptance criteria:
- The target Jira field or comment strategy is defined.
- Automated output can be stored in a predictable location.
- The resulting ticket layout is readable to end users.

## Ticket 6

Summary: Expand scraper support beyond Shopify

Description:
Continue widening merchant compatibility while balancing depth of analysis against the complexity of building a universal scraper.

Acceptance criteria:
- The scraper supports more non-Shopify merchants reliably.
- Known gaps for non-Shopify checkout or policy discovery are documented and reduced.
- Expansion decisions stay aligned with the Website Assessment use case.

## Ticket 7

Summary: Improve bot-detection mitigation and scrape resilience

Description:
Reduce assessment failures caused by bot protection or fragile site behavior through better mitigation strategies and recovery patterns.

Acceptance criteria:
- The team has a clearer strategy for handling bot-detection blockers.
- Scrape resilience improves on difficult merchants.
- Bot-related limitations are surfaced clearly when they cannot be bypassed.

## Ticket 8

Summary: Add multi-merchant processing

Description:
Allow the tool to assess multiple merchants in one workflow to support broader testing, rollout, or pipeline usage.

Acceptance criteria:
- Multiple merchants can be queued or processed in one workflow.
- The tool returns clear per-merchant status and results.
- Batch-style usage improves pilot or operational efficiency.

## Ticket 9

Summary: Add HubSpot integration for merchant context

Description:
Pull merchant or account context from HubSpot so assessments can be enriched with business context and used more effectively in BD workflows.

Acceptance criteria:
- HubSpot data can be retrieved for relevant merchant workflows.
- The integration supports useful assessment context rather than raw data dumps.
- The team can define how HubSpot context should influence the workflow.

## Ticket 10

Summary: Improve copy and export usability in the assessment UI

Description:
Polish the current user experience by making high-frequency actions easier, such as moving copy/export actions higher in the page and reducing unnecessary scrolling.

Acceptance criteria:
- Copy or export actions are easier to access during normal use.
- Users no longer need excessive scrolling to complete the workflow.
- The tool feels more polished for broader team usage.

## Ticket 11

Summary: Improve truncated-content handling in scrape output

Description:
Reduce cases where important site information is lost due to truncation by improving what content is selected and retained for downstream analysis.

Acceptance criteria:
- Important blurbs are less likely to be dropped from the prompt context.
- Truncation behavior is more predictable and easier to tune.
- The resulting outputs preserve higher-value context for analysis.

## Ticket 12

Summary: Continue improving third-party detection coverage

Description:
Strengthen one of the tool’s core value areas by expanding and refining the detection logic for third-party providers, red flags, and platform signals.

Acceptance criteria:
- More integrations and edge cases are detected reliably.
- Detection updates can be added without excessive rework.
- Accuracy continues improving against known manual assessments.

## Ticket 13

Summary: Formalize hosting and security model for team rollout

Description:
Move from individual local usage toward a supported rollout model by deciding how the tool should be hosted, secured, and governed for team-wide adoption.

Acceptance criteria:
- The team aligns on whether the tool stays local-first or becomes centrally hosted.
- Security and IT considerations are documented for wider rollout.
- The tool has a clearer path from prototype to internal product.

## Ticket 14

Summary: Package Global Sweep for broader internal deployment

Description:
Use the existing dockerized, env-driven architecture as the basis for a deployable internal app that can be rolled out beyond the original builder.

Acceptance criteria:
- The deployment path is documented and repeatable.
- The app can be run outside a single developer’s local environment.
- The team can evaluate rollout options with less engineering overhead.

## Ticket 15

Summary: Define phased rollout and enablement plan for the team

Description:
Roll out Global Sweep in phases so the team can learn from early manual-review usage before relying more heavily on automation.

Acceptance criteria:
- Phase 1 manual-review usage is clearly defined.
- Follow-up phases are based on improved accuracy and output quality.
- Team enablement has a clear path rather than one-off handoffs.

## Best First Tickets

If you only want to create the most important next tickets first, start with:

1. Add direct LLM integration in the web UI
2. Add local LLM support for formatting and lightweight automation
3. Auto-fill BRD Jira tickets with assessment output
4. Replace email-only feedback with Jira-based issue capture
5. Expand scraper support beyond Shopify
6. Formalize hosting and security model for team rollout
