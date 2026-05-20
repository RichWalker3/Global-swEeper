# Changelog

Global-sweep uses `major.minor.patch` style versioning during the internal pilot.

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
