# Changelog

Global-sweep uses `major.minor.patch` style versioning during the internal pilot.

## Unreleased

Track work on feature branches not yet merged to `pilot/team-handoff`. See `docs/BRANCH_MERGE_PLAN.md` and `docs/SWEEP_TODO.md`.

**Active branch:** `feat/brd-wa-quality` — **merged to `pilot/team-handoff` 2026-07-10**  
**Parked branch:** `feat/sfcc-wa-parity` (SFCC parity — resume after rebase onto updated handoff)

### Added

- **BRD Workspace — Phase dropdown (Jira `customfield_21069`)** — per-row Phase selector: Leave unchanged, in Scope, Out Of Scope, Future. Loads from Jira, suggests defaults from WA scope, writes on Send to Jira.
- **Canceled → Out Of Scope workflow** — Sweep no longer transitions BRD subtasks to Canceled. No-signal BRDs default to Leave unchanged + Phase Out Of Scope.
- **Pre-order detector fix** — "Notify me when available" no longer flagged as pre-order (reduces BRD-025 false positives).
- **Returns provider href detection** — Loop / ReturnGO / etc. detected from portal link hrefs, not just visible text (fixes BRD-030 false negatives).
- **WA prompt slim-down** — trimmed crawl summary in prompt; BRD Output includes evidence-only lines.

### Changed

- BRD parser accepts legacy `Status: Canceled` WA lines as Phase Out Of Scope without status transition.
- `.gitignore` excludes `.worktrees/`, local PDFs/decks, and one-off merchant scripts.

## v0.3.0 - 2026-05-18

Platform-aware crawling baseline.

### Added

- Required ecommerce platform selector before each sweep: Shopify, SFCC, GEM / Custom, or Unknown.
- Separate platform profiles for crawl fallbacks, product URL patterns, checkout URL patterns, and checkout selectors.
- Merchant-provided platform context in the generated WA prompt.
- Tests for platform normalization, profile-specific fallbacks, product discovery, checkout evaluation, and prompt context.

### Changed

- Refactored Shopify-heavy crawler and checkout assumptions behind reusable platform profiles.
- Updated checkout type extraction to carry platform-specific checkout labels.
- Removed old DNA workflow code and docs now that BRD Workspace has replaced DNA in the workflow.

### Verified

- `npm run build`
- `npm run lint`
- `npm test -- --run`

## v0.2.0 - 2026-05-18

First serious internal pilot baseline.

### Added

- BRD Workspace flow for reviewing BRD 1-30 rows before Jira updates.
- Manual BRD mode for building editable BRD tables without a completed WA.
- Optional Jira credential persistence through the OS credential store.
- GitHub update workflow for teammate installs.
- Golden BRD regression coverage on the maintainer branch.
- Subtle frontend version label.

### Changed

- Improved Jira update reliability with ADF field payloads and dynamic status transitions.
- Moved Jira send failures closer to the `Send to Jira` action.
- Cleaned stale Anthropic API key UI and unused server endpoints.
- Pruned test files and fixtures from the coworker-facing pilot branch.
- Refreshed README guidance for GitLab/GitHub users.

### Verified

- `npm run build`
- `npm run lint`
- `npm test -- --run` on `main` before the pilot branch test pruning
