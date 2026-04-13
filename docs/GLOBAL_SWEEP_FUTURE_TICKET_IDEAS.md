# Global Sweep Future Ticket Ideas

This file is for follow-on work that looks worth ticketing next. It is separate from the retroactive ticket set for work that has already been done.

## How To Use This

- Treat each section below as a candidate new ticket.
- If you want to keep everything under `SOLI-452`, these can be created as additional subtasks.
- If you want a cleaner split between shipped work and next-phase work, create them as new sibling stories instead.

## Highest-Value Future Tickets

### Ticket: Add direct LLM integration in the web UI

Why:
- The current flow still depends on copy/paste into Cursor.
- The repo roadmap already calls out direct API integration as coming soon.

What it would cover:
- Call the LLM directly from the web flow after scraping.
- Remove the manual copy/paste step for standard WA generation.
- Show generation progress and failure states in the UI.

Source:
- `README.md`
- `docs/PRESENTATION_SLIDES.md`
- `docs/EXECUTIVE_SUMMARY_PPT.md`
- `src/web/public/index.html`

### Ticket: Add local LLM support for offline or low-cost WA generation

Why:
- Gives the team an option that does not depend on hosted model access.
- Could reduce costs and make the tool more flexible for internal demos or experiments.

What it would cover:
- Support a local-model provider path alongside hosted APIs.
- Add configuration for model choice, context limits, and fallback behavior.
- Measure quality differences between hosted and local outputs.

Notes:
- This was requested explicitly and should stay on the future-work list even though it is not yet documented in the repo.

### Ticket: Auto-create or update Jira tickets from assessment output

Why:
- The product still ends with a manual paste into Jira.
- This is already called out in the slides as a fast-follow integration.

What it would cover:
- Create Jira tickets directly from generated WA markdown or JSON.
- Update existing Jira tickets with structured sections.
- Preserve a review step before final submission.

Source:
- `docs/PRESENTATION_SLIDES.md`
- `docs/EXECUTIVE_SUMMARY_PPT.md`

### Ticket: Add screenshot capture to the assessment pipeline

Why:
- Screenshots would make output easier to review and share.
- The executive-summary roadmap already lists this as coming soon.

What it would cover:
- Capture key screenshots during discovery, PDP, cart, and checkout.
- Attach or reference screenshots in the final assessment output.
- Keep screenshot capture optional so it does not slow every run.

Source:
- `docs/EXECUTIVE_SUMMARY_PPT.md`

### Ticket: Add batch processing for multiple merchants

Why:
- Makes pilot rollout and regression testing easier.
- This is already called out in presentation roadmap notes.

What it would cover:
- Queue multiple merchants from the UI or CLI.
- Store results consistently for later review.
- Provide success/failure summaries across a batch run.

Source:
- `docs/PRESENTATION_SLIDES.md`

## Strong Next-Wave Tickets

### Ticket: Expand third-party detection coverage and rule maintenance

Why:
- Detection quality is one of the main value drivers.
- More coverage improves trust and reduces manual follow-up.

What it would cover:
- Add more third-party app patterns.
- Formalize how detection rules are added and tested.
- Improve handling of edge cases and hidden integrations.

Source:
- `docs/PRESENTATION_SLIDES.md`
- `docs/EXECUTIVE_SUMMARY_PPT.md`

### Ticket: Add human review and approval workflow before publish

Why:
- Even with better automation, users will still want a review checkpoint.
- This makes Jira and Confluence automation safer.

What it would cover:
- Review screen for generated WA sections.
- Approve, edit, reject, and regenerate actions.
- Clear separation between draft and final output.

### Ticket: Add model/provider settings in the web app

Why:
- This supports both direct hosted APIs and future local LLM work.
- Makes experimentation possible without code changes.

What it would cover:
- Provider selector and model selector.
- API key and connection validation.
- Per-provider defaults for timeout, tokens, and retries.

### Ticket: Add regression scoring against known WA tickets

Why:
- The team already compares against real Jira tickets.
- A repeatable score would make improvements easier to measure.

What it would cover:
- Define comparison categories and scoring rules.
- Generate a repeatable benchmark report for known merchants.
- Track matches, misses, and extra findings over time.

### Ticket: Add retry, resume, and recovery for long-running scrapes

Why:
- Timeout and fragility are recurring realities for merchant sites.
- Better recovery improves operator trust.

What it would cover:
- Resume from partial runs where possible.
- Retry failed phases selectively instead of restarting everything.
- Preserve useful evidence between attempts.

## Nice-To-Have Tickets

### Ticket: Auto-publish DNA or WA output to Confluence

Why:
- Complements Jira automation and reduces duplicate manual steps.

What it would cover:
- Push final draft output to Confluence pages.
- Support merchant-specific templates or page locations.
- Keep a review checkpoint before publish.

### Ticket: Add team-level analytics for pilot adoption

Why:
- Helps justify wider rollout with concrete metrics.

What it would cover:
- Time saved per assessment.
- Assessment success and failure rates.
- Most common manual edits after generation.

### Ticket: Add reusable merchant profiles or presets

Why:
- Some merchant types likely need repeatable settings.

What it would cover:
- Saved presets for scrape depth, checkout handling, and output style.
- Merchant-type defaults for B2B, subscription, or international patterns.

## Suggested First 5 To Ticket

If you want to create only the best next-wave tickets first, start with these:

1. Direct LLM integration in the web UI
2. Local LLM support
3. Jira ticket auto-create/update
4. Screenshot capture
5. Batch processing for multiple merchants

## Transcript Note

I did not find an actual call transcript file in this workspace, so this list combines:
- roadmap items already present in the repo
- your explicit request to include local LLM support

If you point me to the transcript or paste it here, I can fold in any additional call-specific ideas and turn them into ticket-ready wording too.
