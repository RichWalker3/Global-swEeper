# Changelog

Global-sweep uses `major.minor.patch` style versioning during the internal pilot.

## Unreleased

Track work on feature branches not yet merged to `pilot/team-handoff`. See `docs/BRANCH_MERGE_PLAN.md` and `docs/SWEEP_TODO.md`.

**Primary branch:** `pilot/team-handoff`

### Added

- **Local regression suite** — `npm run ci` (build + lint + 18 unit tests), `npm run ci:full` (+ Playwright smoke). See `docs/TESTING.md`.
- **Unit tests** for `composer`, `prompt`, `jira` (mocked fetch), plus existing detector/mapper tests.
- **Optional pre-push hook** — `npm run hooks:install` runs `npm run ci` before push.
- **BRD Workspace — Phase dropdown (Jira `customfield_21069`)** — per-row Phase selector with Jira write on Send.
- **Canceled → Out Of Scope workflow** — no-signal BRDs default to Phase Out Of Scope without Canceled status transitions.
- **Pre-order detector fix** — notify-me back-in-stock no longer flagged as pre-order.
- **Returns provider href detection** — Loop / ReturnGO detected from portal link hrefs.

### Changed

- WA prompt uses trimmed crawl summary and evidence-only BRD Output lines.
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
