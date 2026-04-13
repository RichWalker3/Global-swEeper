# Shareable Branch Audit

This document is a practical guide for preparing a first team-facing branch of Global-sweep.

## Goal

Create a branch that is easy for teammates to clone and run without exposing local-only artifacts or burying the core product under maintainer-only material.

## Recommended To Include

These files are part of the pilot-ready product surface:

- `src/`
- `README.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `env.example`
- `.gitignore`
- `.vscode/tasks.json`
- `SETUP_PROMPT.txt`
- `docs/TEAM_SETUP.md`
- `docs/ONE_SHOT_SETUP_PROMPT.md`
- `docs/PILOT_READINESS.md`
- `docs/TEMPLATE.md`
- `docs/DOMAIN_KNOWLEDGE.md`

## OK To Keep, But Not Required For Pilot Users

These can stay in the repo, but pilot users do not need them on day one:

- `docs/PROMPT_DESIGN.md`
- `docs/SCHEMA_DESIGN.md`
- `docs/CURSOR_SETUP_PROMPT.md`
- `src/dna/`
- `scripts/README.md`

## Consider Leaving Out Of The First Shared Branch

These appear to be internal planning, admin, or maintainer workflows rather than pilot-user needs:

- `docs/GLOBAL_SWEEP_TICKET_BACKLOG.md`
- `docs/GLOBAL_SWEEP_JIRA_TICKETS.md`
- `docs/GLOBAL_SWEEP_FUTURE_JIRA_TICKETS.md`
- `docs/GLOBAL_SWEEP_FUTURE_TICKET_IDEAS.md`
- `docs/PRESENTATION_SLIDES.md`
- `docs/EXECUTIVE_SUMMARY_PPT.md`
- `docs/cin7-ge-vs-meta-flow.mmd`
- `docs/cin7-ge-vs-meta-flow.pdf`
- `scripts/create_soli_452_subtasks.py`
- `scripts/create_soli_452_future_subtasks.py`
- `scripts/build_members_only_confluence_update.py`
- `scripts/build_toybox_confluence_update.py`
- `scripts/push_members_only_confluence_update.sh`
- `scripts/push_toybox_confluence_update.sh`
- `scripts/run_merchant_comparison_batch.ts`

These files may still be useful for maintainers, but they do not help a teammate simply install and run Sweep.

## Local-Only Or Never-Commit Items

- `.env`
- `.cursor-tmp-*`
- machine-specific logs, output folders, screenshots, and temporary files
- any file containing live credentials or personal tokens

## Current Audit Notes

- The core pilot docs are now genericized so they do not depend on a specific public GitHub URL.
- The repo README now reflects the actual current product state better than the older aspirational version.
- Maintainer scripts still include Jira and Confluence-oriented utilities, which is fine if they are treated as maintainer-only.
- A small pilot can proceed without removing every internal file, but a cleaner branch will reduce confusion for first-time users.

## Recommended First Share Branch From Current Worktree

If you cut a first pilot branch from the current repo state, my recommendation is:

### Include

These changes improve the actual product or make the repo materially easier to share:

- `.gitignore`
- `README.md`
- `SETUP_PROMPT.txt`
- `env.example`
- `eslint.config.mjs`
- `package.json`
- `package-lock.json`
- `docs/DOMAIN_KNOWLEDGE.md`
- `docs/ONE_SHOT_SETUP_PROMPT.md`
- `docs/PILOT_READINESS.md`
- `docs/SHAREABLE_BRANCH_AUDIT.md`
- `docs/TEAM_SETUP.md`
- `docs/TEMPLATE.md`
- `src/web/server.ts`
- `src/web/public/index.html`
- `src/extractor/extractor.ts`
- `src/extractor/prompt.ts`
- `src/extractor/prompt.test.ts`
- `src/formatter/markdown.ts`
- `src/logger/index.ts`
- `src/logger/index.test.ts`
- `src/prefilter/tagger.ts`
- `src/schema/assessment.ts`
- `src/scraper/browser.ts`
- `src/scraper/crawler.ts`
- `src/scraper/detectors.ts`
- `src/scraper/detectors.test.ts`
- `src/scraper/pageExtractor.ts`
- `src/scraper/types.ts`
- `src/dna/`

These are the files most aligned with the current pilot story: stronger WA output, better checkout handling, better docs, and safer repo hygiene.

### Optional

These can stay if you want one working internal repo, but they are not required for a basic pilot user:

- `src/cli/wa-only.ts`
- `src/cli/compare-results.ts`
- `scripts/README.md`
- `scripts/test-wa.ts`
- `scripts/compare-results.ts`
- `scripts/batch-test.ts`

### Leave Out Of The First Pilot Branch If You Want A Cleaner Share

These are useful internally, but they do not help a teammate simply install and run Sweep:

- `docs/GLOBAL_SWEEP_TICKET_BACKLOG.md`
- `docs/GLOBAL_SWEEP_JIRA_TICKETS.md`
- `docs/GLOBAL_SWEEP_FUTURE_JIRA_TICKETS.md`
- `docs/GLOBAL_SWEEP_FUTURE_TICKET_IDEAS.md`
- `docs/PRESENTATION_SLIDES.md`
- `docs/EXECUTIVE_SUMMARY_PPT.md`
- `docs/cin7-ge-vs-meta-flow.mmd`
- `docs/cin7-ge-vs-meta-flow.pdf`
- `scripts/create_soli_452_subtasks.py`
- `scripts/create_soli_452_future_subtasks.py`
- `scripts/build_members_only_confluence_update.py`
- `scripts/build_toybox_confluence_update.py`
- `scripts/push_members_only_confluence_update.sh`
- `scripts/push_toybox_confluence_update.sh`
- `scripts/run_merchant_comparison_batch.ts`

### Keep Local Only

- `.env`
- `.cursor-tmp-*`
- any generated logs, screenshots, outputs, or scratch artifacts

## Suggested Branch Strategy

### Option A: Lightweight Pilot Branch

Keep the app, setup docs, and essential product docs only. Move or omit planning/admin artifacts.

Best if:

- you want teammates focused on using the tool
- you want minimal confusion
- you plan to share widely inside the team

### Option B: Full Internal Working Branch

Keep everything, but document clearly which files are maintainer-only.

Best if:

- the audience is small
- the audience is technical
- you want one working repo instead of a curated branch

## Recommendation

For the first pilot, use a lightweight pilot branch or tag based on the current working code, with:

- app code
- setup docs
- pilot-readiness docs
- essential domain/template docs

Then keep planning docs and Jira/Confluence helper scripts either out of that branch or clearly framed as maintainer-only.

If you want a curated folder immediately without reorganizing branches yet, generate one with `npm run pilot:bundle`.
