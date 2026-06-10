# Changelog

Global-sweep uses `major.minor.patch` style versioning during the internal pilot.

## v0.2.1 - 2026-06-10

Hosted Product Forge deployment fix.

### Fixed

- Routed frontend API and SSE calls through the current app base path so `/sweep` deployments connect to `/sweep/events` and `/sweep/api/*`.

### Added

- Regression coverage for hosted base-path routing.

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
